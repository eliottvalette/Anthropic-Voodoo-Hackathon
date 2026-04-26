import { mkdir, writeFile } from "node:fs/promises";
import { resolve, basename, extname } from "node:path";
import { observeVideo } from "../src/observe.ts";
import type { GenerateOptions } from "../src/gemini.ts";

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error(
    "usage: bun run scripts/run_observe.ts <video> [--mediaRes low|medium|high] [--label NAME]",
  );
  process.exit(1);
}

const videoPath = resolve(args[0]!);
let mediaResolution: GenerateOptions["mediaResolution"] = "high";
let label: string | null = null;
for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (a === "--mediaRes" && args[i + 1]) {
    mediaResolution = args[++i] as GenerateOptions["mediaResolution"];
  } else if (a === "--label" && args[i + 1]) {
    label = args[++i] ?? null;
  }
}

const stem = basename(videoPath, extname(videoPath));
const tag = label ?? `${stem}_${mediaResolution}`;
const outDir = resolve("outputs", "observe", tag);
await mkdir(outDir, { recursive: true });

console.log(`[observe] ${videoPath}`);
console.log(`[observe] mediaResolution=${mediaResolution} → ${outDir}`);

const out = await observeVideo(videoPath, { mediaResolution });

await writeFile(resolve(outDir, "observation.json"), JSON.stringify(out.data, null, 2), "utf8");
await writeFile(resolve(outDir, "observation_raw.txt"), out.rawText, "utf8");
await writeFile(resolve(outDir, "meta.json"), JSON.stringify(out.meta, null, 2), "utf8");

console.log(
  `[observe] tokensIn=${out.meta.tokensIn} tokensOut=${out.meta.tokensOut} ` +
    `upload=${out.meta.uploadMs}ms active=${out.meta.activeMs}ms ` +
    `gen=${out.meta.generateMs}ms total=${out.meta.totalMs}ms`,
);
