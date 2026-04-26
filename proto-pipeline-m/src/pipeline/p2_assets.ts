import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { generateJson, getActiveClaudeModel, type AnthropicContent } from "./anthropic.ts";
import { AssetMappingSchema, type AssetMapping } from "../schemas/assets.ts";
import { ProbeReportSchema } from "../schemas/probe.ts";
import { MergedVideoSchema, type MergedVideo } from "../schemas/video/merged.ts";
import { describeAssets, type AssetDescribeMeta } from "./p2_describe.ts";

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
  describedAssetsPath: string;
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

  console.log(`[p2] describing ${probe.assets.filter((a) => a.kind === "image").length} image assets in parallel...`);
  const { describedAssets, metas: describeMetas } = await describeAssets(runId, variant);
  const describedPath = join(outDir, "02_assets_described.json");
  await writeFile(
    describedPath,
    JSON.stringify({ assets: describedAssets }, null, 2),
    "utf8",
  );

  const inventory = describedAssets.map((a) => {
    const base: Record<string, unknown> = {
      filename: a.filename,
      kind: a.kind,
    };
    if (a.kind === "image") {
      base.width = a.width;
      base.height = a.height;
    } else {
      base.durationSec = a.durationSec;
    }
    if (a.description) {
      base.description = a.description.description;
      base.category = a.description.category;
      base.dominant_colors_hex = a.description.dominant_colors_hex;
      base.orientation = a.description.orientation;
    }
    return base;
  });

  const systemInstruction = await loadPrompt(variant);
  const userJson = JSON.stringify(
    { merged_video: merged, asset_inventory: inventory },
    null,
    2,
  );
  const userParts: AnthropicContent[] = [{ type: "text", text: userJson }];

  let attempt = 0;
  let lastErr: unknown;
  let sys = systemInstruction;
  const subCalls: SubMeta[] = describeMetas.map((m: AssetDescribeMeta) => ({ ...m }));
  while (attempt < 2) {
    attempt++;
    try {
      const model = getActiveClaudeModel();
      const r = await generateJson(model, sys, userParts, {
        temperature: 0.3,
      });
      const rawMapping = AssetMappingSchema.parse(r.data);
      const validFilenames = new Set(probe.assets.map((a) => a.filename));
      for (const role of rawMapping.roles) {
        if (role.filename && !validFilenames.has(role.filename)) {
          throw new Error(
            `Hallucinated filename: ${role.filename} (role=${role.role})`,
          );
        }
      }
      const seenRoles = new Set<string>();
      const droppedReasons: string[] = [];
      const keptRoles = rawMapping.roles.filter((r) => {
        if (seenRoles.has(r.role)) {
          droppedReasons.push(`${r.role} (duplicate)`);
          return false;
        }
        seenRoles.add(r.role);
        if (r.filename === null && r.match_confidence === "low") {
          droppedReasons.push(`${r.role} (null + low confidence)`);
          return false;
        }
        if (r.filename === null && r.match_confidence === "medium") {
          droppedReasons.push(`${r.role} (null + medium confidence)`);
          return false;
        }
        return true;
      });
      if (droppedReasons.length > 0) {
        console.log(`[p2] pruned ${droppedReasons.length} weak role(s): ${droppedReasons.slice(0, 8).join("; ")}${droppedReasons.length > 8 ? " …" : ""}`);
      }
      const mapping: AssetMapping = { ...rawMapping, roles: keptRoles };

      const categoryByFilename = new Map<string, string>();
      for (const a of describedAssets) {
        if (a.description?.category) {
          categoryByFilename.set(a.filename, a.description.category);
        }
      }
      const mappedFilenames = keptRoles
        .map((r) => r.filename)
        .filter((f): f is string => typeof f === "string");
      const mappedCategories = new Set(
        mappedFilenames
          .map((f) => categoryByFilename.get(f))
          .filter((c): c is string => typeof c === "string"),
      );
      const hasCharacter = mappedCategories.has("character");
      const hasProjectile = mappedCategories.has("projectile");
      if (!hasCharacter && !hasProjectile) {
        const inventoryCats = new Set(
          inventory
            .map((a) => (a as { category?: string }).category)
            .filter((c): c is string => typeof c === "string"),
        );
        const inventoryHasCharacter = inventoryCats.has("character");
        const inventoryHasProjectile = inventoryCats.has("projectile");
        if (!inventoryHasCharacter && !inventoryHasProjectile) {
          throw new Error(
            `P2 produced no character or projectile assets, and the inventory itself contains neither. Asset bank has nothing renderable. Inventory had ${inventory.length} assets, categories: ${[...inventoryCats].join(",") || "none"}.`,
          );
        }
        console.warn(
          `[p2] WARNING: role-map points to no character/projectile assets, but inventory has ${inventoryHasCharacter ? "character " : ""}${inventoryHasProjectile ? "projectile " : ""}assets. Model under-mapped — continuing but downstream may fall back to procedural drawing.`,
        );
      }

      const meta: SubMeta = {
        step: "2_role_map",
        model,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        latencyMs: r.latencyMs,
        attempt,
      };
      subCalls.push(meta);
      const totalIn = subCalls.reduce((s, x) => s + x.tokensIn, 0);
      const totalOut = subCalls.reduce((s, x) => s + x.tokensOut, 0);
      return {
        mapping,
        describedAssetsPath: describedPath,
        meta: {
          totalLatencyMs: Date.now() - t0,
          totalTokensIn: totalIn,
          totalTokensOut: totalOut,
          subCalls,
        },
      };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[p2] role-map attempt ${attempt} failed: ${msg.slice(0, 200)}`);
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
