const HELP = `proto-pipeline-m

Usage:
  bun run pipeline --help
  bun run pipeline --list-models
  bun run pipeline --run <id> --video <path> --assets <dir> [--variant <id>]
  bun run pipeline --probe-only --run <id> --video <path> --assets <dir>
  bun run verify <html-path> [--mechanic <name>]
  bun run bench --variants <list> --videos <list>

Wired so far: --help, --list-models, verify, --probe-only.
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
  const runId = getFlag(args, "--run");
  const video = getFlag(args, "--video");
  const assets = getFlag(args, "--assets");
  if (!runId || !video || !assets) {
    console.error(
      "Usage: bun run pipeline --probe-only --run <id> --video <path> --assets <dir>",
    );
    process.exit(1);
  }
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
  const runId = getFlag(args, "--run");
  const video = getFlag(args, "--video");
  const variant = getFlag(args, "--variant") ?? "_default";
  if (!runId || !video) {
    console.error(
      "Usage: bun run pipeline --p1-only --run <id> --video <path> [--variant <id>]",
    );
    process.exit(1);
  }
  const { writeP1 } = await import("./pipeline/p1_video.ts");
  const { outDir, output } = await writeP1(runId, video, variant);
  console.log(`wrote ${outDir}/01_video.json + meta + subs`);
  console.log(JSON.stringify(output.meta, null, 2));
  console.log("--- merged summary ---");
  console.log(output.merged.summary_one_sentence);
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

  console.error("Unknown command. Run with --help.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
