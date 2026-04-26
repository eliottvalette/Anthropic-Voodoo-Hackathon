import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const distDir = join(sourceDir, "dist");
const optimizedDir = join(distDir, "optimized-assets");
const outputFile = join(distDir, "applovin_playable.html");
const reportFile = join(distDir, "applovin_build_report.json");
const assetManifestFile = join(sourceDir, "assets.json");
const fontFile = join(sourceDir, "best_assets", "lilita-one.ttf");
const handCursorPath = resolve(sourceDir, "../../../../nico-sandbox/runs/B11/final-assets-v1/ui/ui_hand_cursor.png");
const musicPath = resolve(sourceDir, "../../../../ressources/Castle Clashers/Assets/Music.ogg");

const skippedManifestKeys = new Set([
  "castlePlayer_impact",
  "castlePlayer_break",
  "castlePlayer_destroyed",
  "castleEnemy_impact",
  "castleEnemy_break",
  "castleEnemy_destroyed",
]);

const cwebpBin = (() => {
  try {
    return execFileSync("command", ["-v", "cwebp"], { encoding: "utf8" }).trim();
  } catch {
    return existsSync("/opt/homebrew/bin/cwebp") ? "/opt/homebrew/bin/cwebp" : "";
  }
})();

function mimeFor(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".ttf") return "font/ttf";
  if (ext === ".woff2") return "font/woff2";
  if (ext === ".css") return "text/css";
  if (ext === ".js") return "text/javascript";
  throw new Error(`Unknown MIME type for ${filePath}`);
}

function dataUrlFromBuffer(buffer, mime) {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function dataUrl(filePath, mime = mimeFor(filePath)) {
  return dataUrlFromBuffer(readFileSync(filePath), mime);
}

function resolveAsset(assetPath) {
  return resolve(sourceDir, assetPath);
}

function webpQualityFor(key) {
  if (key === "background") return 74;
  if (key === "boss") return 72;
  if (key === "tutorialHand") return 84;
  if (key.includes("Castle") || key.startsWith("castle")) return 80;
  return 78;
}

function optimizedImageDataUrl(key, filePath) {
  const ext = extname(filePath).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    return dataUrl(filePath);
  }

  if (!cwebpBin || ext === ".webp") {
    return dataUrl(filePath);
  }

  mkdirSync(optimizedDir, { recursive: true });
  const outPath = join(optimizedDir, `${key}.webp`);
  execFileSync(cwebpBin, [
    "-quiet",
    "-q",
    String(webpQualityFor(key)),
    filePath,
    "-o",
    outPath,
  ]);

  const original = readFileSync(filePath);
  const optimized = readFileSync(outPath);
  if (optimized.length >= original.length) {
    return dataUrlFromBuffer(original, mimeFor(filePath));
  }
  return dataUrlFromBuffer(optimized, "image/webp");
}

function buildAssets() {
  const rawManifest = JSON.parse(readFileSync(assetManifestFile, "utf8"));
  const manifest = {};
  const report = {};

  for (const [key, assetPath] of Object.entries(rawManifest)) {
    if (skippedManifestKeys.has(key)) continue;
    const filePath = resolveAsset(assetPath);
    const url = key.startsWith("sfx")
      ? dataUrl(filePath)
      : optimizedImageDataUrl(key, filePath);
    manifest[key] = url;
    report[key] = {
      source: assetPath,
      sourceBytes: readFileSync(filePath).length,
      dataUrlBytes: Buffer.byteLength(url),
    };
  }

  const handDataUrl = optimizedImageDataUrl("tutorialHand", handCursorPath);
  const musicDataUrl = dataUrl(musicPath);
  const fontDataUrl = dataUrl(fontFile);

  report.tutorialHand = {
    source: handCursorPath,
    sourceBytes: readFileSync(handCursorPath).length,
    dataUrlBytes: Buffer.byteLength(handDataUrl),
  };
  report.music = {
    source: musicPath,
    sourceBytes: readFileSync(musicPath).length,
    dataUrlBytes: Buffer.byteLength(musicDataUrl),
  };
  report.fontLilitaOne = {
    source: fontFile,
    sourceBytes: readFileSync(fontFile).length,
    dataUrlBytes: Buffer.byteLength(fontDataUrl),
  };

  return { manifest, handDataUrl, musicDataUrl, fontDataUrl, report };
}

function inlineCss(fontDataUrl) {
  const css = readFileSync(join(sourceDir, "styles.css"), "utf8");
  return `@font-face{font-family:'Lilita One';src:url(${fontDataUrl}) format('truetype');font-weight:400;font-style:normal;font-display:block}\n${css}`;
}

function appLovinShim() {
  return `(function(){\n` +
    `  window.__ccMraidReady = new Promise(function(resolve){\n` +
    `    if (!window.mraid) { resolve(); return; }\n` +
    `    try {\n` +
    `      if (window.mraid.getState && window.mraid.getState() === "loading" && window.mraid.addEventListener) {\n` +
    `        window.mraid.addEventListener("ready", resolve);\n` +
    `      } else {\n` +
    `        resolve();\n` +
    `      }\n` +
    `    } catch (e) { resolve(); }\n` +
    `  });\n` +
    `  function mutePlayableAudio(){ try { if (window.stopMusic) window.stopMusic(); } catch (e) {} }\n` +
    `  document.addEventListener("visibilitychange", function(){ if (document.hidden) mutePlayableAudio(); });\n` +
    `  window.addEventListener("pagehide", mutePlayableAudio);\n` +
    `})();`;
}

function transformScript(script, replacements) {
  let out = script;
  out = out.replace(
    /const HAND_CURSOR_SRC = "[^"]+";/,
    `const HAND_CURSOR_SRC = "${replacements.handDataUrl}";`,
  );
  out = out.replace(
    /var DEFAULT_HAND_SRC = new URL\("[^"]+", SCRIPT_SRC\)\.href;/,
    `var DEFAULT_HAND_SRC = "${replacements.handDataUrl}";`,
  );
  out = out.replace(
    /async function getManifest\(\) \{\n    if \(window\.CC_ASSETS\) return window\.CC_ASSETS;\n    const res = await fetch\(window\.CC_ASSET_MANIFEST_URL \|\| "\.\/assets\.json"\);\n    return res\.json\(\);\n  \}/,
    `async function getManifest() {\n    return window.CC_ASSETS || {};\n  }`,
  );
  out = out.replace(
    /\n  boot\(\);\n\}\)\(\);\s*$/,
    `\n  (window.__ccMraidReady || Promise.resolve()).then(boot);\n})();\n`,
  );
  return out;
}

function inlineScripts(indexHtml, replacements) {
  const scripts = [];
  indexHtml.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
    const filePath = resolve(sourceDir, src);
    let script = readFileSync(filePath, "utf8");
    script = transformScript(script, replacements);
    scripts.push({ src, script });
    return "";
  });
  return scripts;
}

function inlineBodyScripts(bodyHtml, replacements) {
  return bodyHtml
    .replace(/<script>\s*window\.CC_ASSET_MANIFEST_URL = "\.\/assets\.json";\s*<\/script>/, "")
    .replace(/"\.\.\/\.\.\/\.\.\/\.\.\/ressources\/Castle Clashers\/Assets\/Music\.ogg"/g, `"${replacements.musicDataUrl}"`)
    .replace(/"\.\/best_assets\/canon_whistle\.mp3"/g, `"${replacements.manifest.sfxCanonWhistle}"`)
    .replace(/"\.\/best_assets\/canon_hit_castle\.mp3"/g, `"${replacements.manifest.sfxCanonHitCastle}"`)
    .replace(/"\.\/best_assets\/loose\.mp3"/g, `"${replacements.manifest.sfxLose}"`)
    .replace(/"\.\/best_assets\/triomph\.mp3"/g, `"${replacements.manifest.sfxTriomph}"`)
    .replace(/"\.\/best_assets\/trioph 2\.mp3"/g, `"${replacements.manifest.sfxTriomphAlt}"`);
}

function buildHtml() {
  mkdirSync(distDir, { recursive: true });
  const assets = buildAssets();
  const indexHtml = readFileSync(join(sourceDir, "index.html"), "utf8");
  const bodyMatch = indexHtml.match(/<body>([\s\S]*?)<\/body>/);
  if (!bodyMatch) throw new Error("Could not find <body> in index.html");

  let body = bodyMatch[1];
  const externalScripts = inlineScripts(indexHtml, assets);
  body = body.replace(/<script src="[^"]+"><\/script>\n?/g, "");
  body = inlineBodyScripts(body, assets);

  const scriptTags = [
    `<script>${appLovinShim()}</script>`,
    `<script>window.CC_ASSETS=${JSON.stringify(assets.manifest)};</script>`,
    ...externalScripts.map(({ script }) => `<script>\n${script}\n</script>`),
  ].join("\n");

  const html = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    "<title>Castle Clashers v2 AppLovin</title>",
    `<style>\n${inlineCss(assets.fontDataUrl)}\n</style>`,
    "</head>",
    "<body>",
    body.trim(),
    scriptTags,
    "</body>",
    "</html>",
    "",
  ].join("\n");

  writeFileSync(outputFile, html);
  writeFileSync(reportFile, JSON.stringify({
    output: outputFile,
    outputBytes: Buffer.byteLength(html),
    outputMB: Buffer.byteLength(html) / 1_000_000,
    outputMiB: Buffer.byteLength(html) / 1024 / 1024,
    assets: assets.report,
  }, null, 2));
}

buildHtml();
console.log(outputFile);
