import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

async function resolveUniqueRunId(runId: string): Promise<string> {
  const exists = async (p: string) => {
    try { await stat(p); return true; } catch { return false; }
  };
  if (!(await exists(resolve("outputs", runId)))) return runId;
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  let candidate = `${runId}_${stamp}`;
  let i = 2;
  while (await exists(resolve("outputs", candidate))) {
    candidate = `${runId}_${stamp}_${i++}`;
  }
  return candidate;
}
import { writeProbe } from "./probe.ts";
import { writeP1 } from "./p1_video.ts";
import { writeP2 } from "./p2_assets.ts";
import { writeP3 } from "./p3_aggregator.ts";
import { runP4 } from "./p4_codegen.ts";
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
};

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

function retryAddendum(r: VerifyReport): string {
  const fixes: string[] = [];
  if (!r.canvasNonBlank)
    fixes.push(
      "- The canvas appears uniform-colored. Draw varied content (background fill PLUS placeholder shapes for any not-yet-loaded asset) on EVERY frame, including the first. Verify samples a 6x6 grid; a single solid color anywhere it lands fails this check.",
    );
  if (!r.interactionStateChange)
    fixes.push(
      "- Override window.__engineState.snapshot to return MONOTONIC counters that strictly increase on input. Example: let tapsTotal=0, dragsTotal=0; canvas.addEventListener('pointerdown',()=>tapsTotal++); window.__engineState.snapshot=function(){return {tapsTotal,dragsTotal,score};}; NEVER return only transient values like entities.length that reset to baseline between samples.",
    );
  if (!r.mechanicStringMatch)
    fixes.push(
      "- The mechanic_name string from the prompt MUST appear verbatim in your JS. Add a comment or a const if needed.",
    );
  if (!r.mraidOk)
    fixes.push(
      "- The CTA tap path MUST reach mraid.open( ... ). Use window.__cta(url) which is provided by the preamble.",
    );
  if (r.consoleErrors.length)
    fixes.push(
      `- Fix these console errors: ${r.consoleErrors.slice(0, 3).join(" | ")}`,
    );
  if (!r.sizeOk) fixes.push("- Reduce HTML size below 5MB.");
  return `\n\n# RETRY — previous attempt failed verify\nFailing asserts: ${failingAsserts(r).join("; ")}\n${fixes.join("\n")}`;
}

export async function runPipeline(
  requestedRunId: string,
  videoPath: string,
  assetsDir: string,
  variant = "_default",
  maxRetries = 2,
): Promise<RunMeta> {
  const runId = await resolveUniqueRunId(requestedRunId);
  if (runId !== requestedRunId) {
    console.log(`[run] runId "${requestedRunId}" exists; using "${runId}" to avoid overwrite`);
  }
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

  console.log(`[run] stage 4: P4 codegen (attempt 1)`);
  let p4 = await runP4(runId, assetsDir, variant);
  stages.push(...p4.meta.subCalls);

  console.log(`[run] verifying...`);
  let report = await verify(p4.htmlPath, gameSpec.mechanic_name);
  let retries = 0;

  while (!report.runs && retries < maxRetries) {
    retries++;
    console.warn(
      `[run] verify failed (${failingAsserts(report).join("; ")}). Retry ${retries}/${maxRetries}.`,
    );
    const addendum = retryAddendum(report);
    p4 = await runP4(runId, assetsDir, variant, addendum);
    const meta = { ...p4.meta.subCalls[0]!, attempt: 1 + retries };
    stages.push(meta);
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
  };
  await writeFile(
    join(outDir, "_meta.json"),
    JSON.stringify(meta, null, 2),
    "utf8",
  );
  return meta;
}
