import { $ } from "bun";
import { mkdir, stat } from "node:fs/promises";
import { resolve, basename, extname } from "node:path";

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function downsample(inPath: string, outPath: string, fps: number): Promise<void> {
  await $`ffmpeg -y -hide_banner -loglevel error -i ${inPath} -r ${fps} -an -c:v libx264 -preset medium -crf 23 ${outPath}`;
}

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("usage: bun run scripts/ffmpeg_downsample.ts <video> [fps...]");
  process.exit(1);
}

const inPath = resolve(args[0]!);
const fpsList = (args.length > 1 ? args.slice(1) : ["3", "10"]).map((s) => Number(s));

const outDir = resolve("outputs", "fps");
await mkdir(outDir, { recursive: true });

const stem = basename(inPath, extname(inPath));
const inSize = (await stat(inPath)).size;
console.log(`[ffmpeg] input: ${inPath} (${(inSize / 1e6).toFixed(2)} MB)`);

for (const fps of fpsList) {
  const out = `${outDir}/${stem}_${fps}fps.mp4`;
  if (await exists(out)) {
    const sz = (await stat(out)).size;
    console.log(`[ffmpeg] ${fps}fps → ${out} (cached, ${(sz / 1e6).toFixed(2)} MB)`);
    continue;
  }
  const t0 = Date.now();
  await downsample(inPath, out, fps);
  const sz = (await stat(out)).size;
  console.log(
    `[ffmpeg] ${fps}fps → ${out} (${(sz / 1e6).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
}
