import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { z } from "zod";
import {
  uploadFile,
  waitUntilActive,
  generateJson,
  MODELS,
  type ContentPart,
  type GenerateResult,
} from "./gemini.ts";
import { TimelineSchema, type Timeline } from "../schemas/video/timeline.ts";
import { MechanicsSchema, type Mechanics } from "../schemas/video/mechanics.ts";
import { VisualUiSchema, type VisualUi } from "../schemas/video/visualUi.ts";
import { MergedVideoSchema, type MergedVideo } from "../schemas/video/merged.ts";

type PromptVariant = string;

async function loadPrompt(variant: PromptVariant, name: string): Promise<string> {
  const p = resolve("prompts", variant, name);
  return await readFile(p, "utf8");
}

type SubMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  attempt: number;
};

async function runWithRetry<T>(
  step: string,
  model: string,
  schema: z.ZodType<T>,
  systemInstruction: string,
  userParts: ContentPart[],
): Promise<{ result: GenerateResult<unknown>; data: T; meta: SubMeta }> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < 2) {
    attempt++;
    try {
      const r = await generateJson(model, systemInstruction, userParts);
      const parsed = schema.parse(r.data);
      return {
        result: r,
        data: parsed,
        meta: {
          step,
          model,
          tokensIn: r.tokensIn,
          tokensOut: r.tokensOut,
          latencyMs: r.latencyMs,
          attempt,
        },
      };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `[p1] ${step} attempt ${attempt} failed: ${msg.slice(0, 200)}`,
      );
      if (attempt >= 2) break;
      systemInstruction =
        systemInstruction +
        `\n\nThe previous response failed JSON schema validation. Re-emit ONLY a JSON object that exactly matches the schema, no markdown, no prose.`;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export type P1Output = {
  merged: MergedVideo;
  meta: {
    totalLatencyMs: number;
    totalTokensIn: number;
    totalTokensOut: number;
    subCalls: SubMeta[];
  };
  rawSubResults: {
    timeline: Timeline;
    mechanics: Mechanics;
    visualUi: VisualUi;
  };
};

export async function runP1(
  videoPath: string,
  variant: PromptVariant = "_default",
): Promise<P1Output> {
  const t0 = Date.now();
  const [p1a, p1b, p1c, p1d] = await Promise.all([
    loadPrompt(variant, "1a_timeline.md"),
    loadPrompt(variant, "1b_mechanics.md"),
    loadPrompt(variant, "1c_visual_ui.md"),
    loadPrompt(variant, "1d_merge.md"),
  ]);

  console.log(`[p1] uploading ${videoPath}...`);
  const file = await uploadFile(videoPath);
  console.log(`[p1] uploaded as ${file.name}, waiting until ACTIVE...`);
  await waitUntilActive(file.name);
  console.log(`[p1] file ACTIVE, running 1a/1b/1c in parallel on Flash...`);

  const filePart: ContentPart = {
    fileData: { fileUri: file.uri, mimeType: file.mimeType },
  };
  const userParts: ContentPart[] = [
    filePart,
    { text: "Analyze the video per the system instruction." },
  ];

  const [a, b, c] = await Promise.all([
    runWithRetry("1a_timeline", MODELS.flash, TimelineSchema, p1a, userParts),
    runWithRetry("1b_mechanics", MODELS.flash, MechanicsSchema, p1b, userParts),
    runWithRetry("1c_visual_ui", MODELS.flash, VisualUiSchema, p1c, userParts),
  ]);

  console.log(`[p1] sub-calls done. Merging on Pro...`);

  const mergeUserText = JSON.stringify(
    {
      timeline: a.data,
      mechanics: b.data,
      visual_ui: c.data,
    },
    null,
    2,
  );
  const mergeUserParts: ContentPart[] = [{ text: mergeUserText }];

  const m = await runWithRetry(
    "1d_merge",
    MODELS.pro,
    MergedVideoSchema,
    p1d,
    mergeUserParts,
  );

  const subCalls = [a.meta, b.meta, c.meta, m.meta];
  return {
    merged: m.data,
    meta: {
      totalLatencyMs: Date.now() - t0,
      totalTokensIn: subCalls.reduce((s, x) => s + x.tokensIn, 0),
      totalTokensOut: subCalls.reduce((s, x) => s + x.tokensOut, 0),
      subCalls,
    },
    rawSubResults: { timeline: a.data, mechanics: b.data, visualUi: c.data },
  };
}

export async function writeP1(
  runId: string,
  videoPath: string,
  variant: PromptVariant = "_default",
): Promise<{ outDir: string; output: P1Output }> {
  const outDir = resolve("outputs", runId);
  await mkdir(outDir, { recursive: true });
  const output = await runP1(videoPath, variant);
  await writeFile(
    join(outDir, "01_video.json"),
    JSON.stringify(output.merged, null, 2),
    "utf8",
  );
  await writeFile(
    join(outDir, "01_video_meta.json"),
    JSON.stringify(output.meta, null, 2),
    "utf8",
  );
  await writeFile(
    join(outDir, "01_video_subs.json"),
    JSON.stringify(output.rawSubResults, null, 2),
    "utf8",
  );
  return { outDir, output };
}
