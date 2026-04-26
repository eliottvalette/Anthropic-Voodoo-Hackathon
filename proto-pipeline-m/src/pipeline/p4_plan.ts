import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { generateJson, getActiveClaudeModel, type AnthropicContent } from "./anthropic.ts";
import { GameSpecSchema, type GameSpec } from "../schemas/gameSpec.ts";
import { P4PlanSchema, type P4Plan, SCENE_ELEMENT_NAMES } from "../schemas/p4Plan.ts";

function reconcileReadWriteIndex(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const r = raw as Record<string, unknown>;
  const fields = r.shared_state_shape;
  const elements = r.scene_elements;
  if (!Array.isArray(fields) || typeof elements !== "object" || elements === null) return raw;
  const elMap = elements as Record<string, { reads?: unknown; writes?: unknown }>;
  for (const f of fields) {
    if (typeof f !== "object" || f === null) continue;
    const field = f as Record<string, unknown>;
    if (typeof field.name !== "string") continue;
    const writers: string[] = [];
    const readers: string[] = [];
    for (const el of SCENE_ELEMENT_NAMES) {
      const contract = elMap[el];
      if (!contract) continue;
      if (Array.isArray(contract.writes) && contract.writes.includes(field.name)) writers.push(el);
      if (Array.isArray(contract.reads) && contract.reads.includes(field.name)) readers.push(el);
    }
    field.written_by = writers;
    field.read_by = readers;
  }
  return raw;
}

const RESERVED = new Set(["phase", "subPhase", "turnIndex", "isOver"]);

function pruneDeadState(plan: P4Plan): void {
  const keep = plan.shared_state_shape.filter(
    (f) => RESERVED.has(f.name) || f.read_by.length > 0,
  );
  const dropped = plan.shared_state_shape
    .filter((f) => !RESERVED.has(f.name) && f.read_by.length === 0)
    .map((f) => f.name);
  if (dropped.length > 0) {
    console.warn(
      `[p4-plan] auto-pruned ${dropped.length} dead-state field(s): ${dropped.join(", ")}`,
    );
    plan.shared_state_shape = keep;
    const surviving = new Set(keep.map((f) => f.name));
    for (const el of [
      "bg_ground",
      "actors",
      "projectiles",
      "hud",
      "end_card",
    ] as const) {
      const c = plan.scene_elements[el];
      c.reads = c.reads.filter((r) => surviving.has(r));
      c.writes = c.writes.filter((w) => surviving.has(w));
    }
  }
}

function warnReadsCap(plan: P4Plan): void {
  for (const el of ["bg_ground", "actors", "projectiles", "hud", "end_card"] as const) {
    const c = plan.scene_elements[el];
    if (c.reads.length > 5) {
      console.warn(
        `[p4-plan] ${el}.reads has ${c.reads.length} entries (soft target ≤5); not blocking`,
      );
    }
  }
}

function reconcileNumericParams(plan: P4Plan, gameSpec: GameSpec): void {
  const specKeys = new Set(Object.keys(gameSpec.numeric_params));
  const planKeys = Object.keys(plan.numeric_params);
  const extras = planKeys.filter((k) => !specKeys.has(k));
  if (extras.length > 0) {
    console.warn(
      `[p4-plan] numeric_params has keys not in GameSpec: ${extras.join(", ")} — dropping`,
    );
    for (const k of extras) delete plan.numeric_params[k];
  }
  for (const [k, v] of Object.entries(gameSpec.numeric_params)) {
    if (plan.numeric_params[k] === undefined) {
      plan.numeric_params[k] = v;
    }
  }
}

export type P4PlanMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  attempt: number;
};

export type P4PlanOutput = {
  plan: P4Plan;
  meta: P4PlanMeta;
};

async function loadPrompt(variant: string): Promise<string> {
  return await readFile(resolve("prompts", variant, "4_plan.md"), "utf8");
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
  } catch (e) {
    console.warn(`[p4-plan] reference unreadable: ${(e as Error).message}`);
    return null;
  }
}

export async function runP4Plan(
  runId: string,
  variant = "_default",
  referenceDir: string | null = null,
): Promise<P4PlanOutput> {
  const t0 = Date.now();
  const outDir = resolve("outputs", runId);

  const gameSpec: GameSpec = GameSpecSchema.parse(
    JSON.parse(await readFile(join(outDir, "03_game_spec.json"), "utf8")),
  );
  const codegenPrompt = await readFile(
    join(outDir, "03_codegen_prompt.txt"),
    "utf8",
  );
  const reference = await loadReference(referenceDir);

  const systemBase = await loadPrompt(variant);
  const userJson = JSON.stringify(
    reference
      ? { game_spec: gameSpec, codegen_prompt: codegenPrompt, reference }
      : { game_spec: gameSpec, codegen_prompt: codegenPrompt },
    null,
    2,
  );
  const userParts: AnthropicContent[] = [{ type: "text", text: userJson }];

  let attempt = 0;
  let lastErr: unknown;
  let sys = systemBase;
  const maxAttempts = 3;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      const model = getActiveClaudeModel();
      const r = await generateJson(model, sys, userParts, {
        temperature: 0.3,
      });
      const reconciled = reconcileReadWriteIndex(r.data);
      const plan = P4PlanSchema.parse(reconciled);
      if (plan.mechanic_name !== gameSpec.mechanic_name) {
        throw new Error(
          `plan.mechanic_name "${plan.mechanic_name}" != game_spec.mechanic_name "${gameSpec.mechanic_name}"`,
        );
      }
      pruneDeadState(plan);
      warnReadsCap(plan);
      reconcileNumericParams(plan, gameSpec);
      const meta: P4PlanMeta = {
        step: "4_plan",
        model,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        latencyMs: Date.now() - t0,
        attempt,
      };
      return { plan, meta };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[p4-plan] attempt ${attempt} failed: ${msg.slice(0, 300)}`);
      if (attempt >= maxAttempts) break;
      sys =
        systemBase +
        `\n\nThe previous response failed validation: ${msg.slice(0, 600)}\n\nRe-emit ONLY a JSON object exactly matching the schema. tick_order must be exactly ["bg_ground","actors","projectiles","hud","end_card"]. Every entry in any scene_elements[*].reads or .writes must reference a name declared in shared_state_shape[*].name. mechanic_name must equal "${gameSpec.mechanic_name}" exactly. (You do not need to populate read_by/written_by — set them to []; we derive them from scene_elements.reads/writes.)`;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function writeP4Plan(
  runId: string,
  variant = "_default",
  referenceDir: string | null = null,
): Promise<P4PlanOutput> {
  const outDir = resolve("outputs", runId);
  await mkdir(outDir, { recursive: true });
  const out = await runP4Plan(runId, variant, referenceDir);
  await writeFile(
    join(outDir, "04_plan.json"),
    JSON.stringify(out.plan, null, 2),
    "utf8",
  );
  await writeFile(
    join(outDir, "04_plan_meta.json"),
    JSON.stringify(out.meta, null, 2),
    "utf8",
  );
  return out;
}
