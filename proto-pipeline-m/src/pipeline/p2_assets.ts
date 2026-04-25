import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { generateJson, MODELS, type ContentPart } from "./gemini.ts";
import { AssetMappingSchema, type AssetMapping } from "../schemas/assets.ts";
import { ProbeReportSchema } from "../schemas/probe.ts";
import { MergedVideoSchema, type MergedVideo } from "../schemas/video/merged.ts";

type SubMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  attempt: number;
};

export type P2Output = {
  mapping: AssetMapping;
  meta: {
    totalLatencyMs: number;
    totalTokensIn: number;
    totalTokensOut: number;
    subCalls: SubMeta[];
  };
};

async function loadPrompt(variant: string): Promise<string> {
  return await readFile(resolve("prompts", variant, "2_assets.md"), "utf8");
}

export async function runP2(
  runId: string,
  variant = "_default",
): Promise<P2Output> {
  const t0 = Date.now();
  const outDir = resolve("outputs", runId);

  const merged = MergedVideoSchema.parse(
    JSON.parse(await readFile(join(outDir, "01_video.json"), "utf8")),
  ) as MergedVideo;
  const probe = ProbeReportSchema.parse(
    JSON.parse(await readFile(join(outDir, "00_probe.json"), "utf8")),
  );

  const inventory = probe.assets.map((a) => {
    if (a.kind === "image") {
      return {
        filename: a.filename,
        kind: a.kind,
        width: a.width,
        height: a.height,
      };
    }
    return { filename: a.filename, kind: a.kind, durationSec: a.durationSec };
  });

  const systemInstruction = await loadPrompt(variant);
  const userJson = JSON.stringify(
    { merged_video: merged, asset_inventory: inventory },
    null,
    2,
  );
  const userParts: ContentPart[] = [{ text: userJson }];

  let attempt = 0;
  let lastErr: unknown;
  let sys = systemInstruction;
  while (attempt < 2) {
    attempt++;
    try {
      const r = await generateJson(MODELS.pro, sys, userParts);
      const mapping = AssetMappingSchema.parse(r.data);
      const validFilenames = new Set(probe.assets.map((a) => a.filename));
      for (const role of mapping.roles) {
        if (role.filename && !validFilenames.has(role.filename)) {
          throw new Error(
            `Hallucinated filename: ${role.filename} (role=${role.role})`,
          );
        }
      }
      const meta: SubMeta = {
        step: "2_assets",
        model: MODELS.pro,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        latencyMs: r.latencyMs,
        attempt,
      };
      return {
        mapping,
        meta: {
          totalLatencyMs: Date.now() - t0,
          totalTokensIn: meta.tokensIn,
          totalTokensOut: meta.tokensOut,
          subCalls: [meta],
        },
      };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[p2] attempt ${attempt} failed: ${msg.slice(0, 200)}`);
      if (attempt >= 2) break;
      sys =
        systemInstruction +
        `\n\nThe previous response failed validation. Re-emit ONLY a JSON object exactly matching the schema. Use ONLY filenames from asset_inventory; never invent.`;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function writeP2(
  runId: string,
  variant = "_default",
): Promise<{ outDir: string; output: P2Output }> {
  const outDir = resolve("outputs", runId);
  await mkdir(outDir, { recursive: true });
  const output = await runP2(runId, variant);
  await writeFile(
    join(outDir, "02_assets.json"),
    JSON.stringify(output.mapping, null, 2),
    "utf8",
  );
  await writeFile(
    join(outDir, "02_assets_meta.json"),
    JSON.stringify(output.meta, null, 2),
    "utf8",
  );
  return { outDir, output };
}
