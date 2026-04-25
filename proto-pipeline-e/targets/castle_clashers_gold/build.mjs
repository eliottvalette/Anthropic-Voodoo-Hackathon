import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sourceDir = resolve(here, "source");
const distDir = resolve(here, "dist");
const utilsRoot = resolve(here, "../../../utils");

const mimeByExt = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg"
};

function mimeFor(path) {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  return mimeByExt[ext] || "application/octet-stream";
}

// Utils bank: bundled in order so deps load first.
const utilFiles = [
  "vfx/particles.js",
  "vfx/smoke.js",
  "vfx/burst.js",
  "vfx/trail.js",
  "vfx/shake.js",
  "vfx/float-text.js",
  "vfx/debris.js",
  "vfx/section-destroy.js",
  "hud/vs-bar-top.js",
  "end-screens/game-lost.js",
  "end-screens/game-won.js",
  "mechanics/cta-trigger.js",
  "mechanics/audio.js"
];

const [styles, game, manifestRaw, ...utilSources] = await Promise.all([
  readFile(resolve(sourceDir, "styles.css"), "utf8"),
  readFile(resolve(sourceDir, "game.js"), "utf8"),
  readFile(resolve(sourceDir, "assets.json"), "utf8"),
  ...utilFiles.map(f => readFile(resolve(utilsRoot, f), "utf8"))
]);

const utilBundle = utilFiles
  .map((f, i) => `/* ── ${f} ── */\n${utilSources[i]}`)
  .join("\n\n");

const manifest = JSON.parse(manifestRaw);
const inlinedAssets = {};

for (const [key, relativePath] of Object.entries(manifest)) {
  const absolutePath = resolve(sourceDir, relativePath);
  const bytes = await readFile(absolutePath);
  inlinedAssets[key] = `data:${mimeFor(relativePath)};base64,${bytes.toString("base64")}`;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Castle Clashers Gold Target</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lilita+One&display=swap" rel="stylesheet">
<style>${styles}</style>
</head>
<body>
<main id="stage" aria-label="Castle Clashers playable">
<canvas id="game" width="360" height="640"></canvas>
</main>
<script>window.CC_ASSETS=${JSON.stringify(inlinedAssets)};</script>
<script>${utilBundle}</script>
<script>${game}</script>
</body>
</html>
`;

await mkdir(distDir, { recursive: true });
await writeFile(resolve(distDir, "playable.html"), html);
await writeFile(
  resolve(distDir, "build_report.json"),
  JSON.stringify(
    {
      output: "playable.html",
      bytes: Buffer.byteLength(html),
      assets: Object.keys(inlinedAssets),
      utils: utilFiles,
      generated_at: new Date().toISOString()
    },
    null,
    2
  )
);

console.log(`Wrote ${resolve(distDir, "playable.html")} (${Buffer.byteLength(html)} bytes, ${utilFiles.length} utils bundled)`);
