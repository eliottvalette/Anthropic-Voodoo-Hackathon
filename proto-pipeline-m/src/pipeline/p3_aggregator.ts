import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { z } from "zod";
import {
  generateJson,
  CLAUDE_MODELS,
  type AnthropicContent,
  type GenerateOptions,
  type GenerateResult,
} from "./anthropic.ts";
import {
  AggregatorOutputSchema,
  type AggregatorOutput,
  type GameSpec,
} from "../schemas/gameSpec.ts";
import {
  P3CritiqueSchema,
  type P3Critique,
  P3RoundtripSchema,
  type P3Roundtrip,
} from "../schemas/p3.ts";
import { MergedVideoSchema } from "../schemas/video/merged.ts";
import { VideoDescriptionSchema } from "../schemas/video/description.ts";
import { AssetMappingSchema } from "../schemas/assets.ts";
import { scaffoldCheck, ScaffoldError, HallucinationError, hallucinationCheck, REQUIRED_SECTIONS } from "./scaffoldCheck.ts";

type SubMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  attempt: number;
};

export type P3Output = {
  gameSpec: GameSpec;
  codegenPrompt: string;
  critique: P3Critique;
  roundtrip: P3Roundtrip;
  meta: {
    totalLatencyMs: number;
    totalTokensIn: number;
    totalTokensOut: number;
    subCalls: SubMeta[];
  };
};

async function loadPrompt(variant: string, name: string): Promise<string> {
  return await readFile(resolve("prompts", variant, name), "utf8");
}

function summarizeZodIssues(e: unknown): string {
  if (!(e instanceof z.ZodError)) return "";
  const lines = e.issues.slice(0, 8).map((iss) => {
    const path = iss.path.join(".") || "<root>";
    return `  - ${path}: ${iss.message}`;
  });
  return lines.join("\n");
}

class AssetMapError extends Error {
  constructor(public readonly badEntries: Array<{ role: string; value: string; reason: string }>) {
    super(
      `asset_role_map contains invalid values: ${badEntries
        .map((b) => `${b.role}=${JSON.stringify(b.value)} (${b.reason})`)
        .join("; ")}`,
    );
    this.name = "AssetMapError";
  }
}

function validateAssetRoleMap(
  spec: GameSpec,
  knownFilenames: Set<string>,
): void {
  const bad: Array<{ role: string; value: string; reason: string }> = [];
  for (const [role, value] of Object.entries(spec.asset_role_map)) {
    if (value === null) continue;
    if (typeof value !== "string") {
      bad.push({ role, value: String(value), reason: "non-string" });
      continue;
    }
    if (/[(){}[\]]/.test(value) || /\s—|\s-\s/.test(value) || /^.+\s+\(/.test(value)) {
      bad.push({ role, value, reason: "contains parenthetical or descriptive suffix" });
      continue;
    }
    if (!knownFilenames.has(value)) {
      bad.push({ role, value, reason: "filename not in evidence.assets.roles[].filename" });
    }
  }
  if (bad.length > 0) throw new AssetMapError(bad);
}

async function callJson<T>(
  step: string,
  schema: z.ZodType<T>,
  systemInstruction: string,
  userText: string,
  options: GenerateOptions = {},
): Promise<{ result: GenerateResult<unknown>; data: T; meta: SubMeta }> {
  const userParts: AnthropicContent[] = [{ type: "text", text: userText }];
  let attempt = 0;
  let lastErr: unknown;
  let sys = systemInstruction;
  const maxAttempts = 3;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      const r = await generateJson(CLAUDE_MODELS.sonnet, sys, userParts, options);
      const parsed = schema.parse(r.data);
      return {
        result: r,
        data: parsed,
        meta: {
          step,
          model: CLAUDE_MODELS.sonnet,
          tokensIn: r.tokensIn,
          tokensOut: r.tokensOut,
          latencyMs: r.latencyMs,
          attempt,
        },
      };
    } catch (e) {
      lastErr = e;
      console.warn(`[p3] ${step} attempt ${attempt} failed: ${(e as Error).message.slice(0, 250)}`);
      if (attempt >= maxAttempts) break;
      const issueSummary = summarizeZodIssues(e);
      const issueBlock = issueSummary
        ? `\n\nValidation issues (fix EVERY ONE):\n${issueSummary}`
        : "";
      sys =
        systemInstruction +
        `\n\nThe previous response failed schema validation. Re-emit ONLY a JSON object exactly matching the schema. No markdown fences.` +
        issueBlock +
        `\n\nReminders:\n` +
        `  - All timestamps in defining_hook_evidence_timestamps and tutorial_loss_evidence_timestamps MUST be strings formatted "MM:SS-MM:SS" (e.g. "00:03-00:07"). Never numbers.\n` +
        `  - If defining_hook is non-null, defining_hook_evidence_timestamps must contain at least one such string.\n` +
        `  - If defining_hook is null, defining_hook_evidence_timestamps must be the empty array [].\n` +
        `  - If tutorial_loss_at_seconds is non-null, tutorial_loss_evidence_timestamps must contain at least one such string.\n` +
        `  - If tutorial_loss_at_seconds is null, tutorial_loss_evidence_timestamps must be the empty array [].\n` +
        `  - mechanic_name must match /^[a-z][a-z0-9_]*$/ (snake_case).`;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function callAggregator(
  systemBase: string,
  userText: string,
  evidenceTexts: Array<string | null | undefined>,
  knownFilenames: Set<string>,
): Promise<{ data: AggregatorOutput; meta: SubMeta }> {
  let attempt = 0;
  let lastErr: unknown;
  let sys = systemBase;
  const maxAttempts = 3;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      const r = await generateJson<AggregatorOutput>(CLAUDE_MODELS.sonnet, sys, [
        { type: "text", text: userText },
      ]);
      const parsed = AggregatorOutputSchema.parse(r.data);
      scaffoldCheck(parsed.codegen_prompt, parsed.game_spec.mechanic_name);
      hallucinationCheck(parsed.codegen_prompt, evidenceTexts);
      validateAssetRoleMap(parsed.game_spec, knownFilenames);
      return {
        data: parsed,
        meta: {
          step: "3_aggregator",
          model: CLAUDE_MODELS.sonnet,
          tokensIn: r.tokensIn,
          tokensOut: r.tokensOut,
          latencyMs: r.latencyMs,
          attempt,
        },
      };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[p3] aggregator attempt ${attempt} failed: ${msg.slice(0, 300)}`);
      if (attempt >= maxAttempts) break;
      let reminder: string;
      if (e instanceof ScaffoldError) {
        reminder = `Your codegen_prompt was missing required sections (${e.missing.join(", ")}). Re-emit JSON with codegen_prompt that contains EVERY section header verbatim, in order: ${REQUIRED_SECTIONS.join(" / ")}.`;
      } else if (e instanceof HallucinationError) {
        reminder = `Your codegen_prompt used mechanic words (${e.triggers.join(", ")}) that are NOT visible in the evidence (video.timeline / mechanics / defining_hook). Remove these claims. If the video does not show a special behavior, prefer a generic-but-correct description over an invented one.`;
      } else if (e instanceof AssetMapError) {
        const bullets = e.badEntries
          .map((b) => `  - "${b.role}": current value ${JSON.stringify(b.value)} — ${b.reason}`)
          .join("\n");
        const sample = Array.from(knownFilenames).slice(0, 8).join(", ");
        reminder = `Your asset_role_map contains invalid entries:\n${bullets}\n\nValues MUST be EXACT bare filenames from evidence.assets.roles[].filename — examples: ${sample}. No parentheticals, no descriptions, no quotes-inside-string, no annotations. If a role has no asset, the value is null.`;
      } else {
        const issueSummary = summarizeZodIssues(e);
        const issueBlock = issueSummary
          ? `\n\nValidation issues (fix EVERY ONE):\n${issueSummary}`
          : "";
        reminder =
          `The previous response failed schema validation. Re-emit ONLY a JSON object {"game_spec": ..., "codegen_prompt": "..."} that exactly matches the schema. snake_case mechanic_name. No markdown fences.` +
          issueBlock +
          `\n\nReminders:\n` +
          `  - All timestamps in defining_hook_evidence_timestamps and tutorial_loss_evidence_timestamps MUST be strings formatted "MM:SS-MM:SS" (e.g. "00:03-00:07"). Never numbers.\n` +
          `  - If defining_hook is non-null, defining_hook_evidence_timestamps must contain at least one such string.\n` +
          `  - If defining_hook is null, defining_hook_evidence_timestamps must be the empty array [].\n` +
          `  - If tutorial_loss_at_seconds is non-null, tutorial_loss_evidence_timestamps must contain at least one such string.\n` +
          `  - If tutorial_loss_at_seconds is null, tutorial_loss_evidence_timestamps must be the empty array [].`;
      }
      sys = systemBase + "\n\n" + reminder;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function runP3(
  runId: string,
  variant = "_default",
  referenceDir: string | null = null,
): Promise<P3Output> {
  const t0 = Date.now();
  const outDir = resolve("outputs", runId);

  const merged = MergedVideoSchema.parse(
    JSON.parse(await readFile(join(outDir, "01_video.json"), "utf8")),
  );
  const assets = AssetMappingSchema.parse(
    JSON.parse(await readFile(join(outDir, "02_assets.json"), "utf8")),
  );
  let description: unknown = null;
  try {
    description = VideoDescriptionSchema.parse(
      JSON.parse(await readFile(join(outDir, "01_description.json"), "utf8")),
    );
  } catch {
    description = null;
  }

  const subCalls: SubMeta[] = [];
  let reference: unknown = null;
  if (referenceDir) {
    try {
      const expectedPath = join(resolve(referenceDir), "expected_behavior.json");
      const manifestPath = join(resolve(referenceDir), "target_manifest.json");
      const expected = JSON.parse(await readFile(expectedPath, "utf8"));
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      reference = {
        viewport: manifest?.viewport ?? null,
        mechanic: manifest?.mechanic ?? null,
        expected_behavior: expected,
      };
      console.log(`[p3] reference loaded from ${referenceDir}`);
    } catch (e) {
      console.warn(`[p3] reference dir given but unreadable: ${(e as Error).message}`);
    }
  }
  const videoEvidence: Record<string, unknown> = { ...(merged as unknown as Record<string, unknown>) };
  if (description) videoEvidence.description = description;
  const evidence: Record<string, unknown> = { video: videoEvidence, assets };
  if (reference) evidence.reference = reference;

  const aggSystem = await loadPrompt(variant, "3_aggregator.md");
  const critic = await loadPrompt(variant, "3_critic.md");
  const rewriter = await loadPrompt(variant, "3_rewriter.md");
  const roundtrip = await loadPrompt(variant, "3_roundtrip.md");

  const evidenceTexts: Array<string | null | undefined> = [
    merged.summary_one_sentence,
    merged.defining_hook,
    JSON.stringify(merged.core_loop),
    JSON.stringify(merged.characters_or_props),
    JSON.stringify(merged.hud),
    JSON.stringify(merged),
  ];
  if (description) {
    const d = description as { narrative?: string; key_moments?: unknown };
    if (d.narrative) evidenceTexts.push(d.narrative);
    if (d.key_moments) evidenceTexts.push(JSON.stringify(d.key_moments));
  }

  const knownFilenames = new Set<string>();
  for (const r of assets.roles) {
    if (r.filename) knownFilenames.add(r.filename);
  }

  console.log(`[p3] stage A: aggregator...`);
  const agg = await callAggregator(
    aggSystem,
    JSON.stringify(evidence, null, 2),
    evidenceTexts,
    knownFilenames,
  );
  subCalls.push(agg.meta);

  console.log(`[p3] stage A.5: critic...`);
  const critiqueCall = await callJson(
    "3_critique",
    P3CritiqueSchema,
    critic,
    JSON.stringify({ candidate: agg.data, evidence }, null, 2),
    { temperature: 0.2 },
  );
  subCalls.push(critiqueCall.meta);

  let finalAgg: AggregatorOutput = agg.data;
  if (critiqueCall.data.overall_severity !== "none") {
    console.log(`[p3] rewriting (severity=${critiqueCall.data.overall_severity})...`);
    const rewriteCall = await callJson(
      "3_rewrite",
      AggregatorOutputSchema,
      rewriter,
      JSON.stringify({ original: agg.data, critique: critiqueCall.data, evidence }, null, 2),
      { temperature: 0.2 },
    );
    scaffoldCheck(
      rewriteCall.data.codegen_prompt,
      rewriteCall.data.game_spec.mechanic_name,
    );
    try {
      validateAssetRoleMap(rewriteCall.data.game_spec, knownFilenames);
    } catch (e) {
      if (e instanceof AssetMapError) {
        console.warn(
          `[p3] rewrite produced invalid asset_role_map; salvaging by copying values from original. ${e.message.slice(0, 200)}`,
        );
        rewriteCall.data.game_spec.asset_role_map = {
          ...agg.data.game_spec.asset_role_map,
        };
      } else {
        throw e;
      }
    }
    finalAgg = rewriteCall.data;
    subCalls.push(rewriteCall.meta);
  }

  console.log(`[p3] stage C: round-trip validation...`);
  const roundtripCall = await callJson(
    "3_roundtrip",
    P3RoundtripSchema,
    roundtrip,
    JSON.stringify(
      {
        game_spec: finalAgg.game_spec,
        original_summary: merged.summary_one_sentence,
      },
      null,
      2,
    ),
    { temperature: 0.2 },
  );
  subCalls.push(roundtripCall.meta);

  if (roundtripCall.data.drift_severity !== "none") {
    console.warn(
      `[p3] roundtrip drift=${roundtripCall.data.drift_severity}. Missing: ${roundtripCall.data.missing_concepts.join("; ")}`,
    );
  }

  return {
    gameSpec: finalAgg.game_spec,
    codegenPrompt: finalAgg.codegen_prompt,
    critique: critiqueCall.data,
    roundtrip: roundtripCall.data,
    meta: {
      totalLatencyMs: Date.now() - t0,
      totalTokensIn: subCalls.reduce((s, x) => s + x.tokensIn, 0),
      totalTokensOut: subCalls.reduce((s, x) => s + x.tokensOut, 0),
      subCalls,
    },
  };
}

export async function writeP3(
  runId: string,
  variant = "_default",
  referenceDir: string | null = null,
): Promise<{ outDir: string; output: P3Output }> {
  const outDir = resolve("outputs", runId);
  await mkdir(outDir, { recursive: true });
  const output = await runP3(runId, variant, referenceDir);
  await writeFile(
    join(outDir, "03_game_spec.json"),
    JSON.stringify(output.gameSpec, null, 2),
    "utf8",
  );
  await writeFile(
    join(outDir, "03_codegen_prompt.txt"),
    output.codegenPrompt,
    "utf8",
  );
  await writeFile(
    join(outDir, "03_critique.json"),
    JSON.stringify(output.critique, null, 2),
    "utf8",
  );
  await writeFile(
    join(outDir, "03_roundtrip.json"),
    JSON.stringify(output.roundtrip, null, 2),
    "utf8",
  );
  await writeFile(
    join(outDir, "03_aggregator_meta.json"),
    JSON.stringify(output.meta, null, 2),
    "utf8",
  );
  return { outDir, output };
}
