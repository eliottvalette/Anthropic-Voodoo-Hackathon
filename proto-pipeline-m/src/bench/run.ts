import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { runPipeline, type RunMeta } from "../pipeline/run.ts";
import { writeBatchReadme } from "./report.ts";
import { scoreSpecFromPaths } from "./discrepancy_spec.ts";
import { scoreRuntime, loadExpected } from "./discrepancy_runtime.ts";

const VIDEO_ALIASES: Record<string, string> = {
  b01: "../ressources/Castle Clashers/Video Example/B01.mp4",
  b11: "../ressources/Castle Clashers/Video Example/B11_fixed.mp4",
};

type CsvRow = {
  batch_timestamp: string;
  variant: string;
  video_id: string;
  size_bytes: number;
  console_errors: number;
  canvas_nonblank: number;
  mraid_ok: number;
  mechanic_string_match: number;
  interaction_state_change: number;
  turn_loop_observed: number;
  hp_decreases_on_hit: number;
  cta_reachable: number;
  runs: number;
  spec_score: number;
  runtime_score: number;
  user_note: string;
  total_latency_ms: number;
  retries: number;
  comment: string;
};

const CSV_COLS: (keyof CsvRow)[] = [
  "batch_timestamp", "variant", "video_id",
  "size_bytes", "console_errors", "canvas_nonblank", "mraid_ok",
  "mechanic_string_match", "interaction_state_change",
  "turn_loop_observed", "hp_decreases_on_hit", "cta_reachable",
  "runs", "spec_score", "runtime_score", "user_note",
  "total_latency_ms", "retries",
  "comment",
];

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowToLine(r: CsvRow): string {
  return CSV_COLS.map((k) => csvEscape(String(r[k]))).join(",");
}

function batchTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function resolveVideo(id: string): string {
  return VIDEO_ALIASES[id] ?? id;
}

function buildRow(
  batch: string,
  variant: string,
  videoId: string,
  meta: RunMeta,
  reviewNote: string,
  reviewComment: string,
  specScore: number,
  runtimeScore: number,
): CsvRow {
  const v = meta.verify;
  return {
    batch_timestamp: batch,
    variant,
    video_id: videoId,
    size_bytes: v.sizeBytes,
    console_errors: v.consoleErrors.length,
    canvas_nonblank: v.canvasNonBlank ? 1 : 0,
    mraid_ok: v.mraidOk ? 1 : 0,
    mechanic_string_match: v.mechanicStringMatch ? 1 : 0,
    interaction_state_change: v.interactionStateChange ? 1 : 0,
    turn_loop_observed: v.turnLoopObserved ? 1 : 0,
    hp_decreases_on_hit: v.hpDecreasesOnHit ? 1 : 0,
    cta_reachable: v.ctaReachable ? 1 : 0,
    runs: v.runs ? 1 : 0,
    spec_score: specScore,
    runtime_score: runtimeScore,
    user_note: reviewNote,
    total_latency_ms: meta.totalLatencyMs,
    retries: meta.retries,
    comment: reviewComment,
  };
}

async function writeCsv(path: string, rows: CsvRow[]): Promise<void> {
  const header = CSV_COLS.join(",");
  const body = rows.map(rowToLine).join("\n");
  await writeFile(path, header + "\n" + body + (body ? "\n" : ""), "utf8");
}

async function readCsv(path: string): Promise<CsvRow[]> {
  const txt = await readFile(path, "utf8");
  const lines = txt.split("\n").filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const cols = lines[0]!.split(",");
  const out: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!);
    const obj: Record<string, string> = {};
    cols.forEach((c, idx) => (obj[c] = cells[idx] ?? ""));
    out.push(coerceRow(obj));
  }
  return out;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else {
      if (ch === ",") { out.push(cur); cur = ""; }
      else if (ch === '"') inQ = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function coerceRow(o: Record<string, string>): CsvRow {
  const num = (k: string) => Number(o[k] ?? "0") || 0;
  return {
    batch_timestamp: o.batch_timestamp ?? "",
    variant: o.variant ?? "",
    video_id: o.video_id ?? "",
    size_bytes: num("size_bytes"),
    console_errors: num("console_errors"),
    canvas_nonblank: num("canvas_nonblank"),
    mraid_ok: num("mraid_ok"),
    mechanic_string_match: num("mechanic_string_match"),
    interaction_state_change: num("interaction_state_change"),
    turn_loop_observed: num("turn_loop_observed"),
    hp_decreases_on_hit: num("hp_decreases_on_hit"),
    cta_reachable: num("cta_reachable"),
    runs: num("runs"),
    spec_score: num("spec_score"),
    runtime_score: num("runtime_score"),
    user_note: o.user_note ?? "",
    total_latency_ms: num("total_latency_ms"),
    retries: num("retries"),
    comment: o.comment ?? "",
  };
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function readReview(
  path: string,
): Promise<{ user_note: string; comment: string }> {
  if (!(await exists(path))) return { user_note: "", comment: "" };
  try {
    const j = JSON.parse(await readFile(path, "utf8"));
    const note = j.user_note;
    return {
      user_note: note === null || note === undefined ? "" : String(note),
      comment: typeof j.comment === "string" ? j.comment : "",
    };
  } catch {
    return { user_note: "", comment: "" };
  }
}

async function writePlaceholderReview(path: string): Promise<void> {
  if (await exists(path)) return;
  const tpl = { user_note: null, comment: "", reviewer: "" };
  await writeFile(path, JSON.stringify(tpl, null, 2), "utf8");
}

export async function runBench(
  variants: string[],
  videos: string[],
  assetsDir: string,
  retries: number,
  goldDir: string | null = null,
): Promise<string> {
  const batch = batchTimestamp();
  const batchDir = resolve("outputs", batch);
  await mkdir(batchDir, { recursive: true });
  const rows: CsvRow[] = [];

  for (const variant of variants) {
    for (const videoId of videos) {
      const videoPath = resolveVideo(videoId);
      const runId = `${batch}/${variant}/${videoId}`;
      console.log(`[bench] ▶ variant=${variant} video=${videoId}`);
      try {
        const meta = await runPipeline(runId, videoPath, assetsDir, variant, retries, goldDir);
        const runDir = resolve("outputs", runId);
        const reviewPath = join(runDir, "review.json");
        await writePlaceholderReview(reviewPath);
        const review = await readReview(reviewPath);
        let specScore = 0;
        let runtimeScore = 0;
        if (goldDir) {
          try {
            const specPath = join(runDir, "03_game_spec.json");
            if (await exists(specPath)) {
              const r = await scoreSpecFromPaths(specPath, goldDir);
              specScore = r.scorePct;
              await writeFile(
                join(runDir, "discrepancy_spec.json"),
                JSON.stringify(r, null, 2),
                "utf8",
              );
            }
          } catch (e) {
            console.warn(`[bench] spec-score failed for ${runId}: ${(e as Error).message}`);
          }
          try {
            const expected = await loadExpected(goldDir);
            const r = scoreRuntime(meta.verify, expected);
            runtimeScore = r.scorePct;
            await writeFile(
              join(runDir, "discrepancy_runtime.json"),
              JSON.stringify(r, null, 2),
              "utf8",
            );
          } catch (e) {
            console.warn(`[bench] runtime-score failed for ${runId}: ${(e as Error).message}`);
          }
        }
        rows.push(buildRow(batch, variant, videoId, meta, review.user_note, review.comment, specScore, runtimeScore));
      } catch (err) {
        console.error(`[bench] ✗ ${variant}/${videoId} failed:`, err);
        rows.push({
          batch_timestamp: batch, variant, video_id: videoId,
          size_bytes: 0, console_errors: 0, canvas_nonblank: 0, mraid_ok: 0,
          mechanic_string_match: 0, interaction_state_change: 0,
          turn_loop_observed: 0, hp_decreases_on_hit: 0, cta_reachable: 0,
          runs: 0, spec_score: 0, runtime_score: 0, user_note: "",
          total_latency_ms: 0, retries: 0,
          comment: `pipeline error: ${(err as Error).message}`.slice(0, 500),
        });
      }
    }
  }

  const csvPath = join(batchDir, "scores.csv");
  await writeCsv(csvPath, rows);
  await writeBatchReadme(batchDir, batch, rows);
  console.log(`[bench] wrote ${csvPath}`);
  console.log(`[bench] wrote ${join(batchDir, "README.md")}`);
  return batch;
}

export async function aggregateOnly(batch: string): Promise<void> {
  const batchDir = resolve("outputs", batch);
  if (!(await exists(batchDir))) {
    throw new Error(`Batch dir not found: ${batchDir}`);
  }
  const csvPath = join(batchDir, "scores.csv");
  if (!(await exists(csvPath))) {
    throw new Error(`scores.csv not found in ${batchDir}`);
  }
  const rows = await readCsv(csvPath);
  for (const r of rows) {
    if (!r.variant || !r.video_id) continue;
    const reviewPath = resolve("outputs", batch, r.variant, r.video_id, "review.json");
    const rev = await readReview(reviewPath);
    if (rev.user_note) r.user_note = rev.user_note;
    if (rev.comment) r.comment = rev.comment;
  }
  await writeCsv(csvPath, rows);
  await writeBatchReadme(batchDir, batch, rows);
  console.log(`[bench] re-aggregated ${csvPath}`);
}

export type { CsvRow };
