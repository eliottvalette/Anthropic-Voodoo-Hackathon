import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { z } from "zod";
import { generateJson, getActiveClaudeModel, type AnthropicContent } from "./anthropic.ts";
import { GameSpecSchema, type GameSpec } from "../schemas/gameSpec.ts";
import {
  P4PlanSchema,
  type P4Plan,
  SCENE_ELEMENT_NAMES,
  type SceneElementName,
} from "../schemas/p4Plan.ts";
import { P4SketchSchema, type P4Sketch } from "../schemas/p4Sketch.ts";
import {
  integrationCheck,
  summarizeReport,
  type IntegrationReport,
} from "./p4_integration_check.ts";

export type P4FinalMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  attempt: number;
};

export type P4FinalOutput = {
  creativeSlot: string;
  integrationReport: IntegrationReport;
  repaired: boolean;
  metas: P4FinalMeta[];
};

const RepairSchema = z
  .object({ js: z.string().min(50), rationale: z.string() })
  .strict();

const FORBIDDEN_TOKENS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bsetTimeout\b/, reason: "setTimeout banned" },
  { re: /\bsetInterval\b/, reason: "setInterval banned" },
  { re: /\bimport\s/, reason: "import banned" },
  { re: /\brequire\s*\(/, reason: "require() banned" },
  { re: /\beval\s*\(/, reason: "eval() banned" },
];

function staticChecks(js: string, gameSpec: GameSpec, plan: P4Plan): string[] {
  const errors: string[] = [];
  for (const { re, reason } of FORBIDDEN_TOKENS) {
    if (re.test(js)) errors.push(reason);
  }
  if (!js.includes(gameSpec.mechanic_name)) {
    errors.push(`mechanic_name "${gameSpec.mechanic_name}" missing from final JS`);
  }
  if (!js.includes(gameSpec.cta_url)) {
    errors.push(`cta_url "${gameSpec.cta_url}" missing from final JS`);
  }
  if (!/__sketches/.test(js)) {
    errors.push(`window.__sketches assignment missing`);
  }
  for (const el of SCENE_ELEMENT_NAMES) {
    if (!new RegExp(`__sketches\\.${el}`).test(js)) {
      errors.push(`window.__sketches.${el} not assigned`);
    }
  }
  void plan;
  return errors;
}

export function compose(
  plan: P4Plan,
  sketches: Record<SceneElementName, P4Sketch>,
  gameSpec: GameSpec,
): string {
  const initialState: Record<string, unknown> = {};
  for (const f of plan.shared_state_shape) {
    initialState[f.name] = f.initial;
  }
  const stateLiteral = JSON.stringify(initialState, null, 2);
  const tickOrderLiteral = JSON.stringify(plan.tick_order);

  const sketchAssignments = SCENE_ELEMENT_NAMES.map(
    (el) => `  __sketches.${el} = ${sketches[el].js};`,
  ).join("\n");

  return `(function(){
  // mechanic: ${gameSpec.mechanic_name}
  // cta: ${gameSpec.cta_url}
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var state = ${stateLiteral};
  if (state.phase === undefined) state.phase = "idle";
  if (state.subPhase === undefined) state.subPhase = null;
  if (state.turnIndex === undefined) state.turnIndex = 0;
  if (state.isOver === undefined) state.isOver = false;
  if (state.ctaVisible === undefined) state.ctaVisible = false;
  window.__state = state;
  window.__advancePhase = function(next){
    var prev = state.phase;
    if (prev === "aiming" && next === "acting") state.turnIndex = (state.turnIndex || 0) + 1;
    state.phase = next;
    if (next === "win" || next === "loss") state.isOver = true;
  };
  var input = { lastX: null, lastY: null, dragging: false };
  var __sketches = {};
${sketchAssignments}
  window.__sketches = __sketches;
  var order = ${tickOrderLiteral};
  for (var i = 0; i < order.length; i++) {
    var s_init = __sketches[order[i]];
    if (s_init && typeof s_init.init === 'function') s_init.init(state, ctx);
  }
  var lastTime = 0;
  function __gameTick(now) {
    var dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0;
    lastTime = now;
    for (var j = 0; j < order.length; j++) {
      var s_u = __sketches[order[j]];
      if (s_u && typeof s_u.update === 'function') s_u.update(state, dt, input);
    }
    for (var k = 0; k < order.length; k++) {
      var s_d = __sketches[order[k]];
      if (s_d && typeof s_d.draw === 'function') s_d.draw(ctx, state);
    }
    requestAnimationFrame(__gameTick);
  }
  requestAnimationFrame(__gameTick);
})();`;
}

async function loadRepairPrompt(variant: string): Promise<string> {
  return await readFile(resolve("prompts", variant, "4_repair.md"), "utf8");
}

async function callRepair(
  systemBase: string,
  plan: P4Plan,
  sketches: Record<SceneElementName, P4Sketch>,
  gameSpec: GameSpec,
  composed: string,
  report: IntegrationReport,
): Promise<{ js: string; rationale: string; meta: P4FinalMeta }> {
  const t0 = Date.now();
  const userParts: AnthropicContent[] = [
    {
      type: "text",
      text: JSON.stringify(
        {
          plan,
          sketches,
          composed,
          integration_report: report,
          game_spec: gameSpec,
        },
        null,
        2,
      ),
    },
  ];
  const model = getActiveClaudeModel();
  const r = await generateJson(model, systemBase, userParts, {
    temperature: 0.2,
  });
  const parsed = RepairSchema.parse(r.data);
  const meta: P4FinalMeta = {
    step: "4_repair",
    model,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    latencyMs: Date.now() - t0,
    attempt: 1,
  };
  return { js: parsed.js, rationale: parsed.rationale, meta };
}

export async function runP4Final(
  runId: string,
  variant = "_default",
): Promise<P4FinalOutput> {
  const outDir = resolve("outputs", runId);

  const gameSpec: GameSpec = GameSpecSchema.parse(
    JSON.parse(await readFile(join(outDir, "03_game_spec.json"), "utf8")),
  );
  const plan: P4Plan = P4PlanSchema.parse(
    JSON.parse(await readFile(join(outDir, "04_plan.json"), "utf8")),
  );
  const sketchesRaw = JSON.parse(
    await readFile(join(outDir, "04_sketches.json"), "utf8"),
  );
  const sketches = {} as Record<SceneElementName, P4Sketch>;
  for (const el of SCENE_ELEMENT_NAMES) {
    sketches[el] = P4SketchSchema.parse(sketchesRaw[el]);
  }

  const metas: P4FinalMeta[] = [];

  let composed = compose(plan, sketches, gameSpec);
  let report = integrationCheck(plan, sketches);
  let staticErrs = staticChecks(composed, gameSpec, plan);
  console.log(`[p4-final] composed mechanically (${composed.length} bytes)`);
  console.log(summarizeReport(report));

  let repaired = false;
  if (!report.ok || staticErrs.length > 0) {
    const repairPrompt = await loadRepairPrompt(variant);
    let lastErr: string | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      console.log(`[p4-final] integration failed; running repair attempt ${attempt}...`);
      try {
        const repair = await callRepair(
          repairPrompt,
          plan,
          sketches,
          gameSpec,
          composed,
          report,
        );
        metas.push({ ...repair.meta, attempt });
        const newComposed = repair.js;
        const newStatic = staticChecks(newComposed, gameSpec, plan);
        if (newStatic.length > 0) {
          lastErr = `static checks still failing: ${newStatic.join("; ")}`;
          composed = newComposed;
          continue;
        }
        composed = newComposed;
        staticErrs = [];
        repaired = true;
        console.log(`[p4-final] repair rationale: ${repair.rationale}`);
        break;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        console.warn(`[p4-final] repair attempt ${attempt} failed: ${lastErr.slice(0, 200)}`);
      }
    }
    if (staticErrs.length > 0) {
      throw new Error(
        `[p4-final] could not satisfy static checks after 2 repair attempts: ${lastErr}`,
      );
    }
  }

  return {
    creativeSlot: composed,
    integrationReport: report,
    repaired,
    metas,
  };
}

export async function writeP4Final(
  runId: string,
  variant = "_default",
): Promise<P4FinalOutput> {
  const outDir = resolve("outputs", runId);
  await mkdir(outDir, { recursive: true });
  const out = await runP4Final(runId, variant);
  await writeFile(
    join(outDir, "04_creative_slot.js"),
    out.creativeSlot,
    "utf8",
  );
  await writeFile(
    join(outDir, "04_integration_report.json"),
    JSON.stringify(out.integrationReport, null, 2),
    "utf8",
  );
  await writeFile(
    join(outDir, "04_final_meta.json"),
    JSON.stringify(
      { repaired: out.repaired, subCalls: out.metas },
      null,
      2,
    ),
    "utf8",
  );
  return out;
}
