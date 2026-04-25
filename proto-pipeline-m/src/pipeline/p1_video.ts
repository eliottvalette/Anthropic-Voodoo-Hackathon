import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { z } from "zod";
import {
  uploadFile,
  waitUntilActive,
  generateJson,
  MODELS,
  type ContentPart,
  type GenerateResult,
  type GenerateOptions,
} from "./gemini.ts";
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

async function runWithRetry<T>(
  step: string,
  model: string,
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
      const r = await generateJson(model, systemInstruction, userParts, options);
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
  };
};

export async function runP1(
  videoPath: string,
  variant: PromptVariant = "_default",
  outDir?: string,
): Promise<P1Output> {
  const t0 = Date.now();
  const [p1a, p1b, p1c, p1d, p1e, p1dCritic, p1dRewriter, p1f] = await Promise.all([
    loadPrompt(variant, "1a_timeline.md"),
    loadPrompt(variant, "1b_mechanics.md"),
    loadPrompt(variant, "1c_visual_ui.md"),
    loadPrompt(variant, "1d_merge.md"),
    loadPrompt(variant, "1e_contact_sheet.md"),
    loadPrompt(variant, "1d_critic.md"),
    loadPrompt(variant, "1d_rewriter.md"),
    loadPrompt(variant, "1f_alternate.md"),
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

  const sheetUpload = sheet
    ? await uploadFile(sheet.pngPath).catch((e) => {
        console.warn(`[p1] contact sheet upload failed: ${(e as Error).message.slice(0, 200)}`);
        return null;
      })
    : null;
  if (sheetUpload) {
    await waitUntilActive(sheetUpload.name).catch(() => {
      // upload of static images is usually instant; ignore wait failures
    });
  }

  const filePart: ContentPart = {
    fileData: { fileUri: file.uri, mimeType: file.mimeType },
  };
  const userParts: ContentPart[] = [
    filePart,
    { text: "Analyze the video per the system instruction." },
  ];

  console.log(`[p1] running 1a/1b/1c/1e in parallel...`);
  const sheetCallParts: ContentPart[] | null = sheetUpload
    ? [
        { fileData: { fileUri: sheetUpload.uri, mimeType: sheetUpload.mimeType } },
        { text: "Analyze this 4x4 contact sheet per the system instruction. Cells are numbered left-to-right, top-to-bottom (1..16)." },
      ]
    : null;

  const [a, b, c, e] = await Promise.all([
    runWithRetry("1a_timeline", MODELS.flash, TimelineSchema, p1a, userParts),
    runWithRetry("1b_mechanics", MODELS.flash, MechanicsSchema, p1b, userParts),
    runWithRetry("1c_visual_ui", MODELS.flash, VisualUiSchema, p1c, userParts),
    sheetCallParts
      ? runWithRetry(
          "1e_contact_sheet",
          MODELS.flash,
          ContactSheetAnalysisSchema,
          p1e,
          sheetCallParts,
        )
      : Promise.resolve(null),
  ]);

  console.log(`[p1] sub-calls done. Merging on Pro...`);

  const mergeInput: Record<string, unknown> = {
    timeline: a.data,
    mechanics: b.data,
    visual_ui: c.data,
  };
  if (e) mergeInput.contact_sheet = e.data;
  if (assetFilenames && assetFilenames.length > 0) {
    mergeInput.asset_filenames = assetFilenames;
  }

  const mergeUserParts: ContentPart[] = [
    { text: JSON.stringify(mergeInput, null, 2) },
  ];

  const m = await runWithRetry(
    "1d_merge",
    MODELS.pro,
    MergedVideoSchema,
    p1d,
    mergeUserParts,
  );

  console.log(`[p1] critique pass...`);
  const critiqueInput = JSON.stringify(
    { merged: m.data, evidence: mergeInput },
    null,
    2,
  );
  const critique = await runWithRetry(
    "1d_critique",
    MODELS.pro,
    P1dCritiqueSchema,
    p1dCritic,
    [{ text: critiqueInput }],
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
    const r = await runWithRetry(
      "1d_rewrite",
      MODELS.pro,
      MergedVideoSchema,
      p1dRewriter,
      [{ text: rewriteInput }],
      { temperature: 0.2 },
    );
    finalMerged = r.data;
    rewriteMeta = r.meta;
  }

  console.log(`[p1] alternate-interpretation pass (separate context)...`);
  const alt = await runWithRetry(
    "1f_alternate",
    MODELS.pro,
    AlternateInterpretationSchema,
    p1f,
    [{ text: JSON.stringify(finalMerged, null, 2) }],
    { temperature: 0.4 },
  );

  const subCalls: SubMeta[] = [a.meta, b.meta, c.meta];
  if (e) subCalls.push(e.meta);
  subCalls.push(m.meta, critique.meta);
  if (rewriteMeta) subCalls.push(rewriteMeta);
  subCalls.push(alt.meta);

  return {
    merged: finalMerged,
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
