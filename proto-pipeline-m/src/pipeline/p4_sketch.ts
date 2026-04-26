import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { generateJson, CLAUDE_MODELS, type AnthropicContent } from "./anthropic.ts";
import { GameSpecSchema, type GameSpec } from "../schemas/gameSpec.ts";
import { P4PlanSchema, type P4Plan, SCENE_ELEMENT_NAMES, type SceneElementName } from "../schemas/p4Plan.ts";
import { P4SketchSchema, type P4Sketch } from "../schemas/p4Sketch.ts";

export type P4SketchMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  attempt: number;
};

export type P4SketchOutput = {
  sketches: Record<SceneElementName, P4Sketch>;
  metas: P4SketchMeta[];
};

const FORBIDDEN_TOKENS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bsetTimeout\b/, reason: "setTimeout banned" },
  { re: /\bsetInterval\b/, reason: "setInterval banned" },
  { re: /\bimport\s/, reason: "import banned" },
  { re: /\brequire\s*\(/, reason: "require() banned" },
  { re: /\beval\s*\(/, reason: "eval() banned" },
];

function staticChecks(
  element: SceneElementName,
  sketch: P4Sketch,
  plan: P4Plan,
  gameSpec: GameSpec,
): void {
  for (const { re, reason } of FORBIDDEN_TOKENS) {
    if (re.test(sketch.js)) {
      throw new Error(`[${element}] ${reason}`);
    }
  }
  for (const required of ["init", "update", "draw"] as const) {
    if (!new RegExp(`\\b${required}\\b\\s*:\\s*function`).test(sketch.js)) {
      throw new Error(`[${element}] missing method "${required}"`);
    }
  }
  if (element === "actors") {
    if (!sketch.js.includes(gameSpec.mechanic_name)) {
      throw new Error(
        `[actors] mechanic_name "${gameSpec.mechanic_name}" must appear verbatim in JS`,
      );
    }
  }
  if (element === "end_card") {
    if (!sketch.js.includes("__cta")) {
      throw new Error(`[end_card] must call window.__cta(...)`);
    }
    if (!sketch.js.includes(gameSpec.cta_url)) {
      throw new Error(`[end_card] must reference cta_url "${gameSpec.cta_url}" verbatim`);
    }
  }
  void plan;
}

async function loadPrompt(variant: string): Promise<string> {
  return await readFile(resolve("prompts", variant, "4_sketch.md"), "utf8");
}

async function loadReference(
  referenceDir: string | null,
): Promise<unknown | null> {
  if (!referenceDir) return null;
  try {
    const expectedPath = join(resolve(referenceDir), "expected_behavior.json");
    const manifestPath = join(resolve(referenceDir), "target_manifest.json");
    const expected = JSON.parse(await readFile(expectedPath, "utf8"));
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    return {
      viewport: manifest?.viewport ?? null,
      mechanic: manifest?.mechanic ?? null,
      expected_behavior: expected,
    };
  } catch {
    return null;
  }
}

async function callOneSketch(
  element: SceneElementName,
  systemBase: string,
  plan: P4Plan,
  gameSpec: GameSpec,
  reference: unknown | null,
): Promise<{ sketch: P4Sketch; meta: P4SketchMeta }> {
  const t0 = Date.now();
  const userPayload = reference
    ? { assigned_element: element, plan, game_spec: gameSpec, reference }
    : { assigned_element: element, plan, game_spec: gameSpec };
  const userParts: AnthropicContent[] = [{ type: "text", text: JSON.stringify(userPayload, null, 2) }];

  let attempt = 0;
  let lastErr: unknown;
  let sys = systemBase;
  while (attempt < 2) {
    attempt++;
    try {
      const r = await generateJson(CLAUDE_MODELS.sonnet, sys, userParts, {
        temperature: 0.4,
      });
      const sketch = P4SketchSchema.parse(r.data);
      if (sketch.element !== element) {
        throw new Error(
          `sketch.element "${sketch.element}" != assigned "${element}"`,
        );
      }
      staticChecks(element, sketch, plan, gameSpec);
      const meta: P4SketchMeta = {
        step: `4_sketch_${element}`,
        model: CLAUDE_MODELS.sonnet,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        latencyMs: Date.now() - t0,
        attempt,
      };
      return { sketch, meta };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[p4-sketch:${element}] attempt ${attempt} failed: ${msg.slice(0, 250)}`);
      if (attempt >= 2) break;
      sys =
        systemBase +
        `\n\nThe previous response failed validation: ${msg.slice(0, 400)}\n\nRe-emit ONLY a JSON object {"element":"${element}","js":"...","uses_engine":[],"notes":"..."}. The js field must be an object literal expression with init/update/draw methods. Forbidden: setTimeout, setInterval, import, require, eval. assigned_element is "${element}".`;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function runP4Sketches(
  runId: string,
  variant = "_default",
  referenceDir: string | null = null,
): Promise<P4SketchOutput> {
  const outDir = resolve("outputs", runId);

  const gameSpec: GameSpec = GameSpecSchema.parse(
    JSON.parse(await readFile(join(outDir, "03_game_spec.json"), "utf8")),
  );
  const plan: P4Plan = P4PlanSchema.parse(
    JSON.parse(await readFile(join(outDir, "04_plan.json"), "utf8")),
  );
  const reference = await loadReference(referenceDir);
  const systemBase = await loadPrompt(variant);

  console.log(`[p4-sketch] running 5 sketches in parallel...`);
  const results = await Promise.all(
    SCENE_ELEMENT_NAMES.map((el) =>
      callOneSketch(el, systemBase, plan, gameSpec, reference),
    ),
  );

  const sketches = {} as Record<SceneElementName, P4Sketch>;
  const metas: P4SketchMeta[] = [];
  for (const { sketch, meta } of results) {
    sketches[sketch.element] = sketch;
    metas.push(meta);
  }
  return { sketches, metas };
}

export async function writeP4Sketches(
  runId: string,
  variant = "_default",
  referenceDir: string | null = null,
): Promise<P4SketchOutput> {
  const outDir = resolve("outputs", runId);
  await mkdir(outDir, { recursive: true });
  const out = await runP4Sketches(runId, variant, referenceDir);
  await writeFile(
    join(outDir, "04_sketches.json"),
    JSON.stringify(out.sketches, null, 2),
    "utf8",
  );
  await writeFile(
    join(outDir, "04_sketches_meta.json"),
    JSON.stringify(out.metas, null, 2),
    "utf8",
  );
  return out;
}
