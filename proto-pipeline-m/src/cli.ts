const HELP = `proto-pipeline-m

Usage:
  bun run pipeline --help
  bun run pipeline --list-models
  bun run pipeline --run <id> --video <path> --assets <dir> [--variant <id>]
  bun run verify <html-path>
  bun run bench --variants <list> --videos <list>

Phase 0: only --help and --list-models are wired.
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

  console.error("Unknown command. Run with --help.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
