import { stat, readFile } from "node:fs/promises";
import { basename } from "node:path";
import { GEMINI_API_KEY } from "../env.ts";

const API_BASE = "https://generativelanguage.googleapis.com";

export type UploadedFile = {
  name: string;
  uri: string;
  mimeType: string;
};

export type GenerateResult<T = unknown> = {
  data: T;
  rawText: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  model: string;
};

function inferMime(path: string): string {
  const p = path.toLowerCase();
  if (p.endsWith(".mp4")) return "video/mp4";
  if (p.endsWith(".mov")) return "video/quicktime";
  if (p.endsWith(".webm")) return "video/webm";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".mp3")) return "audio/mpeg";
  if (p.endsWith(".ogg")) return "audio/ogg";
  if (p.endsWith(".wav")) return "audio/wav";
  return "application/octet-stream";
}

export async function uploadFile(
  filePath: string,
  displayName?: string,
): Promise<UploadedFile> {
  const size = (await stat(filePath)).size;
  const mime = inferMime(filePath);
  const name = displayName ?? basename(filePath);

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
  if (!initRes.ok) {
    throw new Error(
      `File upload init failed ${initRes.status}: ${await initRes.text()}`,
    );
  }
  const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("Missing X-Goog-Upload-URL header");

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
  if (!finRes.ok) {
    throw new Error(
      `File upload finalize failed ${finRes.status}: ${await finRes.text()}`,
    );
  }
  const finJson = (await finRes.json()) as {
    file?: { name?: string; uri?: string; mimeType?: string };
  };
  const file = finJson.file;
  if (!file?.name || !file.uri) {
    throw new Error(`Bad file upload response: ${JSON.stringify(finJson)}`);
  }
  return { name: file.name, uri: file.uri, mimeType: file.mimeType ?? mime };
}

export async function waitUntilActive(
  fileName: string,
  timeoutMs = 180_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(
      `${API_BASE}/v1beta/${fileName}?key=${GEMINI_API_KEY}`,
    );
    if (!res.ok) {
      throw new Error(
        `File status check failed ${res.status}: ${await res.text()}`,
      );
    }
    const j = (await res.json()) as { state?: string };
    if (j.state === "ACTIVE") return;
    if (j.state === "FAILED") throw new Error(`File processing FAILED`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`File ${fileName} did not become ACTIVE within ${timeoutMs}ms`);
}

export type ContentPart =
  | { text: string }
  | { fileData: { fileUri: string; mimeType: string } };

export async function generateJson<T = unknown>(
  model: string,
  systemInstruction: string,
  userParts: ContentPart[],
): Promise<GenerateResult<T>> {
  const url = `${API_BASE}/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: userParts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.4,
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
    throw new Error(`generateContent ${model} ${res.status}: ${await res.text()}`);
  }
  const j = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) {
    throw new Error(`Empty response from ${model}: ${JSON.stringify(j)}`);
  }
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch (e) {
    throw new Error(
      `Non-JSON response from ${model}: ${(e as Error).message}\nRaw: ${text.slice(0, 500)}`,
    );
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

export const MODELS = {
  flash: "gemini-3.1-pro-preview",
  pro: "gemini-3.1-pro-preview",
} as const;
