import { $ } from "bun";
import { readdir, stat, readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, basename, dirname } from "node:path";
import {
  ProbeReportSchema,
  RigPartSchema,
  type Asset,
  type ProbeReport,
  type VideoMeta,
} from "./schemas.ts";
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
  const out = await $`ffprobe -v error -print_format json -show_format -show_streams ${abs}`.text();
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
  if (!v) throw new Error(`no video stream in ${abs}`);
  return {
    path: abs,
    durationSec: Number(j.format?.duration ?? 0),
    width: v.width ?? 0,
    height: v.height ?? 0,
    fps: parseFps(v.avg_frame_rate ?? v.r_frame_rate ?? "0/0"),
    codec: v.codec_name ?? "unknown",
  };
}

async function probeImage(abs: string): Promise<{ width: number; height: number }> {
  try {
    const out = await $`ffprobe -v error -print_format json -show_streams -select_streams v:0 ${abs}`.text();
    const j = JSON.parse(out) as { streams?: Array<{ width?: number; height?: number }> };
    const s = j.streams?.[0];
    return { width: s?.width ?? 0, height: s?.height ?? 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}

async function probeAudioDuration(abs: string): Promise<number> {
  try {
    const out = await $`ffprobe -v error -print_format json -show_format ${abs}`.text();
    const j = JSON.parse(out) as { format?: { duration?: string } };
    return Number(j.format?.duration ?? 0);
  } catch {
    return 0;
  }
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

export async function probeAssets(assetsDir: string): Promise<Asset[]> {
  const root = resolve(assetsDir);
  const files = await walk(root);

  const skipParts = new Set<string>();
  const rigByFolder = new Map<string, { asset_id: string; anchor: { x: number; y: number }; parts: z.infer<typeof RigPartSchema>[] }>();

  for (const f of files) {
    if (basename(f) === "rig.json") {
      try {
        const raw = await readFile(f, "utf8");
        const parsed = RigJsonSchema.parse(JSON.parse(raw));
        const folder = dirname(f);
        rigByFolder.set(folder, parsed);
        for (const p of parsed.parts) skipParts.add(join(folder, p.file));
        skipParts.add(join(folder, "parts"));
      } catch {
        // ignore malformed rig.json
      }
    }
  }

  const out: Asset[] = [];
  for (const abs of files) {
    const ext = extname(abs).toLowerCase();
    const filename = basename(abs);
    if (filename === "rig.json" || filename === "asset_manifest.json") continue;
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
    const relpath = relative(root, abs);
    if (IMAGE_EXT.has(ext)) {
      const { width, height } = await probeImage(abs);
      const asset: Asset = { filename, relpath, kind: "image", width, height, bytes };
      if (filename === "full.png") {
        const rig = rigByFolder.get(dirname(abs));
        if (rig) {
          asset.rig = { asset_id: rig.asset_id, anchor: rig.anchor, parts: rig.parts };
          asset.kind = "rig";
        }
      }
      out.push(asset);
    } else if (AUDIO_EXT.has(ext)) {
      const durationSec = await probeAudioDuration(abs);
      out.push({ filename, relpath, kind: "audio", durationSec, bytes });
    }
  }
  return out;
}

export async function probe(videoPath: string, assetsDir: string): Promise<ProbeReport> {
  const [video, assets] = await Promise.all([probeVideo(videoPath), probeAssets(assetsDir)]);
  return ProbeReportSchema.parse({
    video,
    assetsDir: resolve(assetsDir),
    assets,
    generatedAt: new Date().toISOString(),
  });
}

export async function writeProbe(runDir: string, videoPath: string, assetsDir: string): Promise<ProbeReport> {
  const report = await probe(videoPath, assetsDir);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "00_probe.json"), JSON.stringify(report, null, 2), "utf8");
  return report;
}

export async function downsampleVideo(inPath: string, outPath: string, fps: number): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });
  await $`ffmpeg -y -hide_banner -loglevel error -i ${inPath} -r ${fps} -an -c:v libx264 -preset medium -crf 23 ${outPath}`;
}
