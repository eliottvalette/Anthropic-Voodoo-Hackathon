import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  uploadFile,
  waitUntilActive,
  generateJson,
  GEMINI_MODELS,
  type ContentPart,
} from "../src/gemini.ts";

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("usage: bun run scripts/h2_multipass.ts <video> [--serial]");
  process.exit(1);
}
const videoPath = resolve(args[0]!);
const parallel = !args.includes("--serial");

const promptsDir = resolve("prompts/multipass");
const passes = [
  { id: "1a_timeline", file: "1a_timeline.md" },
  { id: "1b_mechanics", file: "1b_mechanics.md" },
  { id: "1c_visual_ui", file: "1c_visual_ui.md" },
  { id: "1g_description", file: "1g_description.md" },
];

const outRoot = resolve("outputs", "h2_multipass");
await mkdir(outRoot, { recursive: true });

console.log(`[h2] uploading ${videoPath}...`);
const sz = (await stat(videoPath)).size;
const t0 = Date.now();
const file = await uploadFile(videoPath);
const uploadMs = Date.now() - t0;
const tActive = Date.now();
await waitUntilActive(file.name);
const activeMs = Date.now() - tActive;
console.log(`[h2] upload=${uploadMs}ms active=${activeMs}ms size=${(sz / 1e6).toFixed(2)}MB`);

const filePart: ContentPart = {
  fileData: { fileUri: file.uri, mimeType: file.mimeType },
};

type Result = {
  id: string;
  ok: boolean;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  model: string;
  rawText: string;
  data: unknown;
  error: string | null;
};

async function runPass(pass: { id: string; file: string }): Promise<Result> {
  try {
    const sys = await readFile(join(promptsDir, pass.file), "utf8");
    const userParts: ContentPart[] = [
      filePart,
      { text: "Analyze the video per the system instruction. Return ONLY the JSON object." },
    ];
    const r = await generateJson(GEMINI_MODELS.pro, sys, userParts, {
      mediaResolution: "high",
      temperature: 0.2,
    });
    const dir = join(outRoot, pass.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "output.json"), JSON.stringify(r.data, null, 2), "utf8");
    await writeFile(join(dir, "raw.txt"), r.rawText, "utf8");
    console.log(
      `[h2] ${pass.id} ✓ tokensIn=${r.tokensIn} tokensOut=${r.tokensOut} ` +
        `latency=${r.latencyMs}ms model=${r.model}`,
    );
    return {
      id: pass.id,
      ok: true,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      latencyMs: r.latencyMs,
      model: r.model,
      rawText: r.rawText,
      data: r.data,
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[h2] ${pass.id} ✗ ${msg.slice(0, 300)}`);
    return {
      id: pass.id,
      ok: false,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      model: "",
      rawText: "",
      data: null,
      error: msg,
    };
  }
}

console.log(`[h2] running ${passes.length} sub-passes ${parallel ? "in parallel" : "serially"}...`);
const tRun = Date.now();
const results: Result[] = parallel
  ? await Promise.all(passes.map(runPass))
  : await (async () => {
      const acc: Result[] = [];
      for (const p of passes) acc.push(await runPass(p));
      return acc;
    })();
const wallMs = Date.now() - tRun;

function detectHallucinations(rawText: string): string[] {
  const flagged: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/\btank\s*tread/i, "tank_treads"],
    [/\btilt(s|ed|ing)?\b/i, "tilt"],
    [/\bdefining[_ ]hook\b/i, "defining_hook"],
    [/\btutorial[_ ]loss\b/i, "tutorial_loss"],
  ];
  for (const [re, label] of patterns) {
    if (re.test(rawText)) flagged.push(label);
  }
  return flagged;
}

const totalTokensIn = results.reduce((s, r) => s + r.tokensIn, 0);
const totalTokensOut = results.reduce((s, r) => s + r.tokensOut, 0);
const sumLatency = results.reduce((s, r) => s + r.latencyMs, 0);
const maxLatency = Math.max(...results.map((r) => r.latencyMs));

const hallucinations: Record<string, string[]> = {};
for (const r of results) {
  hallucinations[r.id] = detectHallucinations(r.rawText);
}

const csvLines = [
  "pass,ok,model,tokensIn,tokensOut,latencyMs,hallucinations,error",
];
for (const r of results) {
  csvLines.push(
    [
      r.id,
      r.ok,
      r.model,
      r.tokensIn,
      r.tokensOut,
      r.latencyMs,
      hallucinations[r.id]!.join("|") || "none",
      JSON.stringify((r.error ?? "").slice(0, 80)),
    ].join(","),
  );
}
csvLines.push(
  ["TOTAL", "", "", totalTokensIn, totalTokensOut, parallel ? maxLatency : sumLatency, "", ""].join(","),
);

const csvPath = join(outRoot, "h2_report.csv");
await writeFile(csvPath, csvLines.join("\n") + "\n", "utf8");

console.log(`\n[h2] done in ${(wallMs / 1000).toFixed(1)}s wall clock`);
console.log(`[h2] totalTokensIn=${totalTokensIn} totalTokensOut=${totalTokensOut}`);
console.log(`[h2] sumLatency=${sumLatency}ms maxLatency=${maxLatency}ms`);
console.log(`[h2] hallucinations:`, hallucinations);
console.log(`\n[h2] report: ${csvPath}`);
console.log(csvLines.join("\n"));
