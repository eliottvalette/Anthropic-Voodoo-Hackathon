import { resolve } from "node:path";
import { runPipeline } from "../src/pipeline.ts";

const args = process.argv.slice(2);
let videoPath: string | null = null;
let assetsDir: string | null = null;
let utilsDir = resolve("../utils");
let referenceBehaviorPath: string | null = resolve("targets/castle_clashers_gold/expected_behavior.json");
let fps = 3;
let runId: string | null = null;
let inlineAssets = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = args[i + 1];
  if (a === "--video" && next) {
    videoPath = resolve(next);
    i++;
  } else if (a === "--assets" && next) {
    assetsDir = resolve(next);
    i++;
  } else if (a === "--utils" && next) {
    utilsDir = resolve(next);
    i++;
  } else if (a === "--reference" && next) {
    referenceBehaviorPath = next === "none" ? null : resolve(next);
    i++;
  } else if (a === "--fps" && next) {
    fps = Number(next);
    i++;
  } else if (a === "--run" && next) {
    runId = next;
    i++;
  } else if (a === "--inline-assets") {
    inlineAssets = true;
  }
}

if (!videoPath || !assetsDir) {
  console.error("usage: bun run scripts/pipeline.ts --video <path> --assets <dir> [--utils <dir>] [--reference <path|none>] [--fps 3] [--run <id>] [--inline-assets]");
  process.exit(1);
}

const id = runId ?? `run_${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`;
const runDir = resolve("outputs", id);

await runPipeline({
  videoPath,
  assetsDir,
  utilsDir,
  referenceBehaviorPath,
  fps,
  runDir,
  inlineAssets,
});
