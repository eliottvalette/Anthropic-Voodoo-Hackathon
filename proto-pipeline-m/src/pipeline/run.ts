import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";

import { stampRunId } from "./runId.ts";
import { writeProbe } from "./probe.ts";
import { writeP1 } from "./p1_video.ts";
import { writeP2 } from "./p2_assets.ts";
import { writeP3 } from "./p3_aggregator.ts";
import { runP4 } from "./p4_codegen.ts";
import { verify, buildRetryAddendum, type VerifyTempo } from "./verify.ts";
import { GameSpecSchema } from "../schemas/gameSpec.ts";
import { MergedVideoSchema } from "../schemas/video/merged.ts";
import { ProbeReportSchema } from "../schemas/probe.ts";
import { buildFilenameResolver } from "./assemble.ts";
import type { VerifyReport } from "../schemas/verifyReport.ts";
import {
  SCENE_ELEMENT_NAMES,
  type SceneElementName,
} from "../schemas/p4Plan.ts";

type StageMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  attempt: number;
};

export type RunMeta = {
  runId: string;
  variant: string;
  videoPath: string;
  assetsDir: string;
  startedAt: string;
  endedAt: string;
  totalLatencyMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
  stages: StageMeta[];
  verify: VerifyReport;
  retries: number;
  elementFailCounts: Record<SceneElementName, number>;
  repaired: boolean;
};

const PER_ELEMENT_RETRY_BUDGET = 2;

function failingAsserts(r: VerifyReport): string[] {
  const out: string[] = [];
  if (!r.sizeOk) out.push("size > 5MB");
  if (r.consoleErrors.length) out.push(`console errors: ${r.consoleErrors.slice(0, 2).join(" | ")}`);
  if (!r.canvasNonBlank) out.push("canvas blank after 1.2s");
  if (!r.mraidOk) out.push("mraid.open( not found");
  if (!r.mechanicStringMatch) out.push("mechanic_name string missing in JS");
  if (!r.interactionStateChange) out.push("__engineState.snapshot did not change after tap+drag");
  if (!r.turnLoopObserved) out.push("turn loop not observed");
  if (!r.hpDecreasesOnHit) out.push("HP never decreased on hit");
  if (!r.ctaReachable) out.push("CTA not reachable");
  return out;
}

type Routing = {
  elements: SceneElementName[];
  recomposeOnly: boolean;
};

function routeFailures(r: VerifyReport): Routing {
  const els = new Set<SceneElementName>();
  if (!r.canvasNonBlank) {
    els.add("bg_ground");
    els.add("actors");
  }
  if (!r.interactionStateChange) {
    els.add("actors");
  }
  if (!r.mechanicStringMatch) {
    els.add("actors");
  }
  if (!r.turnLoopObserved) {
    els.add("actors");
    els.add("projectiles");
  }
  if (!r.hpDecreasesOnHit) {
    els.add("projectiles");
    els.add("actors");
  }
  if (!r.ctaReachable) {
    els.add("end_card");
  }
  if (!r.mraidOk) {
    els.add("end_card");
  }
  if (r.consoleErrors.length > 0) {
    SCENE_ELEMENT_NAMES.forEach((n) => els.add(n));
  }
  if (!r.sizeOk) {
    els.add("bg_ground");
  }
  const onlyMechanicMissing =
    !r.mechanicStringMatch &&
    r.canvasNonBlank &&
    r.interactionStateChange &&
    r.mraidOk &&
    r.sizeOk &&
    r.consoleErrors.length === 0 &&
    r.turnLoopObserved &&
    r.hpDecreasesOnHit &&
    r.ctaReachable;
  return {
    elements: Array.from(els),
    recomposeOnly: onlyMechanicMissing,
  };
}

export async function runPipeline(
  requestedRunId: string,
  videoPath: string,
  assetsDir: string,
  variant = "_default",
  maxRetries = 4,
  referenceDir: string | null = null,
): Promise<RunMeta> {
  const runId = await stampRunId(requestedRunId);
  console.log(`[run] runId "${requestedRunId}" stamped → "${runId}"`);
  const t0 = Date.now();
  const startedAt = new Date().toISOString();
  const outDir = resolve("outputs", runId);
  await mkdir(outDir, { recursive: true });

  const stages: StageMeta[] = [];

  console.log(`[run] stage 0: probe`);
  const probeT = Date.now();
  await writeProbe(runId, videoPath, assetsDir);
  stages.push({
    step: "0_probe",
    model: "ffprobe",
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: Date.now() - probeT,
    attempt: 1,
  });

  console.log(`[run] stage 1: P1 video`);
  const p1 = await writeP1(runId, videoPath, variant);
  stages.push(...p1.output.meta.subCalls);

  console.log(`[run] stage 2: P2 assets`);
  const p2 = await writeP2(runId, variant);
  stages.push(...p2.output.meta.subCalls);

  console.log(`[run] stage 3: P3 aggregator`);
  const p3 = await writeP3(runId, variant, referenceDir);
  stages.push(...p3.output.meta.subCalls);

  let gameSpec = GameSpecSchema.parse(
    JSON.parse(await readFile(join(outDir, "03_game_spec.json"), "utf8")),
  );

  try {
    const probe = ProbeReportSchema.parse(
      JSON.parse(await readFile(join(outDir, "00_probe.json"), "utf8")),
    );
    const resolver = buildFilenameResolver(probe);
    const before = { ...gameSpec.asset_role_map };
    const dropped: string[] = [];
    const cleanedRoleMap: Record<string, string | null> = {};
    for (const [role, filename] of Object.entries(before)) {
      if (filename === null) {
        cleanedRoleMap[role] = null;
        continue;
      }
      const relpath = resolver(filename);
      if (relpath) {
        cleanedRoleMap[role] = filename;
      } else {
        cleanedRoleMap[role] = null;
        dropped.push(`${role}=${filename}`);
      }
    }
    if (dropped.length > 0) {
      console.warn(
        `[run] sanitized asset_role_map: ${dropped.length} role(s) had filenames not on disk → set to null:\n  - ${dropped.join("\n  - ")}`,
      );
      gameSpec = { ...gameSpec, asset_role_map: cleanedRoleMap };
      await writeFile(
        join(outDir, "03_game_spec.json"),
        JSON.stringify(gameSpec, null, 2),
        "utf8",
      );
    }
  } catch (e) {
    console.warn(
      `[run] could not sanitize asset_role_map against probe: ${(e as Error).message.slice(0, 200)}`,
    );
  }

  let verifyTempo: VerifyTempo = "real_time";
  try {
    const merged = MergedVideoSchema.parse(
      JSON.parse(await readFile(join(outDir, "01_video.json"), "utf8")),
    );
    if (merged.tempo === "turn_based" || merged.tempo === "async") {
      verifyTempo = merged.tempo;
    }
  } catch {
    /* default to real_time */
  }

  const elementFailCounts: Record<SceneElementName, number> = {
    bg_ground: 0,
    actors: 0,
    projectiles: 0,
    hud: 0,
    end_card: 0,
  };

  console.log(`[run] stage 4: P4 codegen (plan + sketches + final)`);
  let p4 = await runP4(runId, assetsDir, variant, { referenceDir });
  stages.push(...p4.meta.subCalls);
  let repaired = p4.meta.repaired;

  console.log(`[run] verifying...`);
  let report = await verify(p4.htmlPath, gameSpec.mechanic_name, verifyTempo);
  let retries = 0;

  const writeFailureSummary = async (r: typeof report, attempt: number) => {
    if (r.runs) return;
    const failed = failingAsserts(r);
    const addendum = buildRetryAddendum(r);
    const summary = [
      `runId: ${runId}`,
      `attempt: ${attempt}`,
      `failingAsserts: ${failed.join(" | ")}`,
      `phasesSeen: ${(r.trajectory?.phasesSeen ?? []).join(",")}`,
      `turnIndicesSeen: ${(r.trajectory?.turnIndicesSeen ?? []).join(",")}`,
      `inputsTotal: ${r.trajectory?.inputsTotal ?? 0}`,
      `hpDeltaPlayer: ${r.trajectory?.hpDeltaPlayer ?? "null"}`,
      `hpDeltaEnemy: ${r.trajectory?.hpDeltaEnemy ?? "null"}`,
      ``,
      `--- retry addendum ---`,
      addendum,
      ``,
      `--- next step ---`,
      `Invoke the browser-tester agent on this runDir to get a structured fix-hint.`,
    ].join("\n");
    await writeFile(join(outDir, "verify_failure_summary.txt"), summary, "utf8");
  };
  await writeFailureSummary(report, 0);

  while (!report.runs && retries < maxRetries) {
    retries++;
    const routing = routeFailures(report);
    console.warn(
      `[run] verify failed (${failingAsserts(report).join("; ")}). Retry ${retries}/${maxRetries}.`,
    );

    const overBudget = routing.elements.find(
      (e) => elementFailCounts[e] >= PER_ELEMENT_RETRY_BUDGET,
    );
    if (overBudget) {
      console.warn(
        `[run] element "${overBudget}" hit ${PER_ELEMENT_RETRY_BUDGET} strikes — re-running full P4 chain.`,
      );
      p4 = await runP4(runId, assetsDir, variant, { referenceDir });
    } else if (routing.recomposeOnly) {
      console.log(`[run] recomposing only (mechanic marker fix)...`);
      p4 = await runP4(runId, assetsDir, variant, { retryOnly: [], referenceDir });
    } else if (routing.elements.length > 0) {
      console.log(`[run] routing retry to elements: ${routing.elements.join(", ")}`);
      for (const e of routing.elements) elementFailCounts[e]++;
      p4 = await runP4(runId, assetsDir, variant, {
        retryOnly: routing.elements,
        referenceDir,
      });
    } else {
      console.warn(`[run] no specific routing matched — re-running full P4`);
      for (const e of SCENE_ELEMENT_NAMES) elementFailCounts[e]++;
      p4 = await runP4(runId, assetsDir, variant, { referenceDir });
    }
    stages.push(...p4.meta.subCalls.map((m) => ({ ...m, attempt: retries + 1 })));
    repaired = repaired || p4.meta.repaired;
    report = await verify(p4.htmlPath, gameSpec.mechanic_name, verifyTempo);
    await writeFailureSummary(report, retries);
  }

  await writeFile(
    join(outDir, "verify_report.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );

  const endedAt = new Date().toISOString();
  const meta: RunMeta = {
    runId,
    variant,
    videoPath: resolve(videoPath),
    assetsDir: resolve(assetsDir),
    startedAt,
    endedAt,
    totalLatencyMs: Date.now() - t0,
    totalTokensIn: stages.reduce((s, x) => s + x.tokensIn, 0),
    totalTokensOut: stages.reduce((s, x) => s + x.tokensOut, 0),
    stages,
    verify: report,
    retries,
    elementFailCounts,
    repaired,
  };
  await writeFile(
    join(outDir, "_meta.json"),
    JSON.stringify(meta, null, 2),
    "utf8",
  );
  return meta;
}
