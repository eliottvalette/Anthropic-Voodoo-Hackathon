import { mkdir, writeFile, stat, readFile } from "node:fs/promises";
import { resolve, join, basename, extname } from "node:path";
import { writeProbe, downsampleVideo } from "./probe.ts";
import { observeVideo } from "./observe.ts";
import { writeAssetMap } from "./assetMap.ts";
import { writeSpec } from "./spec.ts";
import { writeCodegen } from "./codegen.ts";

export type PipelineOptions = {
  videoPath: string;
  assetsDir: string;
  utilsDir: string;
  referenceBehaviorPath: string | null;
  fps: number;
  runDir: string;
  inlineAssets?: boolean;
};

export type StageMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
};

export type PipelineMeta = {
  runId: string;
  videoPath: string;
  assetsDir: string;
  startedAt: string;
  endedAt: string;
  totalLatencyMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
  stages: StageMeta[];
  htmlPath: string;
  htmlBytes: number;
  staticChecks: { ok: boolean; failures: string[] };
};

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function inlineDataUris(
  assetsDir: string,
  spec: { asset_role_map: Array<{ role: string; relpath: string | null }> },
  budgetBytes = 3_500_000,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  // Priority: castles + backgrounds first, then UI, then units, then projectiles
  const priority = (role: string): number => {
    if (/_castle$/.test(role)) return 0;
    if (/^background_/.test(role)) return 1;
    if (/^hud_|^ui_/.test(role)) return 2;
    if (/^projectile_/.test(role)) return 3;
    if (/^unit_/.test(role)) return 4;
    return 5;
  };
  const sorted = [...spec.asset_role_map].sort((a, b) => priority(a.role) - priority(b.role));
  let used = 0;
  for (const r of sorted) {
    if (!r.relpath) continue;
    const abs = resolve(assetsDir, r.relpath);
    if (!(await exists(abs))) continue;
    const ext = extname(abs).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;
    const bytes = await readFile(abs);
    // Skip if adding would blow budget (base64 inflates by ~33%)
    const inflated = Math.ceil((bytes.length * 4) / 3);
    if (used + inflated > budgetBytes) continue;
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
    out[r.role] = `data:${mime};base64,${bytes.toString("base64")}`;
    used += inflated;
  }
  return out;
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineMeta> {
  const t0 = Date.now();
  const startedAt = new Date().toISOString();
  await mkdir(opts.runDir, { recursive: true });
  const stages: StageMeta[] = [];

  console.log(`[pipeline] runDir=${opts.runDir}`);
  console.log(`[pipeline] S0 probe...`);
  const probeT = Date.now();
  const probe = await writeProbe(opts.runDir, opts.videoPath, opts.assetsDir);
  stages.push({
    step: "S0_probe",
    model: "ffprobe",
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: Date.now() - probeT,
  });
  console.log(`[pipeline]   video=${probe.video.width}x${probe.video.height} ${probe.video.fps.toFixed(1)}fps ${probe.video.durationSec.toFixed(1)}s`);
  console.log(`[pipeline]   assets=${probe.assets.length}`);

  const stem = basename(opts.videoPath, extname(opts.videoPath));
  const downsampledPath = join(opts.runDir, `${stem}_${opts.fps}fps.mp4`);
  if (!(await exists(downsampledPath))) {
    console.log(`[pipeline] S0 ffmpeg downsample to ${opts.fps}fps...`);
    const dsT = Date.now();
    await downsampleVideo(opts.videoPath, downsampledPath, opts.fps);
    stages.push({
      step: "S0_downsample",
      model: "ffmpeg",
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: Date.now() - dsT,
    });
  }

  console.log(`[pipeline] S1 observe (Gemini)...`);
  const observation = await observeVideo(downsampledPath, { mediaResolution: "high" });
  await writeFile(
    join(opts.runDir, "01_observation.json"),
    JSON.stringify(observation.data, null, 2),
    "utf8",
  );
  await writeFile(
    join(opts.runDir, "01_observation_meta.json"),
    JSON.stringify(observation.meta, null, 2),
    "utf8",
  );
  stages.push({
    step: "S1_observe",
    model: observation.meta.model,
    tokensIn: observation.meta.tokensIn,
    tokensOut: observation.meta.tokensOut,
    latencyMs: observation.meta.totalMs,
  });
  console.log(`[pipeline]   tokensIn=${observation.meta.tokensIn} tokensOut=${observation.meta.tokensOut} total=${observation.meta.totalMs}ms`);

  console.log(`[pipeline] S2 asset map (Sonnet)...`);
  const am = await writeAssetMap(opts.runDir, observation.data, probe);
  stages.push({
    step: am.meta.step,
    model: am.meta.model,
    tokensIn: am.meta.tokensIn,
    tokensOut: am.meta.tokensOut,
    latencyMs: am.meta.latencyMs,
  });
  const mapped = am.assetMap.roles.filter((r) => r.filename !== null).length;
  console.log(`[pipeline]   ${mapped}/${am.assetMap.roles.length} roles mapped, ${am.assetMap.unmapped_assets.length} unmapped assets`);

  console.log(`[pipeline] S3 spec compose (Sonnet)...`);
  const utilsCatalog = join(opts.utilsDir, "catalog.json");
  const sp = await writeSpec(opts.runDir, observation.data, am.assetMap, utilsCatalog, opts.referenceBehaviorPath);
  stages.push({
    step: sp.meta.step,
    model: sp.meta.model,
    tokensIn: sp.meta.tokensIn,
    tokensOut: sp.meta.tokensOut,
    latencyMs: sp.meta.latencyMs,
  });
  console.log(`[pipeline]   template=${sp.spec.template_id} mechanic=${sp.spec.mechanic_name} util_picks=[${sp.spec.util_picks.join(",")}]`);

  let assetsDataUris: Record<string, string> = {};
  if (opts.inlineAssets) {
    console.log(`[pipeline]   inlining assets as data URIs...`);
    assetsDataUris = await inlineDataUris(opts.assetsDir, sp.spec);
    const totalBytes = Object.values(assetsDataUris).reduce((s, v) => s + v.length, 0);
    console.log(`[pipeline]   inlined ${Object.keys(assetsDataUris).length} assets (~${(totalBytes / 1e6).toFixed(2)}MB base64)`);
  }

  console.log(`[pipeline] S4 codegen (Sonnet)...`);
  const shellHtmlPath = join(opts.utilsDir, "templates/playable-shell.html");
  const cg = await writeCodegen(opts.runDir, {
    spec: sp.spec,
    utilsDir: opts.utilsDir,
    shellHtmlPath,
    assetsDataUris,
  });
  stages.push({
    step: cg.meta.step,
    model: cg.meta.model,
    tokensIn: cg.meta.tokensIn,
    tokensOut: cg.meta.tokensOut,
    latencyMs: cg.meta.latencyMs,
  });
  console.log(`[pipeline]   tokensIn=${cg.meta.tokensIn} tokensOut=${cg.meta.tokensOut} html=${cg.meta.htmlBytes}b utils=${cg.meta.utilsIncluded.length}`);
  if (!cg.meta.staticChecks.ok) {
    console.warn(`[pipeline]   static checks FAILED: ${cg.meta.staticChecks.failures.join(", ")}`);
  } else {
    console.log(`[pipeline]   static checks ✓`);
  }

  const endedAt = new Date().toISOString();
  const totalLatencyMs = Date.now() - t0;
  const meta: PipelineMeta = {
    runId: basename(opts.runDir),
    videoPath: resolve(opts.videoPath),
    assetsDir: resolve(opts.assetsDir),
    startedAt,
    endedAt,
    totalLatencyMs,
    totalTokensIn: stages.reduce((s, x) => s + x.tokensIn, 0),
    totalTokensOut: stages.reduce((s, x) => s + x.tokensOut, 0),
    stages,
    htmlPath: join(opts.runDir, "playable.html"),
    htmlBytes: cg.meta.htmlBytes,
    staticChecks: cg.meta.staticChecks,
  };
  await writeFile(join(opts.runDir, "_meta.json"), JSON.stringify(meta, null, 2), "utf8");
  console.log(`\n[pipeline] DONE in ${(totalLatencyMs / 1000).toFixed(1)}s. tokensIn=${meta.totalTokensIn} tokensOut=${meta.totalTokensOut}`);
  console.log(`[pipeline] → ${meta.htmlPath}`);
  return meta;
}
