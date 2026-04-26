import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { buildAssetsBlock, assertSize } from "./assemble.ts";
import { fillPreamble } from "../engine/preamble.ts";
import { GameSpecSchema, type GameSpec } from "../schemas/gameSpec.ts";
import { writeP4Plan } from "./p4_plan.ts";
import {
  writeP4Sketches,
  runP4Sketches,
} from "./p4_sketch.ts";
import { writeP4Final, runP4Final } from "./p4_final.ts";
import {
  P4PlanSchema,
  type P4Plan,
  SCENE_ELEMENT_NAMES,
  type SceneElementName,
} from "../schemas/p4Plan.ts";
import {
  P4SketchSchema,
  type P4Sketch,
} from "../schemas/p4Sketch.ts";

export type SubMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  attempt: number;
};

export type P4Output = {
  htmlPath: string;
  bytes: number;
  meta: {
    totalLatencyMs: number;
    totalTokensIn: number;
    totalTokensOut: number;
    subCalls: SubMeta[];
    repaired: boolean;
  };
};

export type P4RunOptions = {
  retryOnly?: SceneElementName[];
  referenceDir?: string | null;
};

async function loadExistingPlan(runId: string): Promise<P4Plan | null> {
  try {
    const raw = await readFile(
      join(resolve("outputs", runId), "04_plan.json"),
      "utf8",
    );
    return P4PlanSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function loadExistingSketches(
  runId: string,
): Promise<Record<SceneElementName, P4Sketch> | null> {
  try {
    const raw = await readFile(
      join(resolve("outputs", runId), "04_sketches.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw);
    const out = {} as Record<SceneElementName, P4Sketch>;
    for (const el of SCENE_ELEMENT_NAMES) {
      out[el] = P4SketchSchema.parse(parsed[el]);
    }
    return out;
  } catch {
    return null;
  }
}

async function assembleHtml(
  runId: string,
  assetsDir: string,
  gameSpec: GameSpec,
  creativeSlot: string,
): Promise<{ htmlPath: string; bytes: number }> {
  const outDir = resolve("outputs", runId);
  const assetsBlock = await buildAssetsBlock(assetsDir, gameSpec.asset_role_map);
  const assetsScript = `(function(){
${assetsBlock}
for (var k in A) window.__A[k] = A[k];
})();`;
  const final = fillPreamble(assetsScript, creativeSlot);
  assertSize(final);
  const htmlPath = join(outDir, "playable.html");
  await writeFile(htmlPath, final, "utf8");
  return { htmlPath, bytes: Buffer.byteLength(final, "utf8") };
}

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

  const subCalls: SubMeta[] = [];
  const referenceDir = options.referenceDir ?? null;
  const retryOnly = options.retryOnly;

  let existingPlan = await loadExistingPlan(runId);
  if (!existingPlan || retryOnly === undefined) {
    console.log(`[p4] running plan stage...`);
    const planOut = await writeP4Plan(runId, variant, referenceDir);
    subCalls.push(planOut.meta);
    existingPlan = planOut.plan;
  } else {
    console.log(`[p4] reusing existing 04_plan.json (retryOnly=${retryOnly.join(",") || "(none)"})`);
  }

  let sketches = await loadExistingSketches(runId);
  if (!sketches || retryOnly === undefined) {
    console.log(`[p4] running 5 sketches in parallel...`);
    const sketchOut = await writeP4Sketches(runId, variant, referenceDir);
    subCalls.push(...sketchOut.metas);
    sketches = sketchOut.sketches;
  } else if (retryOnly.length > 0) {
    console.log(`[p4] re-running sketches: ${retryOnly.join(", ")}`);
    const partial = await runP4Sketches(runId, variant, referenceDir);
    for (const el of retryOnly) {
      sketches[el] = partial.sketches[el];
      const m = partial.metas.find((x) => x.step === `4_sketch_${el}`);
      if (m) subCalls.push(m);
    }
    await writeFile(
      join(outDir, "04_sketches.json"),
      JSON.stringify(sketches, null, 2),
      "utf8",
    );
  } else {
    console.log(`[p4] reusing existing sketches (recompose only)`);
  }

  console.log(`[p4] running final stage (compose + integration check)...`);
  let finalOut;
  if (retryOnly === undefined) {
    finalOut = await writeP4Final(runId, variant);
  } else {
    finalOut = await runP4Final(runId, variant);
    await writeFile(
      join(outDir, "04_creative_slot.js"),
      finalOut.creativeSlot,
      "utf8",
    );
    await writeFile(
      join(outDir, "04_integration_report.json"),
      JSON.stringify(finalOut.integrationReport, null, 2),
      "utf8",
    );
  }
  subCalls.push(...finalOut.metas);

  const { htmlPath, bytes } = await assembleHtml(
    runId,
    assetsDir,
    gameSpec,
    finalOut.creativeSlot,
  );

  const totalLatencyMs = Date.now() - t0;
  await writeFile(
    join(outDir, "04_codegen_meta.json"),
    JSON.stringify(
      {
        totalLatencyMs,
        repaired: finalOut.repaired,
        integration_findings: finalOut.integrationReport.findings.length,
        subCalls,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    htmlPath,
    bytes,
    meta: {
      totalLatencyMs,
      totalTokensIn: subCalls.reduce((s, x) => s + x.tokensIn, 0),
      totalTokensOut: subCalls.reduce((s, x) => s + x.tokensOut, 0),
      subCalls,
      repaired: finalOut.repaired,
    },
  };
}

export async function writeP4(
  runId: string,
  assetsDir: string,
  variant = "_default",
  referenceDir: string | null = null,
): Promise<P4Output> {
  const outDir = resolve("outputs", runId);
  await mkdir(outDir, { recursive: true });
  return await runP4(runId, assetsDir, variant, { referenceDir });
}
