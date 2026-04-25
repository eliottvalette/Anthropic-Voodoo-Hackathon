const HELP = `proto-pipeline-m

Usage:
  bun run pipeline --help
  bun run pipeline --list-models
  bun run pipeline --run <id> --video <path> --assets <dir> [--variant <id>] [--retries N]
  bun run pipeline --probe-only --run <id> --video <path> --assets <dir>
  bun run verify <html-path> [--mechanic <name>]
  bun run bench --variants <csv> --videos <csv> [--assets <dir>] [--retries N]
  bun run bench --aggregate-only --batch <timestamp>
`;

async function listModels(): Promise<void> {
  const { GEMINI_API_KEY } = await import("./env.ts");
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ListModels HTTP ${res.status}: ${body}`);
  }
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

async function runProbeOnly(args: string[]): Promise<void> {
  const rawRunId = getFlag(args, "--run");
  const video = getFlag(args, "--video");
  const assets = getFlag(args, "--assets");
  if (!rawRunId || !video || !assets) {
    console.error(
      "Usage: bun run pipeline --probe-only --run <id> --video <path> --assets <dir>",
    );
    process.exit(1);
  }
  const { stampRunId } = await import("./pipeline/runId.ts");
  const runId = await stampRunId(rawRunId);
  console.log(`[cli] runId "${rawRunId}" stamped → "${runId}"`);
  const { writeProbe } = await import("./pipeline/probe.ts");
  const { outPath, report } = await writeProbe(runId, video, assets);
  console.log(`wrote ${outPath}`);
  console.log(
    JSON.stringify(
      {
        video: report.video,
        assetCount: report.assets.length,
        sample: report.assets.slice(0, 3),
      },
      null,
      2,
    ),
  );
}

async function runP1Only(args: string[]): Promise<void> {
  const rawRunId = getFlag(args, "--run");
  const video = getFlag(args, "--video");
  const assets = getFlag(args, "--assets");
  const variant = getFlag(args, "--variant") ?? "_default";
  if (!rawRunId || !video) {
    console.error(
      "Usage: bun run pipeline --p1-only --run <id> --video <path> [--assets <dir>] [--variant <id>]",
    );
    process.exit(1);
  }
  const { stampRunId } = await import("./pipeline/runId.ts");
  const runId = await stampRunId(rawRunId);
  console.log(`[cli] runId "${rawRunId}" stamped → "${runId}"`);
  if (assets) {
    const { writeProbe } = await import("./pipeline/probe.ts");
    await writeProbe(runId, video, assets);
  }
  const { writeP1 } = await import("./pipeline/p1_video.ts");
  const { outDir, output } = await writeP1(runId, video, variant);
  console.log(`wrote ${outDir}/01_video.json + meta + subs`);
  console.log(JSON.stringify(output.meta, null, 2));
  console.log("--- defining hook ---");
  console.log(output.merged.defining_hook);
  console.log("--- merged summary ---");
  console.log(output.merged.summary_one_sentence);
  if (output.alternate) {
    console.log(`--- alternate (fits_better=${output.alternate.fits_evidence_better}) ---`);
    console.log(`${output.alternate.alternate_genre}: ${output.alternate.rationale}`);
  }
}

async function runP2Only(args: string[]): Promise<void> {
  const runId = getFlag(args, "--run");
  const variant = getFlag(args, "--variant") ?? "_default";
  if (!runId) {
    console.error(
      "Usage: bun run pipeline --p2-only --run <id> [--variant <id>]\n" +
        "(requires outputs/<id>/00_probe.json and 01_video.json)",
    );
    process.exit(1);
  }
  const { writeP2 } = await import("./pipeline/p2_assets.ts");
  const { outDir, output } = await writeP2(runId, variant);
  console.log(`wrote ${outDir}/02_assets.json + meta`);
  console.log(JSON.stringify(output.meta, null, 2));
  console.log("--- roles ---");
  for (const r of output.mapping.roles) {
    console.log(
      `${r.role.padEnd(28)} ${r.match_confidence.padEnd(6)} ${r.filename ?? "(null)"}`,
    );
  }
}

async function runP3Only(args: string[]): Promise<void> {
  const runId = getFlag(args, "--run");
  const variant = getFlag(args, "--variant") ?? "_default";
  if (!runId) {
    console.error(
      "Usage: bun run pipeline --p3-only --run <id> [--variant <id>]\n" +
        "(requires outputs/<id>/01_video.json and 02_assets.json)",
    );
    process.exit(1);
  }
  const { writeP3 } = await import("./pipeline/p3_aggregator.ts");
  const { outDir, output } = await writeP3(runId, variant);
  console.log(`wrote ${outDir}/03_game_spec.json + 03_codegen_prompt.txt + meta`);
  console.log(JSON.stringify(output.meta, null, 2));
  console.log(`mechanic_name: ${output.gameSpec.mechanic_name}`);
  console.log(`genre: ${output.gameSpec.game_identity.genre}`);
  console.log(`render_mode: ${output.gameSpec.render_mode}`);
}

async function runP4Only(args: string[]): Promise<void> {
  const runId = getFlag(args, "--run");
  const assets = getFlag(args, "--assets");
  const variant = getFlag(args, "--variant") ?? "_default";
  const retryOnlyCsv = getFlag(args, "--retry-only");
  if (!runId || !assets) {
    console.error(
      "Usage: bun run pipeline --p4-only --run <id> --assets <dir> [--variant <id>] [--retry-only <csv>]\n" +
        "  --retry-only: comma-separated subsystems to regenerate (input,physics,render,state,winloss).\n" +
        "                Empty value means re-aggregate+re-lint only without regenerating any subsystem.",
    );
    process.exit(1);
  }
  const { runP4 } = await import("./pipeline/p4_codegen.ts");
  type Sub = "input" | "physics" | "render" | "state" | "winloss";
  const VALID: Sub[] = ["input", "physics", "render", "state", "winloss"];
  let retryOnly: Sub[] | undefined;
  if (retryOnlyCsv !== undefined) {
    retryOnly = retryOnlyCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as Sub[];
    for (const s of retryOnly) {
      if (!VALID.includes(s)) {
        console.error(`invalid --retry-only entry: ${s}`);
        process.exit(1);
      }
    }
  }
  const out = await runP4(runId, assets, variant, { retryOnly });
  console.log(
    `wrote ${out.htmlPath} (${(out.bytes / 1024).toFixed(1)} KB)`,
  );
  console.log(JSON.stringify(out.meta, null, 2));
}

async function runFull(args: string[]): Promise<void> {
  const runId = getFlag(args, "--run");
  const video = getFlag(args, "--video");
  const assets = getFlag(args, "--assets");
  const variant = getFlag(args, "--variant") ?? "_default";
  const retriesArg = getFlag(args, "--retries");
  const maxRetries = retriesArg !== undefined ? Number(retriesArg) : 4;
  if (!runId || !video || !assets) {
    console.error(
      "Usage: bun run pipeline --run <id> --video <path> --assets <dir> [--variant <id>] [--retries N]",
    );
    process.exit(1);
  }
  const { runPipeline } = await import("./pipeline/run.ts");
  const meta = await runPipeline(runId, video, assets, variant, maxRetries);
  console.log("--- summary ---");
  console.log(
    JSON.stringify(
      {
        runs: meta.verify.runs,
        retries: meta.retries,
        totalLatencyMs: meta.totalLatencyMs,
        totalTokensIn: meta.totalTokensIn,
        totalTokensOut: meta.totalTokensOut,
        verify: meta.verify,
      },
      null,
      2,
    ),
  );
}

async function runBench(args: string[]): Promise<void> {
  if (args.includes("--aggregate-only")) {
    const batch = getFlag(args, "--batch");
    if (!batch) {
      console.error("Usage: bun run bench --aggregate-only --batch <timestamp>");
      process.exit(1);
    }
    const { aggregateOnly } = await import("./bench/run.ts");
    await aggregateOnly(batch);
    return;
  }
  const variantsCsv = getFlag(args, "--variants");
  const videosCsv = getFlag(args, "--videos");
  const assets = getFlag(args, "--assets") ?? "../ressources/Castle Clashers Assets";
  const retriesArg = getFlag(args, "--retries");
  const retries = retriesArg !== undefined ? Number(retriesArg) : 2;
  if (!variantsCsv || !videosCsv) {
    console.error(
      "Usage: bun run bench --variants <csv> --videos <csv> [--assets <dir>] [--retries N]",
    );
    process.exit(1);
  }
  const variants = variantsCsv.split(",").map((s) => s.trim()).filter(Boolean);
  const videos = videosCsv.split(",").map((s) => s.trim()).filter(Boolean);
  const { runBench } = await import("./bench/run.ts");
  const batch = await runBench(variants, videos, assets, retries);
  console.log(`[bench] batch ${batch} done`);
}

async function runVerify(args: string[]): Promise<void> {
  const positional = args.filter((a) => !a.startsWith("--"));
  const htmlPath = positional[1];
  if (!htmlPath) {
    console.error("Usage: bun run verify <html-path> [--mechanic <name>]");
    process.exit(1);
  }
  const mechanic = getFlag(args, "--mechanic") ?? "";
  const { verify } = await import("./pipeline/verify.ts");
  const report = await verify(htmlPath, mechanic);
  console.log(JSON.stringify(report, null, 2));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }

  if (args.includes("--list-models")) {
    await listModels();
    return;
  }

  if (args[0] === "verify") {
    await runVerify(args);
    return;
  }

  if (args[0] === "bench" || args.includes("--bench")) {
    await runBench(args);
    return;
  }

  if (args.includes("--probe-only")) {
    await runProbeOnly(args);
    return;
  }

  if (args.includes("--p1-only")) {
    await runP1Only(args);
    return;
  }

  if (args.includes("--p2-only")) {
    await runP2Only(args);
    return;
  }

  if (args.includes("--p3-only")) {
    await runP3Only(args);
    return;
  }

  if (args.includes("--p4-only")) {
    await runP4Only(args);
    return;
  }

  if (args.includes("--run")) {
    await runFull(args);
    return;
  }

  console.error("Unknown command. Run with --help.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
