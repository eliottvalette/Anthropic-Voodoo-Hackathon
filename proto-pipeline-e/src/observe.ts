import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  uploadFile,
  waitUntilActive,
  generateJson,
  GEMINI_MODELS,
  type ContentPart,
  type GenerateOptions,
  type GenerateResult,
} from "./gemini.ts";

export type ObserveMeta = {
  videoPath: string;
  videoSizeBytes: number;
  model: string;
  mediaResolution: NonNullable<GenerateOptions["mediaResolution"]>;
  uploadMs: number;
  activeMs: number;
  generateMs: number;
  totalMs: number;
  tokensIn: number;
  tokensOut: number;
};

export type ObserveOutput = {
  data: unknown;
  meta: ObserveMeta;
  rawText: string;
};

export async function observeVideo(
  videoPath: string,
  options: { mediaResolution?: GenerateOptions["mediaResolution"]; promptPath?: string; model?: string } = {},
): Promise<ObserveOutput> {
  const mediaResolution = options.mediaResolution ?? "high";
  const model = options.model ?? GEMINI_MODELS.pro;
  const promptPath = options.promptPath ?? resolve("prompts/observe.md");

  const t0 = Date.now();
  const systemInstruction = await readFile(promptPath, "utf8");
  const { size: videoSizeBytes } = await import("node:fs/promises").then((m) =>
    m.stat(videoPath),
  );

  const tUpload = Date.now();
  const file = await uploadFile(videoPath);
  const uploadMs = Date.now() - tUpload;

  const tActive = Date.now();
  await waitUntilActive(file.name);
  const activeMs = Date.now() - tActive;

  const userParts: ContentPart[] = [
    { fileData: { fileUri: file.uri, mimeType: file.mimeType } },
    { text: "Analyze the video per the system instruction. Return ONLY the JSON object." },
  ];

  const tGen = Date.now();
  const r: GenerateResult<unknown> = await generateJson(model, systemInstruction, userParts, {
    mediaResolution,
    temperature: 0.2,
  });
  const generateMs = Date.now() - tGen;

  const meta: ObserveMeta = {
    videoPath: resolve(videoPath),
    videoSizeBytes,
    model: r.model,
    mediaResolution,
    uploadMs,
    activeMs,
    generateMs,
    totalMs: Date.now() - t0,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
  };

  return { data: r.data, meta, rawText: r.rawText };
}
