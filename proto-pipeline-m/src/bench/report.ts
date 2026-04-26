import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CsvRow } from "./run.ts";

type Agg = {
  variant: string;
  n: number;
  passRate: number;
  meanUserNote: number | null;
  meanLatencyS: number;
  failsByAssert: Record<string, number>;
};

function aggregate(rows: CsvRow[]): Agg[] {
  const byVariant = new Map<string, CsvRow[]>();
  for (const r of rows) {
    if (!byVariant.has(r.variant)) byVariant.set(r.variant, []);
    byVariant.get(r.variant)!.push(r);
  }
  const out: Agg[] = [];
  for (const [variant, vRows] of byVariant) {
    const n = vRows.length;
    const runs = vRows.filter((r) => r.runs === 1).length;
    const notes = vRows
      .map((r) => Number(r.user_note))
      .filter((n) => Number.isFinite(n) && n > 0);
    const meanUserNote = notes.length
      ? notes.reduce((a, b) => a + b, 0) / notes.length
      : null;
    const fails: Record<string, number> = {
      console_errors: 0,
      canvas_nonblank: 0,
      mraid_ok: 0,
      mechanic_string_match: 0,
      interaction_state_change: 0,
      size_ok: 0,
    };
    for (const r of vRows) {
      if (r.console_errors > 0) fails.console_errors!++;
      if (!r.canvas_nonblank) fails.canvas_nonblank!++;
      if (!r.mraid_ok) fails.mraid_ok!++;
      if (!r.mechanic_string_match) fails.mechanic_string_match!++;
      if (!r.interaction_state_change) fails.interaction_state_change!++;
      if (r.size_bytes > 16 * 1024 * 1024) fails.size_ok!++;
    }
    out.push({
      variant,
      n,
      passRate: n ? runs / n : 0,
      meanUserNote,
      meanLatencyS: n ? vRows.reduce((s, r) => s + r.total_latency_ms, 0) / n / 1000 : 0,
      failsByAssert: fails,
    });
  }
  out.sort((a, b) => b.passRate - a.passRate || (b.meanUserNote ?? 0) - (a.meanUserNote ?? 0));
  return out;
}

function fmtPct(x: number): string { return `${(x * 100).toFixed(0)}%`; }

export async function writeBatchReadme(
  batchDir: string,
  batch: string,
  rows: CsvRow[],
): Promise<void> {
  const aggs = aggregate(rows);
  const lines: string[] = [];
  lines.push(`# Batch ${batch}`);
  lines.push("");
  lines.push(`Total runs: ${rows.length} — pass: ${rows.filter((r) => r.runs === 1).length}`);
  lines.push("");
  lines.push("## Summary by variant");
  lines.push("");
  lines.push("| Variant | N | pass_rate | mean_user_note | mean_latency_s |");
  lines.push("|---|---|---|---|---|");
  for (const a of aggs) {
    lines.push(
      `| ${a.variant} | ${a.n} | ${fmtPct(a.passRate)} | ${a.meanUserNote === null ? "-" : a.meanUserNote.toFixed(2)} | ${a.meanLatencyS.toFixed(1)} |`,
    );
  }
  lines.push("");
  lines.push("## Failing asserts by variant (count of runs that failed each assert)");
  lines.push("");
  lines.push("| Variant | console_errors | canvas_nonblank | mraid_ok | mechanic_string_match | interaction_state_change | size_ok |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const a of aggs) {
    const f = a.failsByAssert;
    lines.push(
      `| ${a.variant} | ${f.console_errors} | ${f.canvas_nonblank} | ${f.mraid_ok} | ${f.mechanic_string_match} | ${f.interaction_state_change} | ${f.size_ok} |`,
    );
  }
  lines.push("");
  lines.push("## Per-run rows");
  lines.push("");
  lines.push("| variant | video | runs | user_note | size KB | latency s | retries | comment |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    lines.push(
      `| ${r.variant} | ${r.video_id} | ${r.runs} | ${r.user_note || "-"} | ${(r.size_bytes / 1024).toFixed(0)} | ${(r.total_latency_ms / 1000).toFixed(1)} | ${r.retries} | ${r.comment.slice(0, 80)} |`,
    );
  }
  lines.push("");
  lines.push("## Next steps");
  lines.push("");
  lines.push("1. Open each `<variant>/<video>/playable.html` in a browser.");
  lines.push("2. Edit `review.json` with `user_note` (1–5) and a one-line `comment`.");
  lines.push(`3. Run \`bun run bench --aggregate-only --batch ${batch}\` to refresh this file with notes.`);
  lines.push("");

  await writeFile(join(batchDir, "README.md"), lines.join("\n"), "utf8");
}
