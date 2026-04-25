import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { generateJson, MODELS, type ContentPart } from "./gemini.ts";
import {
  AggregatorOutputSchema,
  type AggregatorOutput,
  type GameSpec,
} from "../schemas/gameSpec.ts";
import { MergedVideoSchema } from "../schemas/video/merged.ts";
import { AssetMappingSchema } from "../schemas/assets.ts";
import { scaffoldCheck, ScaffoldError, REQUIRED_SECTIONS } from "./scaffoldCheck.ts";

type SubMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  attempt: number;
};

export type P3Output = {
  gameSpec: GameSpec;
  codegenPrompt: string;
  meta: {
    totalLatencyMs: number;
    totalTokensIn: number;
    totalTokensOut: number;
    subCalls: SubMeta[];
  };
};

async function loadPrompt(variant: string): Promise<string> {
  return await readFile(resolve("prompts", variant, "3_aggregator.md"), "utf8");
}

export async function runP3(
  runId: string,
  variant = "_default",
): Promise<P3Output> {
  const t0 = Date.now();
  const outDir = resolve("outputs", runId);

  const merged = MergedVideoSchema.parse(
    JSON.parse(await readFile(join(outDir, "01_video.json"), "utf8")),
  );
  const assets = AssetMappingSchema.parse(
    JSON.parse(await readFile(join(outDir, "02_assets.json"), "utf8")),
  );

  const systemBase = await loadPrompt(variant);
  const userJson = JSON.stringify({ video: merged, assets }, null, 2);
  const userParts: ContentPart[] = [{ text: userJson }];

  const subCalls: SubMeta[] = [];
  let attempt = 0;
  let lastErr: unknown;
  let sys = systemBase;

  while (attempt < 2) {
    attempt++;
    try {
      const r = await generateJson<AggregatorOutput>(MODELS.pro, sys, userParts);
      const parsed = AggregatorOutputSchema.parse(r.data);
      scaffoldCheck(parsed.codegen_prompt, parsed.game_spec.mechanic_name);
      subCalls.push({
        step: "3_aggregator",
        model: MODELS.pro,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        latencyMs: r.latencyMs,
        attempt,
      });
      return {
        gameSpec: parsed.game_spec,
        codegenPrompt: parsed.codegen_prompt,
        meta: {
          totalLatencyMs: Date.now() - t0,
          totalTokensIn: subCalls.reduce((s, x) => s + x.tokensIn, 0),
          totalTokensOut: subCalls.reduce((s, x) => s + x.tokensOut, 0),
          subCalls,
        },
      };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[p3] attempt ${attempt} failed: ${msg.slice(0, 300)}`);
      if (attempt >= 2) break;
      const reminder =
        e instanceof ScaffoldError
          ? `Your codegen_prompt was missing required sections (${e.missing.join(", ")}). Re-emit JSON with codegen_prompt that contains EVERY section header verbatim, in order: ${REQUIRED_SECTIONS.join(" / ")}.`
          : `The previous response failed schema validation. Re-emit ONLY a JSON object {"game_spec": ..., "codegen_prompt": "..."} that exactly matches the schema. snake_case mechanic_name. No markdown fences.`;
      sys = systemBase + "\n\n" + reminder;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function writeP3(
  runId: string,
  variant = "_default",
): Promise<{ outDir: string; output: P3Output }> {
  const outDir = resolve("outputs", runId);
  await mkdir(outDir, { recursive: true });
  const output = await runP3(runId, variant);
  await writeFile(
    join(outDir, "03_game_spec.json"),
    JSON.stringify(output.gameSpec, null, 2),
    "utf8",
  );
  await writeFile(
    join(outDir, "03_codegen_prompt.txt"),
    output.codegenPrompt,
    "utf8",
  );
  await writeFile(
    join(outDir, "03_aggregator_meta.json"),
    JSON.stringify(output.meta, null, 2),
    "utf8",
  );
  return { outDir, output };
}
