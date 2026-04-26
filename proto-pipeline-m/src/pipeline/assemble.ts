import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { GameSpec } from "../schemas/gameSpec.ts";
import type { ProbeReport } from "../schemas/probe.ts";

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

const MAX_BYTES = 16 * 1024 * 1024;
const SIZE_WARN_BYTES = 4 * 1024 * 1024;
const BASE64_INFLATION = 1.37;

export type ResolvedAsset = {
  relpath: string;
  root: string;
  bytes: number;
};

export type FilenameResolver = (input: string) => ResolvedAsset | null;

export function buildFilenameResolver(probe: ProbeReport): FilenameResolver {
  const primaryRoot = probe.assetsDir;
  const bankRoot = probe.bankDir ?? probe.assetsDir;
  const byRelpath = new Map<string, ResolvedAsset>();
  const byBasename = new Map<string, ResolvedAsset[]>();
  for (const a of probe.assets) {
    const root = a.source === "bank" ? bankRoot : primaryRoot;
    const entry: ResolvedAsset = { relpath: a.relpath, root, bytes: a.bytes };
    byRelpath.set(a.relpath, entry);
    const arr = byBasename.get(a.filename) ?? [];
    arr.push(entry);
    byBasename.set(a.filename, arr);
  }
  return (input: string) => {
    const direct = byRelpath.get(input);
    if (direct) return direct;
    const candidates = byBasename.get(input);
    if (candidates && candidates.length === 1) return candidates[0];
    return null;
  };
}

export type AssetsBlockResult = {
  block: string;
  dropped: Array<{ role: string; relpath: string | null; reason: string }>;
};

export async function buildAssetsBlock(
  assetRoleMap: GameSpec["asset_role_map"],
  resolver: FilenameResolver,
): Promise<AssetsBlockResult> {
  type Selected = {
    role: string;
    relpath: string;
    root: string;
    mime: string;
    bytes: number;
  };
  const selected: Selected[] = [];
  const dropped: Array<{ role: string; relpath: string | null; reason: string }> = [];

  for (const [role, value] of Object.entries(assetRoleMap)) {
    if (!value) continue;
    const ext = extname(value).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) {
      dropped.push({ role, relpath: value, reason: `unknown ext ${ext}` });
      continue;
    }
    const resolved = resolver(value);
    if (!resolved) {
      dropped.push({ role, relpath: value, reason: "not found in probe" });
      continue;
    }
    selected.push({
      role,
      relpath: resolved.relpath,
      root: resolved.root,
      mime,
      bytes: resolved.bytes,
    });
  }

  let projected = selected.reduce((s, x) => s + Math.ceil(x.bytes * BASE64_INFLATION), 0);
  if (projected > MAX_BYTES) {
    const ordered = [...selected].sort((a, b) => b.bytes - a.bytes);
    while (projected > MAX_BYTES && ordered.length > 0) {
      const big = ordered.shift()!;
      const idx = selected.indexOf(big);
      if (idx >= 0) selected.splice(idx, 1);
      projected -= Math.ceil(big.bytes * BASE64_INFLATION);
      dropped.push({
        role: big.role,
        relpath: big.relpath,
        reason: `size_budget (${(big.bytes / 1024).toFixed(0)}KB pushed projection over ${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB)`,
      });
    }
  } else if (projected > SIZE_WARN_BYTES) {
    console.warn(
      `[assemble] projected base64 payload ${(projected / 1024 / 1024).toFixed(2)} MB exceeds soft warn ${(SIZE_WARN_BYTES / 1024 / 1024).toFixed(0)} MB (hard cap ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB)`,
    );
  }

  const entries: string[] = [];
  for (const s of selected) {
    try {
      const buf = await readFile(join(s.root, s.relpath));
      const b64 = buf.toString("base64");
      entries.push(`  ${JSON.stringify(s.role)}: "data:${s.mime};base64,${b64}"`);
    } catch (e) {
      dropped.push({
        role: s.role,
        relpath: s.relpath,
        reason: `read failed: ${(e as Error).message.slice(0, 80)}`,
      });
    }
  }

  if (dropped.length > 0) {
    console.warn(
      `[assemble] skipped ${dropped.length} role(s) (model will draw fallback rects):\n  - ${dropped.map((d) => `${d.role}=${d.relpath ?? "null"} (${d.reason})`).join("\n  - ")}`,
    );
  }

  return {
    block: `const A = {\n${entries.join(",\n")}\n};`,
    dropped,
  };
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
