import { stat, readFile } from "node:fs/promises";
import { basename } from "node:path";
import { GEMINI_API_KEY } from "./env.ts";

const API_BASE = "https://generativelanguage.googleapis.com";

export type UploadedFile = { name: string; uri: string; mimeType: string };

export type GenerateResult<T = unknown> = {
  data: T;
  rawText: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  model: string;
};

export type ContentPart =
  | { text: string }
  | { fileData: { fileUri: string; mimeType: string } };

export type GenerateOptions = {
  temperature?: number;
  responseMimeType?: string;
  mediaResolution?: "low" | "medium" | "high";
};

const MEDIA_RES_MAP = {
  low: "MEDIA_RESOLUTION_LOW",
  medium: "MEDIA_RESOLUTION_MEDIUM",
  high: "MEDIA_RESOLUTION_HIGH",
} as const;

function inferMime(path: string): string {
  const p = path.toLowerCase();
  if (p.endsWith(".mp4")) return "video/mp4";
  if (p.endsWith(".mov")) return "video/quicktime";
  if (p.endsWith(".webm")) return "video/webm";
  return "application/octet-stream";
}

export async function uploadFile(filePath: string): Promise<UploadedFile> {
  const size = (await stat(filePath)).size;
  const mime = inferMime(filePath);
  const name = basename(filePath);
  const initRes = await fetch(
    `${API_BASE}/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(size),
        "X-Goog-Upload-Header-Content-Type": mime,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: name } }),
    },
  );
  if (!initRes.ok) throw new Error(`upload init ${initRes.status}: ${await initRes.text()}`);
  const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("missing X-Goog-Upload-URL header");
  const bytes = await readFile(filePath);
  const finRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  });
  if (!finRes.ok) throw new Error(`upload finalize ${finRes.status}: ${await finRes.text()}`);
  const j = (await finRes.json()) as {
    file?: { name?: string; uri?: string; mimeType?: string };
  };
  if (!j.file?.name || !j.file.uri) throw new Error(`bad upload response: ${JSON.stringify(j)}`);
  return { name: j.file.name, uri: j.file.uri, mimeType: j.file.mimeType ?? mime };
}

export async function waitUntilActive(fileName: string, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${API_BASE}/v1beta/${fileName}?key=${GEMINI_API_KEY}`);
    if (!res.ok) throw new Error(`status ${res.status}: ${await res.text()}`);
    const j = (await res.json()) as { state?: string };
    if (j.state === "ACTIVE") return;
    if (j.state === "FAILED") throw new Error("file processing FAILED");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`file ${fileName} did not become ACTIVE within ${timeoutMs}ms`);
}

async function generateJsonOnce<T>(
  model: string,
  systemInstruction: string,
  userParts: ContentPart[],
  options: GenerateOptions,
): Promise<GenerateResult<T>> {
  const url = `${API_BASE}/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: userParts }],
    generationConfig: {
      responseMimeType: options.responseMimeType ?? "application/json",
      temperature: options.temperature ?? 0.4,
      ...(options.mediaResolution
        ? { mediaResolution: MEDIA_RES_MAP[options.mediaResolution] }
        : {}),
    },
  };
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`generate ${model} ${res.status}: ${errText}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const j = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error(`empty response from ${model}: ${JSON.stringify(j)}`);
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch (e) {
    throw new Error(`non-JSON from ${model}: ${(e as Error).message}\n${text.slice(0, 500)}`);
  }
  return {
    data,
    rawText: text,
    tokensIn: j.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: j.usageMetadata?.candidatesTokenCount ?? 0,
    latencyMs,
    model,
  };
}

export async function generateJson<T = unknown>(
  model: string,
  systemInstruction: string,
  userParts: ContentPart[],
  options: GenerateOptions = {},
): Promise<GenerateResult<T>> {
  const fallbacks =
    model === GEMINI_MODELS.pro ? [GEMINI_MODELS.pro, GEMINI_MODELS.proFallback] : [model];
  let lastErr: unknown;
  for (let m = 0; m < fallbacks.length; m++) {
    const target = fallbacks[m]!;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        return await generateJsonOnce<T>(target, systemInstruction, userParts, options);
      } catch (e) {
        lastErr = e;
        const status = (e as Error & { status?: number }).status ?? 0;
        const transient = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
        if (!transient) throw e;
        if (attempt === 5) {
          if (m < fallbacks.length - 1) {
            console.warn(`[gemini] ${target} exhausted retries, falling back to ${fallbacks[m + 1]}`);
            break;
          }
          throw e;
        }
        const wait = Math.min(60000, 2000 * Math.pow(2, attempt - 1));
        console.warn(`[gemini] ${target} ${status}; retrying in ${wait}ms (attempt ${attempt}/5)`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export const GEMINI_MODELS = {
  pro: "gemini-pro-latest",
  proFallback: "gemini-2.5-pro",
  flash: "gemini-2.5-flash",
} as const;
