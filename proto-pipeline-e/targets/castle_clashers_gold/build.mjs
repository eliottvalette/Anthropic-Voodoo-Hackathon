import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sourceDir = resolve(here, "source");
const distDir = resolve(here, "dist");

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

const [styles, game, manifestRaw] = await Promise.all([
  readFile(resolve(sourceDir, "styles.css"), "utf8"),
  readFile(resolve(sourceDir, "game.js"), "utf8"),
  readFile(resolve(sourceDir, "assets.json"), "utf8")
]);

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
<style>${styles}</style>
</head>
<body>
<main id="stage" aria-label="Castle Clashers playable">
<canvas id="game" width="360" height="640"></canvas>
</main>
<script>window.CC_ASSETS=${JSON.stringify(inlinedAssets)};</script>
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
      generated_at: new Date().toISOString()
    },
    null,
    2
  )
);

console.log(`Wrote ${resolve(distDir, "playable.html")} (${Buffer.byteLength(html)} bytes)`);
