import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { generateJson, OPENROUTER_MODELS } from "./openrouter.ts";
import { GameSpecSchema, type GameSpec, type AssetMap } from "./schemas.ts";

export type SpecMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
};

export type SpecOutput = {
  spec: GameSpec;
  meta: SpecMeta;
};

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function runSpec(
  observation: unknown,
  assetMap: AssetMap,
  utilsCatalogPath: string,
  referenceBehaviorPath: string | null,
): Promise<SpecOutput> {
  const promptPath = resolve("prompts/spec_compose.md");
  const sys = await readFile(promptPath, "utf8");

  const utilsCatalog = JSON.parse(await readFile(resolve(utilsCatalogPath), "utf8"));
  const referenceBehavior = referenceBehaviorPath && (await exists(referenceBehaviorPath))
    ? JSON.parse(await readFile(resolve(referenceBehaviorPath), "utf8"))
    : null;

  const userPayload = JSON.stringify(
    {
      observation,
      asset_map: assetMap,
      utils_catalog: utilsCatalog,
      reference_behavior: referenceBehavior,
    },
    null,
    2,
  );

  const r = await generateJson<unknown>(OPENROUTER_MODELS.sonnet, sys, userPayload, {
    temperature: 0.2,
    maxTokens: 12000,
  });
  const parsed = GameSpecSchema.parse(r.data);

  return {
    spec: parsed,
    meta: {
      step: "S3_spec_compose",
      model: r.model,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      latencyMs: r.latencyMs,
    },
  };
}

export async function writeSpec(
  runDir: string,
  observation: unknown,
  assetMap: AssetMap,
  utilsCatalogPath: string,
  referenceBehaviorPath: string | null,
): Promise<SpecOutput> {
  const out = await runSpec(observation, assetMap, utilsCatalogPath, referenceBehaviorPath);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "03_game_spec.json"), JSON.stringify(out.spec, null, 2), "utf8");
  await writeFile(join(runDir, "03_meta.json"), JSON.stringify(out.meta, null, 2), "utf8");
  return out;
}
