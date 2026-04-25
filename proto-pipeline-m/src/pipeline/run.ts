import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";

import { stampRunId } from "./runId.ts";
import { writeProbe } from "./probe.ts";
import { writeP1 } from "./p1_video.ts";
import { writeP2 } from "./p2_assets.ts";
import { writeP3 } from "./p3_aggregator.ts";
import { runP4 } from "./p4_codegen.ts";
import { runP4Legacy } from "./p4_legacy.ts";
import type { SubsystemName } from "./p4_subsystems.ts";
import { verify } from "./verify.ts";
import { GameSpecSchema } from "../schemas/gameSpec.ts";
import type { VerifyReport } from "../schemas/verifyReport.ts";

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
  subsystemFailCounts: Record<SubsystemName, number>;
  monolithicFallbackUsed: boolean;
};

const SUBSYSTEM_NAMES: SubsystemName[] = ["input", "physics", "render", "state", "winloss"];
const PER_SUBSYSTEM_RETRY_BUDGET = 2;

function failingAsserts(r: VerifyReport): string[] {
  const out: string[] = [];
  if (!r.sizeOk) out.push("size > 5MB");
  if (r.consoleErrors.length) out.push(`console errors: ${r.consoleErrors.slice(0, 2).join(" | ")}`);
  if (!r.canvasNonBlank) out.push("canvas blank after 1.2s");
  if (!r.mraidOk) out.push("mraid.open( not found");
  if (!r.mechanicStringMatch) out.push("mechanic_name string missing in JS");
  if (!r.interactionStateChange) out.push("__engineState.snapshot did not change after tap+drag");
  return out;
}

type Routing = {
  subsystems: SubsystemName[];
  reaggregateOnly: boolean;
};

function routeFailures(r: VerifyReport): Routing {
  const subs = new Set<SubsystemName>();
  if (!r.canvasNonBlank) subs.add("render");
  if (!r.interactionStateChange) {
    subs.add("input");
    subs.add("state");
  }
  if (!r.mraidOk) subs.add("winloss");
  if (r.consoleErrors.length > 0) {
    SUBSYSTEM_NAMES.forEach((n) => subs.add(n));
  }
  if (!r.sizeOk) {
    subs.add("render");
    subs.add("state");
  }
  const onlyMechanicMissing =
    !r.mechanicStringMatch &&
    r.canvasNonBlank &&
    r.interactionStateChange &&
    r.mraidOk &&
    r.sizeOk &&
    r.consoleErrors.length === 0;
  return {
    subsystems: Array.from(subs),
    reaggregateOnly: onlyMechanicMissing,
  };
}

export async function runPipeline(
  requestedRunId: string,
  videoPath: string,
  assetsDir: string,
  variant = "_default",
  maxRetries = 4,
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
  const p3 = await writeP3(runId, variant);
  stages.push(...p3.output.meta.subCalls);

  const gameSpec = GameSpecSchema.parse(
    JSON.parse(await readFile(join(outDir, "03_game_spec.json"), "utf8")),
  );

  const subsystemFailCounts: Record<SubsystemName, number> = {
    input: 0,
    physics: 0,
    render: 0,
    state: 0,
    winloss: 0,
  };
  let monolithicFallbackUsed = false;

  console.log(`[run] stage 4: P4 codegen (attempt 1, modular)`);
  let p4 = await runP4(runId, assetsDir, variant);
  stages.push(...p4.meta.subCalls);

  console.log(`[run] verifying...`);
  let report = await verify(p4.htmlPath, gameSpec.mechanic_name);
  let retries = 0;

  while (!report.runs && retries < maxRetries) {
    retries++;
    const routing = routeFailures(report);
    console.warn(
      `[run] verify failed (${failingAsserts(report).join("; ")}). Retry ${retries}/${maxRetries}.`,
    );

    const overBudget = routing.subsystems.find(
      (s) => subsystemFailCounts[s] >= PER_SUBSYSTEM_RETRY_BUDGET,
    );
    if (overBudget && !monolithicFallbackUsed) {
      console.warn(
        `[run] subsystem "${overBudget}" hit ${PER_SUBSYSTEM_RETRY_BUDGET} strikes — falling back to monolithic codegen.`,
      );
      monolithicFallbackUsed = true;
      const failedAtBudget = SUBSYSTEM_NAMES.filter(
        (s) => subsystemFailCounts[s] >= PER_SUBSYSTEM_RETRY_BUDGET,
      );
      const legacy = await runP4Legacy(runId, assetsDir, variant, failedAtBudget);
      stages.push(...legacy.meta.subCalls.map((m) => ({ ...m, attempt: retries + 1 })));
      report = await verify(legacy.htmlPath, gameSpec.mechanic_name);
      continue;
    }

    if (routing.reaggregateOnly) {
      console.log(`[run] re-aggregating only (mechanic marker fix)...`);
      p4 = await runP4(runId, assetsDir, variant, { retryOnly: [] });
    } else if (routing.subsystems.length > 0) {
      console.log(`[run] routing retry to subsystems: ${routing.subsystems.join(", ")}`);
      for (const s of routing.subsystems) subsystemFailCounts[s]++;
      p4 = await runP4(runId, assetsDir, variant, { retryOnly: routing.subsystems });
    } else {
      console.warn(`[run] no specific routing matched — re-running all subsystems`);
      for (const s of SUBSYSTEM_NAMES) subsystemFailCounts[s]++;
      p4 = await runP4(runId, assetsDir, variant);
    }
    stages.push(...p4.meta.subCalls.map((m) => ({ ...m, attempt: retries + 1 })));
    report = await verify(p4.htmlPath, gameSpec.mechanic_name);
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
    subsystemFailCounts,
    monolithicFallbackUsed,
  };
  await writeFile(
    join(outDir, "_meta.json"),
    JSON.stringify(meta, null, 2),
    "utf8",
  );
  return meta;
}
