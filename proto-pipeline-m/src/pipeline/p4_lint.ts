import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { z } from "zod";
import { generateJson, MODELS } from "./gemini.ts";
import type { GameSpec } from "../schemas/gameSpec.ts";
import type { SubsystemBriefs } from "../schemas/subsystemBriefs.ts";

export type LintMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  attempt: number;
};

export type LintResult = {
  patchedSource: string;
  patchesApplied: number;
  patchesSkipped: Array<{ reason: string; issue: string }>;
  severity: "none" | "minor" | "major";
  meta: LintMeta;
};

const PatchSchema = z
  .object({
    issue: z.string(),
    find: z.string().min(1),
    replace: z.string(),
  })
  .passthrough();

const LintResponseSchema = z
  .object({
    patches: z.array(PatchSchema).default([]),
    severity: z.enum(["none", "minor", "major"]).default("none"),
  })
  .passthrough();

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    const next = haystack.indexOf(needle, idx);
    if (next === -1) break;
    count++;
    idx = next + needle.length;
  }
  return count;
}

export async function runP4Lint(
  runId: string,
  variant: string,
  creativeSlot: string,
  gameSpec: GameSpec,
  briefs: SubsystemBriefs,
): Promise<LintResult> {
  const outDir = resolve("outputs", runId);
  const systemInstruction = await readFile(
    resolve("prompts", variant, "4_lint.md"),
    "utf8",
  );
  const userPayload = JSON.stringify(
    {
      creative_slot: creativeSlot,
      briefs: briefs.briefs,
      shared_state_shape: briefs.shared_state_shape,
      mechanic_name: gameSpec.mechanic_name,
    },
    null,
    2,
  );
  const r = await generateJson(MODELS.pro, systemInstruction, [{ text: userPayload }], {
    temperature: 0.2,
  });
  const parsed = LintResponseSchema.parse(r.data);

  let out = creativeSlot;
  let applied = 0;
  const skipped: Array<{ reason: string; issue: string }> = [];
  let revertedDueToParseFailure = false;
  for (const p of parsed.patches) {
    const occ = countOccurrences(out, p.find);
    if (occ === 0) {
      skipped.push({ reason: "find not present", issue: p.issue });
      continue;
    }
    if (occ > 1) {
      skipped.push({ reason: `find occurs ${occ} times`, issue: p.issue });
      continue;
    }
    const candidate = out.replace(p.find, p.replace);
    try {
      new Function(`"use strict"; ${candidate}`);
    } catch (e) {
      skipped.push({
        reason: `patch breaks parse: ${(e as Error).message.slice(0, 120)}`,
        issue: p.issue,
      });
      continue;
    }
    out = candidate;
    applied++;
  }
  try {
    new Function(`"use strict"; ${out}`);
  } catch (e) {
    revertedDueToParseFailure = true;
    out = creativeSlot;
    applied = 0;
    skipped.push({
      reason: `final parse failed (${(e as Error).message.slice(0, 120)}) — reverted all patches`,
      issue: "post_lint_parse_check",
    });
  }

  await writeFile(
    join(outDir, "04_lint_report.json"),
    JSON.stringify(
      {
        severity: parsed.severity,
        patches_proposed: parsed.patches.length,
        patches_applied: applied,
        patches_skipped: skipped,
        reverted_due_to_parse_failure: revertedDueToParseFailure,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    patchedSource: out,
    patchesApplied: applied,
    patchesSkipped: skipped,
    severity: parsed.severity,
    meta: {
      step: "4_lint",
      model: MODELS.pro,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      latencyMs: r.latencyMs,
      attempt: 1,
    },
  };
}
