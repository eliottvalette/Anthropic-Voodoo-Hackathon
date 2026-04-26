import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  generateJson,
  CLAUDE_MODELS,
  imagePartFromPath,
  type AnthropicContent,
} from "./anthropic.ts";
import {
  AssetDescriptionSchema,
  type AssetDescription,
  type DescribedAsset,
} from "../schemas/assets.ts";
import { ProbeReportSchema, type Asset } from "../schemas/probe.ts";

export type AssetDescribeMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  attempt: number;
};

const MAX_PARALLEL = 5;

async function loadPrompt(variant: string): Promise<string> {
  return await readFile(
    resolve("prompts", variant, "2_asset_describe.md"),
    "utf8",
  );
}

async function describeOne(
  prompt: string,
  asset: Asset,
  assetsDir: string,
): Promise<{ description: AssetDescription | null; meta: AssetDescribeMeta }> {
  if (asset.kind !== "image") {
    return { description: null, meta: zeroMeta(asset.filename, "skip_audio") };
  }
  const abs = join(assetsDir, asset.relpath);
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < 2) {
    attempt++;
    try {
      const imgPart = await imagePartFromPath(abs);
      const userParts: AnthropicContent[] = [
        imgPart,
        { type: "text", text: "Describe this asset per the system instruction." },
      ];
      const r = await generateJson(CLAUDE_MODELS.sonnet, prompt, userParts, {
        temperature: 0.3,
      });
      const parsed = AssetDescriptionSchema.parse(r.data);
      return {
        description: parsed,
        meta: {
          step: `2_describe:${asset.filename}`,
          model: CLAUDE_MODELS.sonnet,
          tokensIn: r.tokensIn,
          tokensOut: r.tokensOut,
          latencyMs: r.latencyMs,
          attempt,
        },
      };
    } catch (e) {
      lastErr = e;
      console.warn(
        `[p2 describe] ${asset.filename} attempt ${attempt} failed: ${(e as Error).message.slice(0, 200)}`,
      );
      if (attempt >= 2) break;
    }
  }
  console.warn(
    `[p2 describe] ${asset.filename} giving up; continuing without description`,
  );
  void lastErr;
  return { description: null, meta: zeroMeta(asset.filename, "fail") };
}

function zeroMeta(filename: string, suffix: string): AssetDescribeMeta {
  return {
    step: `2_describe:${filename}:${suffix}`,
    model: CLAUDE_MODELS.sonnet,
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 0,
    attempt: 0,
  };
}

export type DescribeResult = {
  describedAssets: DescribedAsset[];
  metas: AssetDescribeMeta[];
};

export async function describeAssets(
  runId: string,
  variant = "_default",
): Promise<DescribeResult> {
  const outDir = resolve("outputs", runId);
  const probe = ProbeReportSchema.parse(
    JSON.parse(await readFile(join(outDir, "00_probe.json"), "utf8")),
  );
  const prompt = await loadPrompt(variant);

  const described: DescribedAsset[] = [];
  const metas: AssetDescribeMeta[] = [];
  const queue = [...probe.assets];
  let inFlight = 0;
  await new Promise<void>((done, fail) => {
    const next = () => {
      if (queue.length === 0 && inFlight === 0) return done();
      while (inFlight < MAX_PARALLEL && queue.length > 0) {
        const a = queue.shift()!;
        inFlight++;
        describeOne(prompt, a, probe.assetsDir)
          .then(({ description, meta }) => {
            described.push({
              filename: a.filename,
              relpath: a.relpath,
              kind: a.kind,
              width: a.kind === "image" ? a.width : undefined,
              height: a.kind === "image" ? a.height : undefined,
              durationSec: a.kind === "audio" ? a.durationSec : undefined,
              bytes: a.bytes,
              description,
            });
            metas.push(meta);
          })
          .catch(fail)
          .finally(() => {
            inFlight--;
            next();
          });
      }
    };
    next();
  });

  described.sort((x, y) => x.filename.localeCompare(y.filename));

  return { describedAssets: described, metas };
}
