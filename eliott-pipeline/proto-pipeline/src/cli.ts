#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderBrief } from "./brief.ts";
import { loadApiKey } from "./env.ts";
import { extractJsonObject, generateJson, listModels, uploadFile, waitUntilActive } from "./gemini.ts";
import { inventoryAssets, videoMetadata } from "./metadata.ts";
import { prepareOutputDir, writeJson, writeText } from "./outputs.ts";

type Args = {
  run: string;
  video?: string;
  assets?: string;
  model: string;
  fallbackModel: string;
  fps?: number;
  listModels: boolean;
  help: boolean;
};

const defaultModel = "gemini-3.1-pro-preview";
const defaultFallbackModel = "gemini-2.5-pro";
const protoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const eliottRoot = resolve(protoRoot, "..");
const repoRoot = resolve(eliottRoot, "..");
const outputRoot = join(protoRoot, "outputs");

function usage(): string {
  return [
    "Usage:",
    "  node eliott-pipeline/proto-pipeline/src/cli.ts --run <name> --video <path> --assets <dir>",
    "  node eliott-pipeline/proto-pipeline/src/cli.ts --list-models",
    "",
    "Options:",
    `  --model <id>           Default: ${defaultModel}`,
    `  --fallback-model <id>  Default: ${defaultFallbackModel}`,
    "  --fps <number>         Optional Gemini video sampling FPS",
    "  --run <name>           Output name under eliott-pipeline/proto-pipeline/outputs/",
    "",
    "Outputs are overwritten for the same --run.",
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const apiKey = await loadApiKey(repoRoot);
  if (args.listModels) {
    console.log(JSON.stringify(await listModels(apiKey), null, 2));
    return;
  }

  if (!args.video || !args.assets) {
    throw new Error(`--video and --assets are required unless --list-models is used.\n\n${usage()}`);
  }

  const videoPath = resolve(args.video);
  const assetDir = resolve(args.assets);
  if (!existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }
  if (!existsSync(assetDir)) {
    throw new Error(`Assets directory not found: ${assetDir}`);
  }

  const outputDir = await prepareOutputDir(outputRoot, args.run);
  const manifest = {
    created_at: new Date().toISOString(),
    run: args.run,
    video: videoPath,
    assets: assetDir,
    model: args.model,
    fallback_model: args.fallbackModel,
    output_dir: outputDir,
  };

  await writeJson(outputDir, "video_metadata.json", await videoMetadata(videoPath));
  const assetInventory = await inventoryAssets(assetDir);
  await writeJson(outputDir, "asset_inventory.json", assetInventory);

  console.log(`Uploading ${videoPath}...`);
  const uploaded = await waitUntilActive(apiKey, await uploadFile(apiKey, videoPath));
  await writeJson(outputDir, "uploaded_file.json", uploaded);

  const videoPrompt = await readFile(join(protoRoot, "prompts", "video-breakdown.md"), "utf8");
  console.log(`Analyzing video with ${args.model}...`);
  const rawVideo = await generateWithFallback(apiKey, args.model, args.fallbackModel, videoPrompt, uploaded, args.fps);
  await writeJson(outputDir, "raw_gemini_video_analysis.json", rawVideo);
  const videoBreakdown = extractJsonObject(rawVideo, "video_breakdown");
  await writeJson(outputDir, "video_breakdown.json", videoBreakdown);

  const featurePromptBase = await readFile(join(protoRoot, "prompts", "feature-spec.md"), "utf8");
  const featurePrompt = [
    featurePromptBase,
    "",
    "Video breakdown JSON:",
    JSON.stringify(videoBreakdown, null, 2),
    "",
    "Asset inventory JSON:",
    JSON.stringify(assetInventory, null, 2),
  ].join("\n");
  console.log(`Generating playable feature spec with ${args.model}...`);
  const rawSpec = await generateWithFallback(apiKey, args.model, args.fallbackModel, featurePrompt);
  await writeJson(outputDir, "raw_gemini_feature_spec.json", rawSpec);
  const featureSpec = extractJsonObject(rawSpec, "playable_feature_spec");
  await writeJson(outputDir, "playable_feature_spec.json", featureSpec);

  await writeText(outputDir, "brief.md", renderBrief(videoBreakdown, featureSpec));
  await writeJson(outputDir, "manifest.json", { ...manifest, status: "completed", uploaded_file: uploaded });
  console.log(`Saved outputs to ${outputDir}`);
}

async function generateWithFallback(
  apiKey: string,
  model: string,
  fallbackModel: string,
  prompt: string,
  uploaded?: Parameters<typeof generateJson>[1]["uploaded"],
  fps?: number,
) {
  try {
    return await generateJson(apiKey, { model, prompt, uploaded, fps });
  } catch (error) {
    if (!fallbackModel || fallbackModel === model) {
      throw error;
    }
    console.warn(`Primary model failed; retrying with ${fallbackModel}.`);
    return generateJson(apiKey, { model: fallbackModel, prompt, uploaded, fps });
  }
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    run: "latest",
    model: defaultModel,
    fallbackModel: defaultFallbackModel,
    listModels: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    switch (arg) {
      case "--run":
        args.run = requireValue(arg, next);
        index += 1;
        break;
      case "--video":
        args.video = requireValue(arg, next);
        index += 1;
        break;
      case "--assets":
        args.assets = requireValue(arg, next);
        index += 1;
        break;
      case "--model":
        args.model = requireValue(arg, next);
        index += 1;
        break;
      case "--fallback-model":
        args.fallbackModel = requireValue(arg, next);
        index += 1;
        break;
      case "--fps":
        args.fps = Number(requireValue(arg, next));
        if (!Number.isFinite(args.fps) || args.fps <= 0) {
          throw new Error("--fps must be a positive number.");
        }
        index += 1;
        break;
      case "--list-models":
        args.listModels = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  return args;
}

function requireValue(name: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

