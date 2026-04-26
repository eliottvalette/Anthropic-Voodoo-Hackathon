import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { generateJson, OPENROUTER_MODELS } from "./openrouter.ts";
import { AssetMapSchema, type AssetMap, type ProbeReport } from "./schemas.ts";

export type AssetMapMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
};

export type AssetMapOutput = {
  assetMap: AssetMap;
  meta: AssetMapMeta;
};

export async function runAssetMap(
  observation: unknown,
  probe: ProbeReport,
): Promise<AssetMapOutput> {
  const promptPath = resolve("prompts/asset_mapping.md");
  const sys = await readFile(promptPath, "utf8");

  const assets = probe.assets.map((a) => ({
    filename: a.filename,
    relpath: a.relpath,
    kind: a.kind,
    width: a.width,
    height: a.height,
    durationSec: a.durationSec,
  }));

  const userPayload = JSON.stringify({ observation, assets }, null, 2);

  const r = await generateJson<unknown>(OPENROUTER_MODELS.sonnet, sys, userPayload, {
    temperature: 0.1,
    maxTokens: 8000,
  });
  const parsed = AssetMapSchema.parse(r.data);

  return {
    assetMap: parsed,
    meta: {
      step: "S2_asset_map",
      model: r.model,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      latencyMs: r.latencyMs,
    },
  };
}

export async function writeAssetMap(
  runDir: string,
  observation: unknown,
  probe: ProbeReport,
): Promise<AssetMapOutput> {
  const out = await runAssetMap(observation, probe);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "02_asset_map.json"), JSON.stringify(out.assetMap, null, 2), "utf8");
  await writeFile(join(runDir, "02_meta.json"), JSON.stringify(out.meta, null, 2), "utf8");
  return out;
}
