import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const slidePlayablePath = resolve(repoRoot, "public/castle_clashers.html");
const groundTruthBuildPath = resolve(
  repoRoot,
  "../proto-pipeline-e/targets/castle_clashers_gold/source_v2/dist/applovin_playable.html",
);
const groundTruthSourcePath = resolve(
  repoRoot,
  "../proto-pipeline-e/targets/castle_clashers_gold/source_v2/index.html",
);

function sha1(filePath) {
  return createHash("sha1").update(readFileSync(filePath)).digest("hex");
}

const slideHash = sha1(slidePlayablePath);
const groundTruthBuildHash = sha1(groundTruthBuildPath);

if (slideHash !== groundTruthBuildHash) {
  console.error("Castle Clashers playable drift detected.");
  console.error(`slide:        ${slidePlayablePath}`);
  console.error(`ground truth: ${groundTruthBuildPath}`);
  console.error(`source v2:    ${groundTruthSourcePath}`);
  console.error(`slide sha1:   ${slideHash}`);
  console.error(`ground sha1:  ${groundTruthBuildHash}`);
  process.exit(1);
}

console.log("Castle Clashers playable matches source_v2 AppLovin build.");
console.log(`slide:        ${slidePlayablePath}`);
console.log(`ground truth: ${groundTruthBuildPath}`);
console.log(`source v2:    ${groundTruthSourcePath}`);
console.log(`sha1:         ${slideHash}`);
