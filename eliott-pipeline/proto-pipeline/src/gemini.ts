import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";

export type JsonObject = Record<string, unknown>;

export type UploadedFile = {
  name: string;
  uri: string;
  mimeType: string;
  state?: string;
};

const apiBase = "https://generativelanguage.googleapis.com";

export async function listModels(apiKey: string): Promise<JsonObject> {
  const { json } = await requestJson(`${apiBase}/v1beta/models`, { apiKey });
  return json;
}

export async function uploadFile(apiKey: string, videoPath: string): Promise<UploadedFile> {
  const absolutePath = resolve(videoPath);
  const fileStats = await stat(absolutePath);
  const mimeType = mimeTypeForPath(absolutePath);

  const start = await requestJson(`${apiBase}/upload/v1beta/files`, {
    apiKey,
    method: "POST",
    payload: { file: { display_name: absolutePath.split("/").at(-1) ?? "video" } },
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(fileStats.size),
      "X-Goog-Upload-Header-Content-Type": mimeType,
    },
  });

  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Gemini did not return an upload URL.");
  }

  const bytes = await readFile(absolutePath);
  const uploaded = await requestJson(uploadUrl, {
    apiKey,
    method: "POST",
    body: new Blob([bytes], { type: mimeType }),
    headers: {
      "Content-Length": String(fileStats.size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      "Content-Type": mimeType,
    },
  });

  const file = uploaded.json.file as JsonObject | undefined;
  if (!file || typeof file.name !== "string" || typeof file.uri !== "string") {
    throw new Error(`Unexpected upload response: ${JSON.stringify(uploaded.json)}`);
  }

  return {
    name: file.name,
    uri: file.uri,
    mimeType: typeof file.mimeType === "string" ? file.mimeType : mimeType,
    state: typeof file.state === "string" ? file.state : undefined,
  };
}

export async function waitUntilActive(apiKey: string, uploaded: UploadedFile): Promise<UploadedFile> {
  const deadline = Date.now() + 10 * 60 * 1000;
  let lastState = uploaded.state;

  while (Date.now() < deadline) {
    const info = await getFile(apiKey, uploaded.name);
    const file = (info.file ?? info) as JsonObject;
    const state = typeof file.state === "string" ? file.state : undefined;
    lastState = state;

    if (!state || state === "ACTIVE") {
      return {
        name: String(file.name),
        uri: String(file.uri),
        mimeType: typeof file.mimeType === "string" ? file.mimeType : uploaded.mimeType,
        state,
      };
    }
    if (state === "FAILED") {
      throw new Error(`Gemini file processing failed for ${uploaded.name}.`);
    }
    await sleep(3000);
  }

  throw new Error(`Timed out waiting for file to become ACTIVE; last state=${lastState ?? "unknown"}.`);
}

export async function generateJson(
  apiKey: string,
  options: {
    model: string;
    prompt: string;
    uploaded?: UploadedFile;
    fps?: number;
  },
): Promise<JsonObject> {
  const parts: JsonObject[] = [];
  if (options.uploaded) {
    const filePart: JsonObject = {
      file_data: {
        mime_type: options.uploaded.mimeType,
        file_uri: options.uploaded.uri,
      },
    };
    if (options.fps !== undefined) {
      filePart.videoMetadata = { fps: options.fps };
    }
    parts.push(filePart);
  }
  parts.push({ text: options.prompt });

  const payload = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  };

  const model = options.model.startsWith("models/") ? options.model : `models/${options.model}`;
  const { json } = await requestJson(`${apiBase}/v1beta/${model}:generateContent`, {
    apiKey,
    method: "POST",
    payload,
  });
  return json;
}

export function extractJsonObject(response: JsonObject, label: string): JsonObject {
  const text = extractText(response).trim();
  if (!text) {
    throw new Error(`${label}: Gemini response has no text candidate.`);
  }
  const parsed = JSON.parse(stripCodeFence(text)) as unknown;
  if (isJsonObject(parsed)) {
    return parsed;
  }
  if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isJsonObject)) {
    return {
      ...parsed[0],
      ...(parsed.length > 1 ? { alternatives_from_model: parsed.slice(1) } : {}),
      _normalization_note: `Gemini returned a top-level array for ${label}; normalized to object.`,
    };
  }
  throw new Error(`${label}: expected JSON object, got ${Array.isArray(parsed) ? "array" : typeof parsed}.`);
}

function extractText(response: JsonObject): string {
  const candidates = Array.isArray(response.candidates) ? response.candidates : [];
  const chunks: string[] = [];
  for (const candidate of candidates) {
    const content = (candidate as JsonObject).content as JsonObject | undefined;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    for (const part of parts) {
      const text = (part as JsonObject).text;
      if (typeof text === "string") {
        chunks.push(text);
      }
    }
  }
  return chunks.join("\n");
}

function stripCodeFence(text: string): string {
  const lines = text.trim().split(/\r?\n/);
  if (lines[0]?.startsWith("```")) {
    lines.shift();
  }
  if (lines.at(-1)?.startsWith("```")) {
    lines.pop();
  }
  return lines.join("\n").trim();
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getFile(apiKey: string, fileName: string): Promise<JsonObject> {
  const encodedName = fileName.split("/").map(encodeURIComponent).join("/");
  const { json } = await requestJson(`${apiBase}/v1beta/${encodedName}`, { apiKey });
  return json;
}

async function requestJson(
  url: string,
  options: {
    apiKey: string;
    method?: string;
    payload?: JsonObject;
    headers?: Record<string, string>;
    body?: BodyInit;
  },
): Promise<{ json: JsonObject; headers: Headers }> {
  const headers = new Headers(options.headers);
  headers.set("x-goog-api-key", options.apiKey);

  let body = options.body;
  if (options.payload) {
    body = JSON.stringify(options.payload);
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from Gemini API: ${text}`);
  }
  return { json: text ? (JSON.parse(text) as JsonObject) : {}, headers: response.headers };
}

function mimeTypeForPath(path: string): string {
  const ext = extname(path).toLowerCase();
  const types: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".mpeg": "video/mpeg",
    ".mpg": "video/mpeg",
    ".webm": "video/webm",
    ".avi": "video/avi",
    ".wmv": "video/wmv",
  };
  return types[ext] ?? "application/octet-stream";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

