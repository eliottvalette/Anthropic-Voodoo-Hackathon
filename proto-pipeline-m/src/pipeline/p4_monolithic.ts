import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { z } from "zod";
import {
  CLAUDE_MODELS,
  generateJson,
  type AnthropicContent,
} from "./anthropic.ts";
import { GameSpecSchema, type GameSpec } from "../schemas/gameSpec.ts";
import { AssetMappingSchema, type AssetMapping } from "../schemas/assets.ts";
import { ProbeReportSchema } from "../schemas/probe.ts";
import {
  buildAssetsBlock,
  buildFilenameResolver,
  injectAssets,
  assertSize,
} from "./assemble.ts";

export type P4MonoMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  attempt: number;
};

export type P4MonoOutput = {
  html: string;
  rationale: string;
  meta: P4MonoMeta;
};

const CodegenResponseSchema = z
  .object({
    html: z.string().min(200),
    rationale: z.string(),
  })
  .strict();

const FORBIDDEN_TOKENS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bsetTimeout\b/, reason: "setTimeout banned (use requestAnimationFrame)" },
  { re: /\bsetInterval\b/, reason: "setInterval banned (use requestAnimationFrame)" },
  { re: /\bimport\s/, reason: "import statement banned" },
  { re: /\brequire\s*\(/, reason: "require() banned" },
  { re: /\beval\s*\(/, reason: "eval() banned" },
  { re: /\bnew\s+Function\s*\(/, reason: "Function() constructor banned" },
  { re: /<script\s+src=/i, reason: "<script src> banned (must be self-contained)" },
  { re: /<iframe/i, reason: "<iframe> banned" },
  { re: /<link\s+[^>]*href=/i, reason: "<link href> banned" },
];

function staticChecks(html: string, gameSpec: GameSpec): string[] {
  const errors: string[] = [];
  for (const { re, reason } of FORBIDDEN_TOKENS) {
    if (re.test(html)) errors.push(reason);
  }
  if (!html.includes(gameSpec.mechanic_name)) {
    errors.push(`mechanic_name "${gameSpec.mechanic_name}" missing from HTML`);
  }
  if (!html.includes(gameSpec.cta_url)) {
    errors.push(`cta_url "${gameSpec.cta_url}" missing from HTML`);
  }
  if (!/<canvas[^>]*id=["']game["']/i.test(html)) {
    errors.push(`<canvas id="game"> missing`);
  }
  if (!/window\.__state\s*=/.test(html)) {
    errors.push(`window.__state assignment missing`);
  }
  if (!/\/\*\s*ASSETS_BASE64\s*\*\//.test(html) && !/const\s+A\s*=\s*\{/.test(html)) {
    errors.push(`neither /* ASSETS_BASE64 */ marker nor const A = {} placeholder found`);
  }
  return errors;
}

async function loadPrompt(variant: string): Promise<string> {
  return await readFile(
    resolve("prompts", variant, "4_codegen_legacy.md"),
    "utf8",
  );
}

async function loadDescribedAssets(runId: string): Promise<unknown[]> {
  const outDir = resolve("outputs", runId);
  try {
    const raw = await readFile(join(outDir, "02_assets_described.json"), "utf8");
    const parsed = JSON.parse(raw) as { assets?: unknown[] };
    return Array.isArray(parsed.assets) ? parsed.assets : [];
  } catch {
    return [];
  }
}

async function loadReference(
  referenceDir: string | null,
): Promise<unknown | null> {
  if (!referenceDir) return null;
  try {
    const expected = JSON.parse(
      await readFile(join(resolve(referenceDir), "expected_behavior.json"), "utf8"),
    );
    const manifest = JSON.parse(
      await readFile(join(resolve(referenceDir), "target_manifest.json"), "utf8"),
    );
    return {
      viewport: manifest?.viewport ?? null,
      mechanic: manifest?.mechanic ?? null,
      expected_behavior: expected,
    };
  } catch {
    return null;
  }
}

function buildAssetsContext(
  mapping: AssetMapping,
  describedAssets: unknown[],
): Array<{
  role: string;
  filename: string | null;
  category?: string;
  description?: string;
  orientation?: string;
  dominant_colors_hex?: string[];
}> {
  type DescribedAsset = {
    filename?: string;
    description?: {
      description?: string;
      category?: string;
      orientation?: string;
      dominant_colors_hex?: string[];
    } | null;
  };
  const byFilename = new Map<string, DescribedAsset>();
  for (const a of describedAssets) {
    const da = a as DescribedAsset;
    if (typeof da.filename === "string") byFilename.set(da.filename, da);
  }
  return mapping.roles.map((r) => {
    const out: {
      role: string;
      filename: string | null;
      category?: string;
      description?: string;
      orientation?: string;
      dominant_colors_hex?: string[];
    } = { role: r.role, filename: r.filename };
    if (r.filename) {
      const d = byFilename.get(r.filename);
      const desc = d?.description;
      if (desc) {
        if (desc.category) out.category = desc.category;
        if (desc.description) out.description = desc.description;
        if (desc.orientation) out.orientation = desc.orientation;
        if (desc.dominant_colors_hex)
          out.dominant_colors_hex = desc.dominant_colors_hex;
      }
    }
    return out;
  });
}

export async function runP4Monolithic(
  runId: string,
  variant = "_default",
  referenceDir: string | null = null,
): Promise<P4MonoOutput> {
  const t0 = Date.now();
  const outDir = resolve("outputs", runId);

  const gameSpec: GameSpec = GameSpecSchema.parse(
    JSON.parse(await readFile(join(outDir, "03_game_spec.json"), "utf8")),
  );
  const codegenPrompt = await readFile(
    join(outDir, "03_codegen_prompt.txt"),
    "utf8",
  );
  const assetMapping: AssetMapping = AssetMappingSchema.parse(
    JSON.parse(await readFile(join(outDir, "02_assets.json"), "utf8")),
  );
  const describedAssets = await loadDescribedAssets(runId);
  const reference = await loadReference(referenceDir);

  const systemBase = await loadPrompt(variant);
  const userPayload: Record<string, unknown> = {
    game_spec: gameSpec,
    codegen_prompt: codegenPrompt,
    assets: buildAssetsContext(assetMapping, describedAssets),
  };
  if (reference) userPayload.reference = reference;

  const userParts: AnthropicContent[] = [
    { type: "text", text: JSON.stringify(userPayload, null, 2) },
  ];

  const model = CLAUDE_MODELS.sonnet;
  console.log(`[p4-mono] single-call codegen with ${model} (forced sonnet)`);

  let attempt = 0;
  let lastErr: unknown;
  let sys = systemBase;
  const maxAttempts = 2;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      const r = await generateJson(model, sys, userParts, {
        temperature: 0.4,
        maxTokens: 16000,
      });
      const parsed = CodegenResponseSchema.parse(r.data);
      const errs = staticChecks(parsed.html, gameSpec);
      if (errs.length > 0) {
        throw new Error(`static checks failed: ${errs.join("; ")}`);
      }
      const meta: P4MonoMeta = {
        step: "4_codegen_monolithic",
        model,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        latencyMs: Date.now() - t0,
        attempt,
      };
      return { html: parsed.html, rationale: parsed.rationale, meta };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `[p4-mono] attempt ${attempt} failed: ${msg.slice(0, 300)}`,
      );
      if (attempt >= maxAttempts) break;
      sys =
        systemBase +
        `\n\nThe previous response failed validation: ${msg.slice(0, 600)}\n\n` +
        `Re-emit ONLY {"html": "...", "rationale": "..."} as a single JSON object. ` +
        `mechanic_name "${gameSpec.mechanic_name}" must appear verbatim in the html. ` +
        `cta_url "${gameSpec.cta_url}" must appear verbatim. ` +
        `<canvas id="game"> must be present. ` +
        `window.__state must be assigned. ` +
        `/* ASSETS_BASE64 */ marker (or const A = {}) must appear once. ` +
        `No setTimeout/setInterval/eval/import/iframe.`;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function writeP4Monolithic(
  runId: string,
  assetsDir: string,
  variant = "_default",
  referenceDir: string | null = null,
): Promise<{ htmlPath: string; bytes: number; output: P4MonoOutput }> {
  const outDir = resolve("outputs", runId);
  await mkdir(outDir, { recursive: true });
  const output = await runP4Monolithic(runId, variant, referenceDir);

  const gameSpec: GameSpec = GameSpecSchema.parse(
    JSON.parse(await readFile(join(outDir, "03_game_spec.json"), "utf8")),
  );
  const probe = ProbeReportSchema.parse(
    JSON.parse(await readFile(join(outDir, "00_probe.json"), "utf8")),
  );
  const resolver = buildFilenameResolver(probe);
  const assetsBlock = await buildAssetsBlock(
    assetsDir,
    gameSpec.asset_role_map,
    resolver,
  );
  const finalHtml = injectAssets(output.html, assetsBlock);
  assertSize(finalHtml);
  const htmlPath = join(outDir, "playable.html");
  await writeFile(htmlPath, finalHtml, "utf8");

  await writeFile(
    join(outDir, "04_codegen_rationale.txt"),
    output.rationale,
    "utf8",
  );
  await writeFile(
    join(outDir, "04_codegen_mono_meta.json"),
    JSON.stringify(output.meta, null, 2),
    "utf8",
  );

  return {
    htmlPath,
    bytes: Buffer.byteLength(finalHtml, "utf8"),
    output,
  };
}
