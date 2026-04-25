import type { GameSpec, SharedStateShape } from "../schemas/gameSpec.ts";
import type { SubsystemName, SubsystemWinner } from "./p4_subsystems.ts";

const STATEMENT_START_PAT = /^\s*(var|let|const|function|class|import|export)\s/;

function assertExpression(name: SubsystemName, src: string): void {
  const trimmed = src.trim();
  if (!trimmed) throw new Error(`p4_aggregator: ${name} subsystem source is empty`);
  if (STATEMENT_START_PAT.test(trimmed)) {
    throw new Error(
      `p4_aggregator: ${name} subsystem starts with a statement keyword (var/let/const/function/class) — must be an expression (e.g. IIFE or object literal)`,
    );
  }
  try {
    new Function(`"use strict"; return (${trimmed});`);
  } catch (e) {
    throw new Error(
      `p4_aggregator: ${name} subsystem failed expression parse: ${(e as Error).message}`,
    );
  }
}

function buildInitialState(shape: SharedStateShape, gameSpec: GameSpec): string {
  const lines: string[] = [];
  for (const f of shape.fields) {
    lines.push(`    ${JSON.stringify(f.name)}: ${JSON.stringify(f.initial)}`);
  }
  if (!shape.fields.find((f) => f.name === "phase")) {
    lines.push(`    "phase": "play"`);
  }
  if (!shape.fields.find((f) => f.name === "t")) {
    lines.push(`    "t": 0`);
  }
  if (!shape.fields.find((f) => f.name === "numericParams")) {
    lines.push(`    "numericParams": ${JSON.stringify(gameSpec.numeric_params)}`);
  }
  if (!shape.fields.find((f) => f.name === "tutorial_loss_at_seconds")) {
    lines.push(`    "tutorial_loss_at_seconds": ${JSON.stringify(gameSpec.tutorial_loss_at_seconds)}`);
  }
  return `{\n${lines.join(",\n")}\n  }`;
}

export function aggregateCreativeSlot(
  gameSpec: GameSpec,
  winners: Record<SubsystemName, SubsystemWinner>,
): string {
  for (const n of ["input", "physics", "render", "state", "winloss"] as SubsystemName[]) {
    assertExpression(n, winners[n].source);
  }

  const initialState = buildInitialState(gameSpec.shared_state_shape, gameSpec);
  const mechanicMarker = JSON.stringify(gameSpec.mechanic_name);

  return `(function(){
  const A = window.__A || {};
  const __MECHANIC = ${mechanicMarker}; void __MECHANIC;
  const state = ${initialState};
  const Input    = (${winners.input.source});
  const Physics  = (${winners.physics.source});
  const Renderer = (${winners.render.source});
  const Game     = (${winners.state.source});
  const Outcome  = (${winners.winloss.source});
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  if (Input.init)    Input.init(canvas, state);
  if (Renderer.init) Renderer.init(canvas, state);
  if (Game.init)     Game.init(state);
  var last = performance.now();
  function loop(now){
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    state.t = (state.t || 0) + dt;
    if (Input.frame)    Input.frame(state, dt);
    if (Game.frame)     Game.frame(state, dt);
    if (Physics.frame)  Physics.frame(state, dt);
    if (Renderer.frame) Renderer.frame(state, dt, ctx);
    if (Outcome.isOver && Outcome.isOver(state) && Outcome.draw) Outcome.draw(state, ctx);
    if (Outcome.frame)  Outcome.frame(state, dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
`;
}
