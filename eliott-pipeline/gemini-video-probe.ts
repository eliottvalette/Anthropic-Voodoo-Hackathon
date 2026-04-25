#!/usr/bin/env node

import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

type UploadedFile = {
  name: string;
  uri: string;
  mimeType: string;
  state?: string;
};

type Args = {
  video?: string;
  model: string;
  prompt: string;
  outDir: string;
  fps?: number;
  listModels: boolean;
  help: boolean;
};

const apiBase = "https://generativelanguage.googleapis.com";
const defaultModel = "gemini-3.1-pro-preview";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const defaultPrompt = join(scriptDir, "prompts", "castle_clashers_probe.md");

function usage(): string {
  return [
    "Usage:",
    "  node eliott-pipeline/gemini-video-probe.ts --video <path> [--out-dir <dir>]",
    "  node eliott-pipeline/gemini-video-probe.ts --list-models",
    "",
    "Options:",
    `  --model <id>       Default: ${defaultModel}`,
    `  --prompt <path>    Default: ${defaultPrompt}`,
    "  --fps <number>     Optional Gemini video sampling FPS",
    "  --out-dir <dir>    Default: eliott-pipeline/runs/latest",
  ].join("\n");
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    model: defaultModel,
    prompt: defaultPrompt,
    outDir: "eliott-pipeline/runs/latest",
    listModels: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    switch (arg) {
      case "--video":
        args.video = requireValue(arg, next);
        index += 1;
        break;
      case "--model":
        args.model = requireValue(arg, next);
        index += 1;
        break;
      case "--prompt":
        args.prompt = requireValue(arg, next);
        index += 1;
        break;
      case "--out-dir":
        args.outDir = requireValue(arg, next);
        index += 1;
        break;
      case "--fps":
        args.fps = Number(requireValue(arg, next));
        if (!Number.isFinite(args.fps) || args.fps <= 0) {
          throw new Error("--fps must be a positive number.");
        }
        index += 1;
        break;
      case "--list-models":
        args.listModels = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  return args;
}

function requireValue(name: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

async function loadApiKey(): Promise<string> {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }

  const envPath = join(repoRoot, ".env");
  if (!existsSync(envPath)) {
    throw new Error("GEMINI_API_KEY is not set and .env was not found.");
  }

  const envText = await readFile(envPath, "utf8");
  for (const line of envText.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#") || !line.includes("=")) {
      continue;
    }
    const [name, ...rest] = line.split("=");
    if (name.trim() === "GEMINI_API_KEY") {
      const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
      if (value) {
        return value;
      }
    }
  }

  throw new Error("GEMINI_API_KEY was not found in .env.");
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

async function listModels(apiKey: string): Promise<JsonObject> {
  const { json } = await requestJson(`${apiBase}/v1beta/models`, { apiKey });
  return json;
}

async function uploadFile(apiKey: string, videoPath: string): Promise<UploadedFile> {
  const absolutePath = resolve(videoPath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Video not found: ${absolutePath}`);
  }

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

async function getFile(apiKey: string, fileName: string): Promise<JsonObject> {
  const encodedName = fileName.split("/").map(encodeURIComponent).join("/");
  const { json } = await requestJson(`${apiBase}/v1beta/${encodedName}`, { apiKey });
  return json;
}

async function waitUntilActive(apiKey: string, uploaded: UploadedFile): Promise<UploadedFile> {
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
    await sleep(5000);
  }

  throw new Error(`Timed out waiting for file to become ACTIVE; last state=${lastState ?? "unknown"}.`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function evidenceItemSchema(): JsonObject {
  return {
    type: "OBJECT",
    properties: {
      timestamp: { type: "STRING" },
      observation: { type: "STRING" },
      confidence: { type: "NUMBER" },
    },
    required: ["timestamp", "observation", "confidence"],
    propertyOrdering: ["timestamp", "observation", "confidence"],
  };
}

function analysisSchema(): JsonObject {
  const stringArray = { type: "ARRAY", items: { type: "STRING" } };
  return {
    type: "OBJECT",
    properties: {
      summary: { type: "STRING" },
      objective: { type: "STRING" },
      controls: { type: "ARRAY", items: evidenceItemSchema() },
      layout: { type: "ARRAY", items: evidenceItemSchema() },
      entities: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING" },
            role: { type: "STRING" },
            visible_behavior: { type: "STRING" },
            asset_match: { type: "STRING" },
            confidence: { type: "NUMBER" },
          },
          required: ["name", "role", "visible_behavior", "asset_match", "confidence"],
          propertyOrdering: ["name", "role", "visible_behavior", "asset_match", "confidence"],
        },
      },
      timeline: { type: "ARRAY", items: evidenceItemSchema() },
      mechanics: { type: "ARRAY", items: evidenceItemSchema() },
      visual_requirements: stringArray,
      prototype_must_have: stringArray,
      prototype_can_skip: stringArray,
      implementation_notes: stringArray,
      uncertainties: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            question: { type: "STRING" },
            why_it_matters: { type: "STRING" },
            confidence: { type: "NUMBER" },
          },
          required: ["question", "why_it_matters", "confidence"],
          propertyOrdering: ["question", "why_it_matters", "confidence"],
        },
      },
    },
    required: [
      "summary",
      "objective",
      "controls",
      "layout",
      "entities",
      "timeline",
      "mechanics",
      "visual_requirements",
      "prototype_must_have",
      "prototype_can_skip",
      "implementation_notes",
      "uncertainties",
    ],
    propertyOrdering: [
      "summary",
      "objective",
      "controls",
      "layout",
      "entities",
      "timeline",
      "mechanics",
      "visual_requirements",
      "prototype_must_have",
      "prototype_can_skip",
      "implementation_notes",
      "uncertainties",
    ],
  };
}

async function generateAnalysis(
  apiKey: string,
  options: {
    model: string;
    uploaded: UploadedFile;
    prompt: string;
    fps?: number;
  },
): Promise<JsonObject> {
  const filePart: JsonObject = {
    file_data: {
      mime_type: options.uploaded.mimeType,
      file_uri: options.uploaded.uri,
    },
  };
  if (options.fps !== undefined) {
    filePart.videoMetadata = { fps: options.fps };
  }

  const payload = {
    contents: [
      {
        role: "user",
        parts: [filePart, { text: options.prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: analysisSchema(),
    },
  };

  const { json } = await requestJson(`${apiBase}/v1beta/models/${options.model}:generateContent`, {
    apiKey,
    method: "POST",
    payload,
  });
  return json;
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

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const apiKey = await loadApiKey();

  if (args.listModels) {
    console.log(JSON.stringify(await listModels(apiKey), null, 2));
    return;
  }

  if (!args.video) {
    throw new Error(`--video is required unless --list-models is used.\n\n${usage()}`);
  }

  await mkdir(args.outDir, { recursive: true });
  const prompt = await readFile(args.prompt, "utf8");

  console.log(`Uploading ${args.video}...`);
  const uploaded = await uploadFile(apiKey, args.video);
  const activeFile = await waitUntilActive(apiKey, uploaded);
  await writeJson(join(args.outDir, "uploaded_file.json"), activeFile);

  console.log(`Analyzing with ${args.model}...`);
  const response = await generateAnalysis(apiKey, {
    model: args.model,
    uploaded: activeFile,
    prompt,
    fps: args.fps,
  });
  await writeJson(join(args.outDir, "raw_response.json"), response);

  const text = extractText(response);
  await writeFile(join(args.outDir, "analysis_text.json"), text, "utf8");

  try {
    await writeJson(join(args.outDir, "analysis.json"), JSON.parse(text));
  } catch {
    console.warn("Warning: response text was not parseable JSON; see analysis_text.json");
  }

  console.log(`Saved Gemini analysis to ${args.outDir}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
