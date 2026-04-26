import { $ } from "bun";
import { mkdir, writeFile, stat, readFile } from "node:fs/promises";
import { resolve, basename, extname, join } from "node:path";
import { observeVideo } from "../src/observe.ts";

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function downsample(inPath: string, outPath: string, fps: number): Promise<void> {
  if (await exists(outPath)) return;
  await $`ffmpeg -y -hide_banner -loglevel error -i ${inPath} -r ${fps} -an -c:v libx264 -preset medium -crf 23 ${outPath}`;
}

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("usage: bun run scripts/h1_fps_compare.ts <video> [fpsList=3,10,native]");
  process.exit(1);
}

const inPath = resolve(args[0]!);
const fpsArg = args[1] ?? "3,10,native";
const fpsList: Array<number | "native"> = fpsArg
  .split(",")
  .map((s) => (s === "native" ? "native" : Number(s)));

const stem = basename(inPath, extname(inPath));
const fpsDir = resolve("outputs", "fps");
await mkdir(fpsDir, { recursive: true });

const inputs: Array<{ label: string; path: string }> = [];
for (const f of fpsList) {
  if (f === "native") {
    inputs.push({ label: `${stem}_native`, path: inPath });
  } else {
    const out = join(fpsDir, `${stem}_${f}fps.mp4`);
    console.log(`[h1] downsample ${f}fps → ${out}`);
    await downsample(inPath, out, f);
    inputs.push({ label: `${stem}_${f}fps`, path: out });
  }
}

const sizes = await Promise.all(inputs.map((i) => stat(i.path).then((s) => s.size)));
inputs.forEach((i, k) => {
  console.log(`[h1] ${i.label}: ${(sizes[k]! / 1e6).toFixed(2)} MB`);
});

const outRoot = resolve("outputs", "h1_fps");
await mkdir(outRoot, { recursive: true });

const parallel = !args.includes("--serial");
console.log(`[h1] running ${inputs.length} observations ${parallel ? "in parallel" : "serially"}...`);
const t0 = Date.now();

type RowResult = {
  label: string;
  sizeBytes: number;
  meta: import("../src/observe.ts").ObserveMeta | null;
  data: unknown;
  error: string | null;
};

async function runOne(i: { label: string; path: string }, idx: number): Promise<RowResult> {
  try {
    const r = await observeVideo(i.path, { mediaResolution: "high" });
    const dir = resolve(outRoot, i.label);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "observation.json"), JSON.stringify(r.data, null, 2), "utf8");
    await writeFile(join(dir, "meta.json"), JSON.stringify(r.meta, null, 2), "utf8");
    await writeFile(join(dir, "observation_raw.txt"), r.rawText, "utf8");
    console.log(
      `[h1] ${i.label} ✓ tokensIn=${r.meta.tokensIn} tokensOut=${r.meta.tokensOut} ` +
        `total=${r.meta.totalMs}ms`,
    );
    return { label: i.label, sizeBytes: sizes[idx]!, meta: r.meta, data: r.data, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[h1] ${i.label} ✗ ${msg.slice(0, 300)}`);
    return { label: i.label, sizeBytes: sizes[idx]!, meta: null, data: null, error: msg };
  }
}

const results: RowResult[] = parallel
  ? await Promise.all(inputs.map((i, idx) => runOne(i, idx)))
  : await (async () => {
      const acc: RowResult[] = [];
      for (let idx = 0; idx < inputs.length; idx++) {
        acc.push(await runOne(inputs[idx]!, idx));
      }
      return acc;
    })();
console.log(`[h1] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

function countNullableFields(d: unknown): { total: number; nulled: number } {
  if (!d || typeof d !== "object") return { total: 0, nulled: 0 };
  let total = 0;
  let nulled = 0;
  const visit = (v: unknown) => {
    if (v === null) {
      nulled++;
      total++;
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (typeof v === "object") {
      for (const k of Object.keys(v as Record<string, unknown>)) {
        const child = (v as Record<string, unknown>)[k];
        if (
          k.endsWith("_observed") ||
          k === "is_turn_based" ||
          k === "shown" ||
          k === "trigger_observed" ||
          k === "label_text_observed" ||
          k === "destruction_states_count" ||
          k === "castle_hp_observed"
        ) {
          total++;
          if (child === null) nulled++;
        }
        visit(child);
      }
    }
  };
  visit(d);
  return { total, nulled };
}

function countEvidenceTimestamps(d: unknown): number {
  if (!d || typeof d !== "object") return 0;
  let n = 0;
  const visit = (v: unknown) => {
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      if (Array.isArray(obj["evidence_timestamps"])) {
        n += (obj["evidence_timestamps"] as unknown[]).length;
      }
      for (const k of Object.keys(obj)) visit(obj[k]);
    }
  };
  visit(d);
  return n;
}

function detectHallucinations(rawText: string): string[] {
  const flagged: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/\btank\s*tread/i, "tank_treads"],
    [/\btilt(s|ed|ing)?\b/i, "tilt"],
    [/\bdefining[_ ]hook\b/i, "defining_hook"],
    [/\btutorial[_ ]loss\b/i, "tutorial_loss"],
    [/\bgoblin|skeleton|cyclop|orc\b/i, "named_unit_roster"],
  ];
  for (const [re, label] of patterns) {
    if (re.test(rawText)) flagged.push(label);
  }
  return flagged;
}

const csvLines = ["label,sizeBytes,model,uploadMs,activeMs,generateMs,totalMs,tokensIn,tokensOut,nullableTotal,nullableNulled,evidenceTimestampsCount,hallucinationFlags,error"];
for (const r of results) {
  if (r.error) {
    csvLines.push(`${r.label},${r.sizeBytes},,,,,,,,,,,,${JSON.stringify(r.error.slice(0, 80))}`);
    continue;
  }
  const nul = countNullableFields(r.data);
  const ev = countEvidenceTimestamps(r.data);
  const raw = await readFile(join(outRoot, r.label, "observation_raw.txt"), "utf8");
  const hall = detectHallucinations(raw);
  const m = r.meta!;
  csvLines.push(
    [
      r.label,
      r.sizeBytes,
      m.model,
      m.uploadMs,
      m.activeMs,
      m.generateMs,
      m.totalMs,
      m.tokensIn,
      m.tokensOut,
      nul.total,
      nul.nulled,
      ev,
      hall.join("|") || "none",
      "",
    ].join(","),
  );
}

const csvPath = join(outRoot, "h1_report.csv");
await writeFile(csvPath, csvLines.join("\n") + "\n", "utf8");
console.log(`\n[h1] report: ${csvPath}\n`);
console.log(csvLines.join("\n"));
