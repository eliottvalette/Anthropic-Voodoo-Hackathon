import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { generateJson, OPENROUTER_MODELS } from "./openrouter.ts";
import type { GameSpec } from "./schemas.ts";
import { z } from "zod";

const CodegenOutputSchema = z
  .object({
    game_js: z.string().min(200),
    rationale: z.string(),
  })
  .strict();

export type CodegenMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  htmlBytes: number;
  utilsIncluded: string[];
  staticChecks: { ok: boolean; failures: string[] };
};

export type CodegenOutput = {
  html: string;
  rationale: string;
  meta: CodegenMeta;
};

const FORBIDDEN_TOKENS: Array<{ re: RegExp; reason: string }> = [
  { re: /\btreads?\b/i, reason: "forbidden: treads" },
  { re: /\btilt(s|ed|ing)?\b/i, reason: "forbidden: tilt" },
  { re: /\bcrumble(s|d|ing)?\b/i, reason: "forbidden: crumble" },
  { re: /\btank\b/i, reason: "forbidden: tank" },
  { re: /\bpivot(s|ed|ing)?\b/i, reason: "forbidden: pivot" },
  { re: /tutorial[_ ]loss/i, reason: "forbidden: tutorial_loss" },
  { re: /\bphysics-based destruction\b/i, reason: "forbidden: physics-based destruction" },
];

function staticChecksGameJs(gameJs: string, spec: GameSpec, utilNames: string[]): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  for (const { re, reason } of FORBIDDEN_TOKENS) {
    if (re.test(gameJs)) failures.push(reason);
  }
  if (!gameJs.includes(spec.mechanic_name)) failures.push(`mechanic_name "${spec.mechanic_name}" missing in game_js`);
  if (!/window\.__engineState/.test(gameJs)) failures.push("window.__engineState assignment missing in game_js");
  for (const phase of ["aiming", "projectile"]) {
    if (!new RegExp(`["']${phase}["']`).test(gameJs)) failures.push(`phase string "${phase}" not literal in game_js`);
  }
  // Syntax validation — parse, don't execute. Catches typos like mismatched braces.
  try {
    new Function(gameJs);
  } catch (e) {
    failures.push(`syntax error: ${(e as Error).message.slice(0, 200)}`);
  }
  // Util redefinition: each util signature exposes a function name. If game_js
  // declares the same name, it'll shadow the util — common LLM mistake.
  const knownGlobals = [
    "updateParticles", "drawParticles", "updateFloats", "drawFloats",
    "updateDebris", "drawDebris", "updateDyingSections", "drawSection",
    "drawVsBarTop", "drawHpSegmented", "drawHpPercentage",
    "createDragRelease", "createCamera", "createShake",
    "drawGameWon", "drawGameLost", "drawTryAgain",
    "createWinEffect", "createGameOverEffect",
    "openStore", "isPointInCta",
    "spawnFloat", "spawnDebris", "spawnTrail", "spawnFlash", "spawnShockwave",
    "burst", "smoke", "makeSectionPolys", "makeDyingSection",
  ];
  for (const name of knownGlobals) {
    const re = new RegExp(`\\bfunction\\s+${name}\\b`);
    if (re.test(gameJs)) failures.push(`util "${name}" redefined in game_js (shadows global)`);
  }
  return { ok: failures.length === 0, failures };
}

const RepairOutputSchema = z
  .object({
    game_js: z.string().min(200),
    rationale: z.string(),
  })
  .strict();

async function repairGameJs(
  sys: string,
  originalPayload: string,
  brokenGameJs: string,
  failures: string[],
): Promise<{ game_js: string; rationale: string; tokensIn: number; tokensOut: number; latencyMs: number; model: string }> {
  const repairSys = sys + `\n\n# REPAIR MODE\n\nThe previous output failed these static checks:\n${failures.map((f) => `- ${f}`).join("\n")}\n\nReturn a corrected JSON with ONLY the fixes. The full ORIGINAL output is below. Do not lose features. Output the SAME JSON shape.`;
  const userPayload = originalPayload + `\n\n# previous_output\n${JSON.stringify({ game_js: brokenGameJs })}`;
  const r = await generateJson<unknown>(OPENROUTER_MODELS.sonnet, repairSys, userPayload, {
    temperature: 0.1,
    maxTokens: 32000,
  });
  const parsed = RepairOutputSchema.parse(r.data);
  return {
    game_js: parsed.game_js,
    rationale: parsed.rationale,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    latencyMs: r.latencyMs,
    model: r.model,
  };
}

function staticChecksFinalHtml(html: string, spec: GameSpec): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  if (!html.includes(spec.cta_url)) failures.push(`cta_url "${spec.cta_url}" missing in final html`);
  if (!/mraid\.open\s*\(/.test(html) && !/openStore\s*\(/.test(html)) failures.push("no mraid.open or openStore call");
  if (/<script[^>]*\ssrc\s*=\s*["']https?:/i.test(html)) failures.push("external <script src=http(s)> reference");
  if (/<link[^>]*\shref\s*=\s*["']https?:/i.test(html)) failures.push("external <link href=http(s)> reference");
  return { ok: failures.length === 0, failures };
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// Hard-coded fallback for utils that are referenced as `depends` but not as
// catalog items themselves (e.g. `particles` is the runtime backbone).
const KNOWN_FALLBACK_FILES: Record<string, { file: string; signature: string }> = {
  particles: { file: "vfx/particles.js", signature: "updateParticles(particles, dt) / drawParticles(ctx, particles)" },
  "cta-trigger": { file: "mechanics/cta-trigger.js", signature: "openStore(url)" },
};

async function loadUtilsSources(
  utilNames: string[],
  utilsDir: string,
): Promise<{ included: string[]; missing: string[]; sources: Record<string, { signature: string; source_js: string }> }> {
  const catalog = JSON.parse(await readFile(join(utilsDir, "catalog.json"), "utf8")) as {
    categories: Array<{ items: Array<{ name: string; file: string; signature: string; depends?: string[] }> }>;
  };
  const byName = new Map<string, { file: string; signature: string; depends?: string[] }>();
  for (const cat of catalog.categories) {
    for (const it of cat.items) byName.set(it.name, { file: it.file, signature: it.signature, depends: it.depends });
  }
  const sources: Record<string, { signature: string; source_js: string }> = {};
  const included: string[] = [];
  const missing: string[] = [];
  // Expand: include explicit picks + their declared `depends` + the known fallbacks.
  const expanded = new Set<string>(utilNames);
  for (const name of utilNames) {
    const entry = byName.get(name);
    if (entry?.depends) for (const d of entry.depends) expanded.add(d);
  }
  // particles is implied by smoke/burst/trail/section-destroy regardless of catalog metadata.
  if ([...expanded].some((n) => ["smoke", "burst", "trail", "section-destroy", "shockwave"].includes(n))) {
    expanded.add("particles");
  }
  for (const name of expanded) {
    let entry = byName.get(name) ?? KNOWN_FALLBACK_FILES[name];
    if (!entry) {
      missing.push(name);
      continue;
    }
    const filePath = join(utilsDir, entry.file);
    if (!(await fileExists(filePath))) {
      missing.push(name);
      continue;
    }
    const src = await readFile(filePath, "utf8");
    sources[name] = { signature: entry.signature, source_js: src };
    included.push(name);
  }
  return { included, missing, sources };
}

export type CodegenInputs = {
  spec: GameSpec;
  utilsDir: string;
  shellHtmlPath: string;
  assetsDataUris?: Record<string, string>;
};

const SHELL_GAME_CODE_MARKER_RE = /<script>\s*\(function\s*\(\)\s*\{[\s\S]*?\}\)\(\);?\s*<\/script>\s*<\/body>/i;

function buildFinalHtml(opts: {
  shell: string;
  assetsDataUris: Record<string, string>;
  storeUrl: string;
  utilsBundle: string;
  gameJs: string;
}): string {
  let html = opts.shell;

  const assetsLiteral = JSON.stringify(opts.assetsDataUris);
  const inject = [
    `<script>window.__ASSETS=${assetsLiteral};</script>`,
    `<script>window.STORE_URL=${JSON.stringify(opts.storeUrl)};</script>`,
    `<script>${opts.utilsBundle}</script>`,
    `<script>${opts.gameJs}</script>`,
  ].join("\n");

  // Strip the shell's placeholder GAME_ASSETS / STORE_URL block + the trailing
  // example game-code <script>, then inject ours before </body>.
  html = html.replace(
    /<script>\s*window\.GAME_ASSETS\s*=[\s\S]*?<\/script>/i,
    "",
  );
  if (SHELL_GAME_CODE_MARKER_RE.test(html)) {
    html = html.replace(SHELL_GAME_CODE_MARKER_RE, `${inject}\n</body>`);
  } else if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${inject}\n</body>`);
  } else {
    html = html + inject;
  }

  return html;
}

export async function runCodegen(inputs: CodegenInputs): Promise<CodegenOutput> {
  const promptPath = resolve("prompts/s4_codegen.md");
  const sys = await readFile(promptPath, "utf8");

  const { included, missing, sources } = await loadUtilsSources(inputs.spec.util_picks, inputs.utilsDir);

  const assetsAvailable = Object.keys(inputs.assetsDataUris ?? {});
  const utilsSignatures: Record<string, { signature: string; description: string }> = {};
  for (const [k, v] of Object.entries(sources)) {
    utilsSignatures[k] = { signature: v.signature, description: "" };
  }

  const userPayload = JSON.stringify(
    {
      spec: inputs.spec,
      utils_signatures: utilsSignatures,
      assets_available: assetsAvailable,
      missing_utils: missing,
    },
    null,
    2,
  );

  const r = await generateJson<unknown>(OPENROUTER_MODELS.sonnet, sys, userPayload, {
    temperature: 0.2,
    maxTokens: 32000,
  });
  const parsed = CodegenOutputSchema.parse(r.data);

  let gameJs = parsed.game_js;
  let rationale = parsed.rationale;
  let tokensIn = r.tokensIn;
  let tokensOut = r.tokensOut;
  let latencyMs = r.latencyMs;
  let model = r.model;

  let gameChecks = staticChecksGameJs(gameJs, inputs.spec, included);
  if (!gameChecks.ok) {
    console.log(`[codegen] static checks failed (${gameChecks.failures.join("; ")}); requesting repair...`);
    try {
      const fix = await repairGameJs(sys, userPayload, gameJs, gameChecks.failures);
      const fixChecks = staticChecksGameJs(fix.game_js, inputs.spec, included);
      if (fixChecks.ok || fixChecks.failures.length < gameChecks.failures.length) {
        gameJs = fix.game_js;
        rationale = fix.rationale + " [repaired]";
        tokensIn += fix.tokensIn;
        tokensOut += fix.tokensOut;
        latencyMs += fix.latencyMs;
        model = fix.model;
        gameChecks = fixChecks;
      }
    } catch (e) {
      console.warn(`[codegen] repair failed: ${(e as Error).message.slice(0, 200)}`);
    }
  }

  const shell = await readFile(inputs.shellHtmlPath, "utf8");
  const utilsBundle = Object.values(sources).map((v) => v.source_js).join("\n;\n");
  const finalHtml = buildFinalHtml({
    shell,
    assetsDataUris: inputs.assetsDataUris ?? {},
    storeUrl: inputs.spec.cta_url,
    utilsBundle,
    gameJs,
  });
  const htmlChecks = staticChecksFinalHtml(finalHtml, inputs.spec);
  const checks = {
    ok: gameChecks.ok && htmlChecks.ok,
    failures: [...gameChecks.failures, ...htmlChecks.failures],
  };
  return {
    html: finalHtml,
    rationale,
    meta: {
      step: "S4_codegen",
      model,
      tokensIn,
      tokensOut,
      latencyMs,
      htmlBytes: Buffer.byteLength(finalHtml, "utf8"),
      utilsIncluded: included,
      staticChecks: checks,
    },
  };
}

export async function writeCodegen(runDir: string, inputs: CodegenInputs): Promise<CodegenOutput> {
  const out = await runCodegen(inputs);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "playable.html"), out.html, "utf8");
  await writeFile(
    join(runDir, "04_codegen_meta.json"),
    JSON.stringify(out.meta, null, 2),
    "utf8",
  );
  await writeFile(join(runDir, "04_rationale.txt"), out.rationale, "utf8");
  // Extract just the game_js block from the final HTML for inspection.
  const m = out.html.match(/<script>\(function\(\)\{[\s\S]*?\}\)\(\);?<\/script>\s*<\/body>/);
  if (m) {
    const inner = m[0].replace(/^<script>/, "").replace(/<\/script>\s*<\/body>$/, "");
    await writeFile(join(runDir, "04_game.js"), inner, "utf8");
  }
  return out;
}
