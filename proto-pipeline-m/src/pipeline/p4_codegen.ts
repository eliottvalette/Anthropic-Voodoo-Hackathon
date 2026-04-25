import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  buildAssetsBlock,
  assertSize,
} from "./assemble.ts";
import { fillPreamble } from "../engine/preamble.ts";
import { GameSpecSchema, type GameSpec } from "../schemas/gameSpec.ts";
import {
  SubsystemBriefsSchema,
  type SubsystemBriefs,
} from "../schemas/subsystemBriefs.ts";
import {
  runP4Subsystems,
  type SubMeta,
  type SubsystemName,
} from "./p4_subsystems.ts";
import { aggregateCreativeSlot } from "./p4_aggregator.ts";
import { runP4Lint } from "./p4_lint.ts";

export type P4Output = {
  htmlPath: string;
  bytes: number;
  meta: {
    totalLatencyMs: number;
    totalTokensIn: number;
    totalTokensOut: number;
    subCalls: SubMeta[];
  };
};

export type P4RunOptions = {
  retryOnly?: SubsystemName[];
};

export async function runP4(
  runId: string,
  assetsDir: string,
  variant = "_default",
  options: P4RunOptions = {},
): Promise<P4Output> {
  const t0 = Date.now();
  const outDir = resolve("outputs", runId);
  await mkdir(outDir, { recursive: true });

  const gameSpec: GameSpec = GameSpecSchema.parse(
    JSON.parse(await readFile(join(outDir, "03_game_spec.json"), "utf8")),
  );
  const briefs: SubsystemBriefs = SubsystemBriefsSchema.parse(
    JSON.parse(await readFile(join(outDir, "03_subsystem_briefs.json"), "utf8")),
  );

  const regenerate = options.retryOnly;
  if (regenerate === undefined) {
    console.log(`[p4] running 5 subsystems x best-of-3 + judge...`);
  } else if (regenerate.length === 0) {
    console.log(`[p4] re-aggregating + re-linting only (no subsystem regeneration)...`);
  } else {
    console.log(`[p4] regenerating subsystems: ${regenerate.join(", ")}`);
  }
  const subs = await runP4Subsystems(runId, variant, regenerate);
  const subCalls: SubMeta[] = [...subs.meta.subCalls];

  console.log(`[p4] aggregating creative slot...`);
  const creativeSlotRaw = aggregateCreativeSlot(gameSpec, subs.winners);
  await writeFile(join(outDir, "04_creative_slot_pre_lint.js"), creativeSlotRaw, "utf8");

  console.log(`[p4] running lint pass...`);
  const lint = await runP4Lint(runId, variant, creativeSlotRaw, gameSpec, briefs);
  subCalls.push(lint.meta);
  const creativeSlot = lint.patchedSource;
  await writeFile(join(outDir, "04_creative_slot.js"), creativeSlot, "utf8");

  const assetsBlock = await buildAssetsBlock(assetsDir, gameSpec.asset_role_map);
  // Embed assets into window.__A so subsystems can read them
  const assetsScript = `(function(){
${assetsBlock}
for (var k in A) window.__A[k] = A[k];
})();`;
  const final = fillPreamble(assetsScript, creativeSlot);
  assertSize(final);

  const htmlPath = join(outDir, "playable.html");
  await writeFile(htmlPath, final, "utf8");

  await writeFile(
    join(outDir, "04_codegen_meta.json"),
    JSON.stringify(
      {
        totalLatencyMs: Date.now() - t0,
        lint_severity: lint.severity,
        lint_patches_applied: lint.patchesApplied,
        lint_patches_skipped: lint.patchesSkipped,
        subCalls,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    htmlPath,
    bytes: Buffer.byteLength(final, "utf8"),
    meta: {
      totalLatencyMs: Date.now() - t0,
      totalTokensIn: subCalls.reduce((s, x) => s + x.tokensIn, 0),
      totalTokensOut: subCalls.reduce((s, x) => s + x.tokensOut, 0),
      subCalls,
    },
  };
}

export async function writeP4(
  runId: string,
  assetsDir: string,
  variant = "_default",
): Promise<P4Output> {
  const outDir = resolve("outputs", runId);
  await mkdir(outDir, { recursive: true });
  return await runP4(runId, assetsDir, variant);
}
