import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  VerifyReportSchema,
  type VerifyReport,
  type RuntimeTrajectory,
} from "../schemas/verifyReport.ts";

type ExpectedBehavior = {
  initial_state?: Record<string, unknown>;
  damage_model?: { castle_hp?: number; hit_damage?: number };
  end_state?: { cta?: string };
  verification_hooks?: { required_snapshot_fields?: string[] };
};

type Check = {
  id: string;
  pass: boolean;
  weight: number;
  detail: string;
};

export type RuntimeDiscrepancyReport = {
  scorePct: number;
  checks: Check[];
};

const SNAKE_TO_CAMEL: Record<string, string> = {
  player_hp: "playerHp",
  enemy_hp: "enemyHp",
  cta_visible: "ctaVisible",
  active_turn: "activeTurn",
};

function lookup(snap: Record<string, unknown> | null, key: string): unknown {
  if (!snap) return undefined;
  if (key in snap) return snap[key];
  const camel = SNAKE_TO_CAMEL[key];
  if (camel && camel in snap) return snap[camel];
  return undefined;
}

export function scoreRuntime(
  report: VerifyReport,
  expected: ExpectedBehavior,
): RuntimeDiscrepancyReport {
  const checks: Check[] = [];
  const t: RuntimeTrajectory | undefined = report.trajectory;

  const required = expected.verification_hooks?.required_snapshot_fields ?? [];
  if (required.length > 0) {
    const initial = t?.initial ?? null;
    const presentCount = required.filter(
      (f) => lookup(initial, f) !== undefined,
    ).length;
    const ratio = presentCount / required.length;
    checks.push({
      id: "snapshot.required_fields",
      pass: ratio === 1,
      weight: 15,
      detail: `${presentCount}/${required.length} required fields present in initial snapshot`,
    });
  }

  if (expected.initial_state) {
    for (const [k, want] of Object.entries(expected.initial_state)) {
      if (k === "canvas") continue;
      const got = lookup(t?.initial ?? null, k);
      const pass = got !== undefined && got === want;
      checks.push({
        id: `initial.${k}`,
        pass,
        weight: 5,
        detail: `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`,
      });
    }
  }

  const expectedDmg = expected.damage_model?.hit_damage ?? null;
  if (expectedDmg !== null) {
    const dp = t?.hpDeltaPlayer ?? 0;
    const de = t?.hpDeltaEnemy ?? 0;
    const observedHits = Math.max(dp, de);
    const passProportional = observedHits >= expectedDmg;
    checks.push({
      id: "damage.hit_damage",
      pass: passProportional,
      weight: 15,
      detail: `expected hit_damage>=${expectedDmg}, observed max delta=${observedHits} (player=${dp}, enemy=${de})`,
    });
  }

  const expectedCastleHp = expected.damage_model?.castle_hp ?? null;
  if (expectedCastleHp !== null) {
    const initial = t?.initial ?? null;
    const ph = lookup(initial, "player_hp") ?? lookup(initial, "playerHp");
    const eh = lookup(initial, "enemy_hp") ?? lookup(initial, "enemyHp");
    const playerOk = ph === expectedCastleHp;
    const enemyOk = eh === expectedCastleHp;
    checks.push({
      id: "damage.castle_hp_initial",
      pass: playerOk && enemyOk,
      weight: 10,
      detail: `expected ${expectedCastleHp}/${expectedCastleHp}, got player=${ph} enemy=${eh}`,
    });
  }

  checks.push({
    id: "behavior.turn_loop_observed",
    pass: report.turnLoopObserved,
    weight: 10,
    detail: `phasesSeen=${(t?.phasesSeen ?? []).join("|")} turnIndices=${(t?.turnIndicesSeen ?? []).join(",")}`,
  });
  checks.push({
    id: "behavior.hp_decreases_on_hit",
    pass: report.hpDecreasesOnHit,
    weight: 15,
    detail: `dp=${t?.hpDeltaPlayer} de=${t?.hpDeltaEnemy}`,
  });
  checks.push({
    id: "behavior.interaction_state_change",
    pass: report.interactionStateChange,
    weight: 10,
    detail: `inputsTotal=${t?.inputsTotal ?? 0}`,
  });
  checks.push({
    id: "behavior.cta_reachable",
    pass: report.ctaReachable,
    weight: 10,
    detail:
      t?.final && (lookup(t.final, "cta_visible") === true || lookup(t.final, "ctaVisible") === true)
        ? "ctaVisible=true in final snap"
        : "ctaVisible never observed true",
  });

  if (expected.end_state?.cta === "shown for both victory and defeat") {
    checks.push({
      id: "endstate.cta_both_sides",
      pass: report.ctaReachable,
      weight: 5,
      detail: "expected CTA on both win and loss; verifier observed at least one",
    });
  }

  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const earnedWeight = checks
    .filter((c) => c.pass)
    .reduce((s, c) => s + c.weight, 0);
  const scorePct = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 1000) / 10 : 0;

  return { scorePct, checks };
}

export async function loadExpected(referenceDir: string): Promise<ExpectedBehavior> {
  const path = join(resolve(referenceDir), "expected_behavior.json");
  return JSON.parse(await readFile(path, "utf8")) as ExpectedBehavior;
}

export async function scoreRuntimeFromPaths(
  verifyReportPath: string,
  referenceDir: string,
): Promise<RuntimeDiscrepancyReport> {
  const report = VerifyReportSchema.parse(
    JSON.parse(await readFile(verifyReportPath, "utf8")),
  );
  const expected = await loadExpected(referenceDir);
  return scoreRuntime(report, expected);
}

export function summarizeRuntime(rep: RuntimeDiscrepancyReport): string {
  const lines = [`runtime score: ${rep.scorePct}%`];
  for (const c of rep.checks) {
    lines.push(`  ${c.pass ? "✓" : "✗"} [${c.weight}] ${c.id} — ${c.detail}`);
  }
  return lines.join("\n");
}
