import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type AssetInventory = {
  asset_root: string;
  total_files: number;
  total_size_bytes: number;
  assets: Record<string, unknown>[];
};

export async function videoMetadata(videoPath: string): Promise<Record<string, unknown>> {
  const fileStats = await stat(videoPath);
  return {
    path: videoPath,
    size_bytes: fileStats.size,
    mime_type: mimeTypeForPath(videoPath),
    ffprobe: await ffprobe(videoPath),
  };
}

export async function inventoryAssets(assetDir: string): Promise<AssetInventory> {
  const files = await walkFiles(assetDir);
  const assets = await Promise.all(files.map((file) => assetEntry(assetDir, file)));
  return {
    asset_root: assetDir,
    total_files: assets.length,
    total_size_bytes: assets.reduce((sum, asset) => sum + Number(asset.size_bytes ?? 0), 0),
    assets,
  };
}

async function assetEntry(root: string, path: string): Promise<Record<string, unknown>> {
  const fileStats = await stat(path);
  const entry: Record<string, unknown> = {
    path,
    relative_path: relative(root, path),
    size_bytes: fileStats.size,
    mime_type: mimeTypeForPath(path),
  };
  const dimensions = await dimensionsFor(path);
  if (dimensions) {
    entry.width = dimensions.width;
    entry.height = dimensions.height;
  }
  const probe = await ffprobe(path);
  if (probe) {
    entry.ffprobe = probe;
  }
  return entry;
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(path);
      }
      return entry.isFile() ? [path] : [];
    }),
  );
  return nested.flat().sort();
}

async function dimensionsFor(path: string): Promise<{ width: number; height: number } | null> {
  const ext = extname(path).toLowerCase();
  if (ext === ".png") {
    const header = await readFile(path);
    if (!header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return null;
    }
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  }
  if (ext === ".psb" || ext === ".psd") {
    const header = await readFile(path);
    if (header.subarray(0, 4).toString("ascii") !== "8BPS") {
      return null;
    }
    return { height: header.readUInt32BE(14), width: header.readUInt32BE(18) };
  }
  return null;
}

async function ffprobe(path: string): Promise<Record<string, unknown> | null> {
  const ext = extname(path).toLowerCase();
  if (![".mp4", ".mov", ".m4v", ".ogg", ".wav", ".mp3", ".aac"].includes(ext)) {
    return null;
  }
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size,bit_rate",
      "-show_entries",
      "stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels,duration",
      "-of",
      "json",
      path,
    ]);
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mimeTypeForPath(path: string): string {
  const ext = extname(path).toLowerCase();
  const types: Record<string, string> = {
    ".mp4": "video/mp4",
    ".png": "image/png",
    ".psb": "image/vnd.adobe.photoshop",
    ".psd": "image/vnd.adobe.photoshop",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
  };
  return types[ext] ?? "application/octet-stream";
}

