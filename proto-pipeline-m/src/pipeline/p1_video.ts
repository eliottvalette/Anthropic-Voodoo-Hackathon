import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { z } from "zod";
import {
  uploadFile,
  waitUntilActive,
  generateJson,
  generateJsonProWithFallback,
  MODELS,
  type ContentPart,
  type GenerateResult,
  type GenerateOptions,
} from "./gemini.ts";
import {
  generateJson as generateJsonClaude,
  imagePartFromPath,
  getActiveClaudeModel,
  type AnthropicContent,
} from "./anthropic.ts";
import { TimelineSchema, type Timeline } from "../schemas/video/timeline.ts";
import { MechanicsSchema, type Mechanics } from "../schemas/video/mechanics.ts";
import { VisualUiSchema, type VisualUi } from "../schemas/video/visualUi.ts";
import {
  MergedVideoSchema,
  type MergedVideo,
  ContactSheetAnalysisSchema,
  type ContactSheetAnalysis,
  AlternateInterpretationSchema,
  type AlternateInterpretation,
  P1dCritiqueSchema,
  type P1dCritique,
} from "../schemas/video/merged.ts";
import {
  VideoDescriptionSchema,
  type VideoDescription,
} from "../schemas/video/description.ts";
import { ProbeReportSchema } from "../schemas/probe.ts";
import { buildContactSheet } from "./p1_contact_sheet.ts";

type PromptVariant = string;

async function loadPrompt(variant: PromptVariant, name: string): Promise<string> {
  const p = resolve("prompts", variant, name);
  return await readFile(p, "utf8");
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

type SubMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  attempt: number;
};

async function runGeminiVideoWithRetry<T>(
  step: string,
  schema: z.ZodType<T>,
  systemInstruction: string,
  userParts: ContentPart[],
  options: GenerateOptions = {},
): Promise<{ result: GenerateResult<unknown>; data: T; meta: SubMeta }> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < 2) {
    attempt++;
    try {
      const r = await generateJsonProWithFallback(systemInstruction, userParts, options);
      const parsed = schema.parse(r.data);
      return {
        result: r,
        data: parsed,
        meta: {
          step,
          model: r.model,
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

async function runClaudeWithRetry<T>(
  step: string,
  schema: z.ZodType<T>,
  systemInstruction: string,
  userParts: AnthropicContent[],
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<{ data: T; meta: SubMeta }> {
  let attempt = 0;
  let lastErr: unknown;
  let sys = systemInstruction;
  while (attempt < 2) {
    attempt++;
    try {
      const model = getActiveClaudeModel();
      const r = await generateJsonClaude(model, sys, userParts, options);
      const parsed = schema.parse(r.data);
      return {
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
      sys =
        systemInstruction +
        `\n\nThe previous response failed JSON schema validation. Re-emit ONLY a JSON object that exactly matches the schema, no markdown, no prose.`;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function readAssetFilenames(outDir: string): Promise<string[] | null> {
  const probePath = join(outDir, "00_probe.json");
  if (!(await exists(probePath))) return null;
  try {
    const raw = JSON.parse(await readFile(probePath, "utf8"));
    const probe = ProbeReportSchema.parse(raw);
    return probe.assets.map((a) => a.filename);
  } catch {
    return null;
  }
}

export type P1Output = {
  merged: MergedVideo;
  description: VideoDescription;
  contactSheet: ContactSheetAnalysis | null;
  critique: P1dCritique | null;
  alternate: AlternateInterpretation | null;
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
    description: VideoDescription;
  };
};

export async function runP1(
  videoPath: string,
  variant: PromptVariant = "_default",
  outDir?: string,
): Promise<P1Output> {
  const t0 = Date.now();
  const [p1a, p1b, p1c, p1d, p1e, p1dCritic, p1dRewriter, p1f, p1g] = await Promise.all([
    loadPrompt(variant, "1a_timeline.md"),
    loadPrompt(variant, "1b_mechanics.md"),
    loadPrompt(variant, "1c_visual_ui.md"),
    loadPrompt(variant, "1d_merge.md"),
    loadPrompt(variant, "1e_contact_sheet.md"),
    loadPrompt(variant, "1d_critic.md"),
    loadPrompt(variant, "1d_rewriter.md"),
    loadPrompt(variant, "1f_alternate.md"),
    loadPrompt(variant, "1g_description.md"),
  ]);

  const assetFilenames = outDir ? await readAssetFilenames(outDir) : null;
  const sheetPath = outDir
    ? join(outDir, "01_contact_sheet.png")
    : null;

  console.log(`[p1] uploading video and building contact sheet in parallel...`);
  const sheetTask = sheetPath
    ? buildContactSheet(videoPath, sheetPath).catch((e) => {
        console.warn(`[p1] contact sheet failed: ${(e as Error).message.slice(0, 200)} — continuing without it`);
        return null;
      })
    : Promise.resolve(null);

  const [file, sheet] = await Promise.all([
    uploadFile(videoPath),
    sheetTask,
  ]);
  console.log(`[p1] video uploaded as ${file.name}, waiting until ACTIVE...`);
  await waitUntilActive(file.name);

  const filePart: ContentPart = {
    fileData: { fileUri: file.uri, mimeType: file.mimeType },
  };
  const userParts: ContentPart[] = [
    filePart,
    { text: "Analyze the video per the system instruction." },
  ];

  console.log(`[p1] running 1a/1b/1c/1e/1g in parallel...`);
  const sheetClaudeParts: AnthropicContent[] | null = sheet
    ? [
        await imagePartFromPath(sheet.pngPath),
        { type: "text", text: "Analyze this 4x4 contact sheet per the system instruction. Cells are numbered left-to-right, top-to-bottom (1..16)." },
      ]
    : null;

  const videoOpts: GenerateOptions = { mediaResolution: "high" };
  const [a, b, c, e, g] = await Promise.all([
    runGeminiVideoWithRetry("1a_timeline", TimelineSchema, p1a, userParts, videoOpts),
    runGeminiVideoWithRetry("1b_mechanics", MechanicsSchema, p1b, userParts, videoOpts),
    runGeminiVideoWithRetry("1c_visual_ui", VisualUiSchema, p1c, userParts, videoOpts),
    sheetClaudeParts
      ? runClaudeWithRetry(
          "1e_contact_sheet",
          ContactSheetAnalysisSchema,
          p1e,
          sheetClaudeParts,
        )
      : Promise.resolve(null),
    runGeminiVideoWithRetry("1g_description", VideoDescriptionSchema, p1g, userParts, videoOpts),
  ]);

  console.log(`[p1] sub-calls done. Merging on Claude...`);

  const mergeInput: Record<string, unknown> = {
    description: g.data,
    timeline: a.data,
    mechanics: b.data,
    visual_ui: c.data,
  };
  if (e) mergeInput.contact_sheet = e.data;
  if (assetFilenames && assetFilenames.length > 0) {
    mergeInput.asset_filenames = assetFilenames;
  }

  const m = await runClaudeWithRetry(
    "1d_merge",
    MergedVideoSchema,
    p1d,
    [{ type: "text", text: JSON.stringify(mergeInput, null, 2) }],
  );

  console.log(`[p1] critique pass...`);
  const critiqueInput = JSON.stringify(
    { merged: m.data, evidence: mergeInput },
    null,
    2,
  );
  const critique = await runClaudeWithRetry(
    "1d_critique",
    P1dCritiqueSchema,
    p1dCritic,
    [{ type: "text", text: critiqueInput }],
    { temperature: 0.2 },
  );

  let finalMerged: MergedVideo = m.data;
  let rewriteMeta: SubMeta | null = null;
  if (critique.data.overall_severity !== "none") {
    console.log(`[p1] rewriting (severity=${critique.data.overall_severity})...`);
    const rewriteInput = JSON.stringify(
      { original: m.data, critique: critique.data, evidence: mergeInput },
      null,
      2,
    );
    const r = await runClaudeWithRetry(
      "1d_rewrite",
      MergedVideoSchema,
      p1dRewriter,
      [{ type: "text", text: rewriteInput }],
      { temperature: 0.2 },
    );
    finalMerged = r.data;
    rewriteMeta = r.meta;
  }

  console.log(`[p1] alternate-interpretation pass (separate context)...`);
  const alt = await runClaudeWithRetry(
    "1f_alternate",
    AlternateInterpretationSchema,
    p1f,
    [{ type: "text", text: JSON.stringify(finalMerged, null, 2) }],
    { temperature: 0.4 },
  );

  const subCalls: SubMeta[] = [a.meta, b.meta, c.meta, g.meta];
  if (e) subCalls.push(e.meta);
  subCalls.push(m.meta, critique.meta);
  if (rewriteMeta) subCalls.push(rewriteMeta);
  subCalls.push(alt.meta);

  return {
    merged: finalMerged,
    description: g.data,
    contactSheet: e ? e.data : null,
    critique: critique.data,
    alternate: alt.data,
    meta: {
      totalLatencyMs: Date.now() - t0,
      totalTokensIn: subCalls.reduce((s, x) => s + x.tokensIn, 0),
      totalTokensOut: subCalls.reduce((s, x) => s + x.tokensOut, 0),
      subCalls,
    },
    rawSubResults: {
      timeline: a.data as Timeline,
      mechanics: b.data as Mechanics,
      visualUi: c.data as VisualUi,
      description: g.data as VideoDescription,
    },
  };
}

export async function writeP1(
  runId: string,
  videoPath: string,
  variant: PromptVariant = "_default",
): Promise<{ outDir: string; output: P1Output }> {
  const outDir = resolve("outputs", runId);
  await mkdir(outDir, { recursive: true });
  const output = await runP1(videoPath, variant, outDir);
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
  await writeFile(
    join(outDir, "01_description.json"),
    JSON.stringify(output.description, null, 2),
    "utf8",
  );
  if (output.contactSheet) {
    await writeFile(
      join(outDir, "01_contact_sheet.json"),
      JSON.stringify(output.contactSheet, null, 2),
      "utf8",
    );
  }
  if (output.critique) {
    await writeFile(
      join(outDir, "01_critique.json"),
      JSON.stringify(output.critique, null, 2),
      "utf8",
    );
  }
  if (output.alternate) {
    await writeFile(
      join(outDir, "01_alternate.json"),
      JSON.stringify(output.alternate, null, 2),
      "utf8",
    );
  }
  return { outDir, output };
}
