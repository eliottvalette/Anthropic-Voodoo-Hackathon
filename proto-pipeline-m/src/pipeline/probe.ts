import { $ } from "bun";
import { mkdir, writeFile, readdir, stat, readFile } from "node:fs/promises";
import { extname, join, relative, resolve, basename, dirname } from "node:path";
import {
  ProbeReportSchema,
  RigPartSchema,
  type Asset,
  type ProbeReport,
  type VideoMeta,
} from "../schemas/probe.ts";
import { z } from "zod";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac"]);

const RigJsonSchema = z.object({
  asset_id: z.string(),
  anchor: z.object({ x: z.number(), y: z.number() }).strict(),
  parts: z.array(RigPartSchema),
});

function parseFps(rate: string): number {
  if (!rate || rate === "0/0") return 0;
  const [a, b] = rate.split("/").map(Number);
  if (!a || !b) return 0;
  return a / b;
}

export async function probeVideo(videoPath: string): Promise<VideoMeta> {
  const abs = resolve(videoPath);
  const out =
    await $`ffprobe -v error -print_format json -show_format -show_streams ${abs}`.text();
  const j = JSON.parse(out) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      r_frame_rate?: string;
    }>;
  };
  const v = j.streams?.find((s) => s.codec_type === "video");
  if (!v) throw new Error(`No video stream in ${abs}`);
  return {
    path: abs,
    durationSec: Number(j.format?.duration ?? 0),
    width: v.width ?? 0,
    height: v.height ?? 0,
    fps: parseFps(v.avg_frame_rate ?? v.r_frame_rate ?? "0/0"),
    codec: v.codec_name ?? "unknown",
  };
}

async function probeImage(
  abs: string,
): Promise<{ width: number; height: number }> {
  const out =
    await $`ffprobe -v error -print_format json -show_streams -select_streams v:0 ${abs}`.text();
  const j = JSON.parse(out) as {
    streams?: Array<{ width?: number; height?: number }>;
  };
  const s = j.streams?.[0];
  return { width: s?.width ?? 0, height: s?.height ?? 0 };
}

async function probeAudio(abs: string): Promise<number> {
  const out =
    await $`ffprobe -v error -print_format json -show_format ${abs}`.text();
  const j = JSON.parse(out) as { format?: { duration?: string } };
  return Number(j.format?.duration ?? 0);
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

async function loadRigForFolder(
  folderAbs: string,
): Promise<{ asset_id: string; anchor: { x: number; y: number }; parts: z.infer<typeof RigPartSchema>[]; parts_dir_relpath: string } | null> {
  const rigPath = join(folderAbs, "rig.json");
  try {
    const raw = await readFile(rigPath, "utf8");
    const parsed = RigJsonSchema.parse(JSON.parse(raw));
    return {
      asset_id: parsed.asset_id,
      anchor: parsed.anchor,
      parts: parsed.parts,
      parts_dir_relpath: "parts",
    };
  } catch {
    return null;
  }
}

export async function probeAssets(assetsDir: string): Promise<Asset[]> {
  const root = resolve(assetsDir);
  const files = await walk(root);
  const skipParts = new Set<string>();
  const rigFolders = new Map<string, { asset_id: string; anchor: { x: number; y: number }; parts: z.infer<typeof RigPartSchema>[]; parts_dir_relpath: string }>();
  for (const f of files) {
    if (basename(f) === "rig.json") {
      const folder = dirname(f);
      const rig = await loadRigForFolder(folder);
      if (!rig) continue;
      rigFolders.set(folder, rig);
      const partsDir = join(folder, "parts");
      for (const p of rig.parts) {
        skipParts.add(join(folder, p.file));
      }
      skipParts.add(partsDir);
    }
  }

  const out: Asset[] = [];
  for (const abs of files) {
    const ext = extname(abs).toLowerCase();
    const relpath = relative(root, abs);
    const filename = basename(abs);
    if (basename(abs) === "rig.json" || basename(abs) === "asset_manifest.json") continue;
    if (skipParts.has(abs)) continue;
    if (filename === "parts_sheet.png") continue;
    let inSkippedParts = false;
    for (const partAbs of skipParts) {
      if (abs.startsWith(partAbs + "/") || abs === partAbs) {
        inSkippedParts = true;
        break;
      }
    }
    if (inSkippedParts) continue;

    const bytes = (await stat(abs)).size;
    if (IMAGE_EXT.has(ext)) {
      try {
        const { width, height } = await probeImage(abs);
        const asset: Asset = { filename, relpath, kind: "image", width, height, bytes };
        if (filename === "full.png") {
          const rig = rigFolders.get(dirname(abs));
          if (rig) asset.rig = rig;
        }
        out.push(asset);
      } catch {
        const asset: Asset = { filename, relpath, kind: "image", width: 0, height: 0, bytes };
        if (filename === "full.png") {
          const rig = rigFolders.get(dirname(abs));
          if (rig) asset.rig = rig;
        }
        out.push(asset);
      }
    } else if (AUDIO_EXT.has(ext)) {
      try {
        const durationSec = await probeAudio(abs);
        out.push({ filename, relpath, kind: "audio", durationSec, bytes });
      } catch {
        out.push({ filename, relpath, kind: "audio", durationSec: 0, bytes });
      }
    }
  }
  return out;
}

export async function probe(
  videoPath: string,
  assetsDir: string,
): Promise<ProbeReport> {
  const [video, assets] = await Promise.all([
    probeVideo(videoPath),
    probeAssets(assetsDir),
  ]);
  return ProbeReportSchema.parse({
    video,
    assetsDir: resolve(assetsDir),
    assets,
    generatedAt: new Date().toISOString(),
  });
}

export async function writeProbe(
  runId: string,
  videoPath: string,
  assetsDir: string,
): Promise<{ outPath: string; report: ProbeReport }> {
  const report = await probe(videoPath, assetsDir);
  const outDir = resolve("outputs", runId);
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, "00_probe.json");
  await writeFile(outPath, JSON.stringify(report, null, 2), "utf8");
  return { outPath, report };
}
