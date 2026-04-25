import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { GameSpec } from "../schemas/gameSpec.ts";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
};

const MAX_BYTES = 5 * 1024 * 1024;

export async function buildAssetsBlock(
  assetsDir: string,
  assetRoleMap: GameSpec["asset_role_map"],
): Promise<string> {
  const entries: string[] = [];
  for (const [role, filename] of Object.entries(assetRoleMap)) {
    if (!filename) continue;
    const ext = extname(filename).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) {
      console.warn(`[assemble] skipping ${role}: unknown ext ${ext}`);
      continue;
    }
    const buf = await readFile(join(assetsDir, filename));
    const b64 = buf.toString("base64");
    entries.push(`  ${JSON.stringify(role)}: "data:${mime};base64,${b64}"`);
  }
  return `const A = {\n${entries.join(",\n")}\n};`;
}

const MARKER_PAT = /\/\*\s*ASSETS_BASE64\s*\*\//;
const CONST_A_PAT = /const\s+A\s*=\s*\{[\s\S]*?\};?/m;

export function injectAssets(html: string, assetsBlock: string): string {
  let out = html;
  const hadMarker = MARKER_PAT.test(out);
  if (hadMarker) {
    out = out.replace(MARKER_PAT, assetsBlock);
    while (CONST_A_PAT.test(out.replace(assetsBlock, ""))) {
      const without = out.replace(assetsBlock, "__ASSETS_PLACEHOLDER__");
      const stripped = without.replace(CONST_A_PAT, "");
      out = stripped.replace("__ASSETS_PLACEHOLDER__", assetsBlock);
    }
    return out;
  }
  if (CONST_A_PAT.test(out)) return out.replace(CONST_A_PAT, assetsBlock);
  return out.replace(
    /(<script>)/i,
    `$1\n/* assets injected by runtime */\n${assetsBlock}\n`,
  );
}

export function stripFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z]*\n?/, "");
    s = s.replace(/```\s*$/, "");
  }
  const lt = s.indexOf("<!doctype");
  const ltAlt = s.indexOf("<!DOCTYPE");
  const start = Math.min(...[lt, ltAlt].filter((n) => n >= 0));
  if (Number.isFinite(start) && start > 0) s = s.slice(start);
  return s.trim();
}

export function assertSize(html: string): void {
  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes > MAX_BYTES) {
    throw new Error(
      `Assembled HTML ${bytes} bytes exceeds limit ${MAX_BYTES} bytes`,
    );
  }
}
