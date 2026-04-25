import { $ } from "bun";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { probeVideo } from "./probe.ts";

const GRID = 4;
const FRAMES = GRID * GRID;
const CELL_W = 320;
const CELL_H = Math.round((CELL_W * 16) / 9);

export type ContactSheet = {
  pngPath: string;
  grid: { rows: number; cols: number };
  cellSize: { w: number; h: number };
  timestampsSec: number[];
};

export async function buildContactSheet(
  videoPath: string,
  outPngPath: string,
): Promise<ContactSheet> {
  const abs = resolve(videoPath);
  const out = resolve(outPngPath);
  await mkdir(dirname(out), { recursive: true });

  const meta = await probeVideo(abs);
  const dur = meta.durationSec > 0 ? meta.durationSec : 1;
  const timestamps: number[] = [];
  for (let i = 0; i < FRAMES; i++) {
    const t = ((i + 0.5) * dur) / FRAMES;
    timestamps.push(Number(t.toFixed(3)));
  }

  const fps = FRAMES / dur;
  const filter = `fps=${fps.toFixed(6)},scale=${CELL_W}:${CELL_H}:force_original_aspect_ratio=decrease,pad=${CELL_W}:${CELL_H}:(ow-iw)/2:(oh-ih)/2:color=black,tile=${GRID}x${GRID}`;

  await $`ffmpeg -y -loglevel error -i ${abs} -vf ${filter} -frames:v 1 ${out}`;

  return {
    pngPath: out,
    grid: { rows: GRID, cols: GRID },
    cellSize: { w: CELL_W, h: CELL_H },
    timestampsSec: timestamps,
  };
}
