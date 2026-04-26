import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GameSpecSchema, type GameSpec } from "../schemas/gameSpec.ts";

type CheckResult = {
  id: string;
  criterion: string;
  weight: number;
  pass: boolean;
  expected: unknown;
  got: unknown;
  note?: string;
};

export type DiscrepancyReport = {
  goldId: string;
  totalWeight: number;
  earnedWeight: number;
  scorePct: number;
  byCriterion: Record<string, { weight: number; earned: number }>;
  checks: CheckResult[];
  missingFields: string[];
};

type ExpectedBehavior = {
  initial_state?: {
    player_hp?: number;
    enemy_hp?: number;
    canvas?: string;
    cta_visible?: boolean;
    active_turn?: string;
  };
  damage_model?: {
    castle_hp?: number;
    hit_damage?: number;
    destruction_states?: string[];
  };
  end_state?: {
    victory?: string;
    defeat?: string;
    cta?: string;
  };
  verification_hooks?: {
    state_object?: string;
    required_snapshot_fields?: string[];
  };
};

type TargetManifest = {
  viewport?: {
    logical_width?: number;
    logical_height?: number;
    aspect_ratio?: string;
    scaling?: string;
  };
  mechanic?: {
    name?: string;
    primary_input?: string;
    turn_order?: string[];
    win_condition?: string;
    loss_condition?: string;
  };
  constraints?: {
    single_file_budget_bytes?: number;
    iframe_safe_cta?: boolean;
    external_runtime_dependencies?: boolean;
  };
};

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

function mentions(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n.toLowerCase()));
}

function contributingCriterion(checkId: string): string {
  if (checkId === "damage.destruction_states") return "feedback";
  if (checkId.startsWith("end.cta")) return "playable_ad_compliance";
  if (checkId.startsWith("mech.") || checkId.startsWith("turn.") || checkId.startsWith("damage.") || checkId.startsWith("end.")) {
    return "core_gameplay";
  }
  if (checkId.startsWith("asset.")) return "visual_fidelity";
  if (checkId.startsWith("layout.")) return "layout_and_runtime";
  if (checkId.startsWith("feedback.")) return "feedback";
  if (checkId.startsWith("compliance.")) return "playable_ad_compliance";
  return "layout_and_runtime";
}

function pushCheck(
  out: CheckResult[],
  id: string,
  weight: number,
  pass: boolean,
  expected: unknown,
  got: unknown,
  note?: string,
): void {
  out.push({ id, criterion: contributingCriterion(id), weight, pass, expected, got, note });
}

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function loadGold(goldDir: string): Promise<{
  manifest: TargetManifest;
  expected: ExpectedBehavior;
  rubric: { total: number; criteria: Array<{ name: string; points: number; checks: string[] }> };
}> {
  const dir = resolve(goldDir);
  const [manifest, expected, rubric] = await Promise.all([
    loadJson<TargetManifest>(`${dir}/target_manifest.json`),
    loadJson<ExpectedBehavior>(`${dir}/expected_behavior.json`),
    loadJson<{ total: number; criteria: Array<{ name: string; points: number; checks: string[] }> }>(
      `${dir}/scoring_rubric.json`,
    ),
  ]);
  return { manifest, expected, rubric };
}

export async function loadGameSpec(specPath: string): Promise<GameSpec> {
  const raw = JSON.parse(await readFile(resolve(specPath), "utf8"));
  return GameSpecSchema.parse(raw);
}

export function scoreSpec(
  spec: GameSpec,
  gold: { manifest: TargetManifest; expected: ExpectedBehavior; rubric: { total: number; criteria: Array<{ name: string; points: number }> } },
): DiscrepancyReport {
  const checks: CheckResult[] = [];
  const missing: string[] = [];

  const wMech = 35;
  const wVisual = 20;
  const wFeedback = 15;
  const wCompliance = 15;
  const wLayout = 15;

  const expMechName = gold.manifest.mechanic?.name;
  const expWin = gold.manifest.mechanic?.win_condition ?? gold.expected.end_state?.victory;
  const expLoss = gold.manifest.mechanic?.loss_condition ?? gold.expected.end_state?.defeat;
  const expTurnOrder = gold.manifest.mechanic?.turn_order ?? [];
  const expCastleHp = gold.expected.damage_model?.castle_hp;
  const expDestrStates = gold.expected.damage_model?.destruction_states ?? [];
  const expCanvas = gold.expected.initial_state?.canvas;
  const expSnapFields = gold.expected.verification_hooks?.required_snapshot_fields ?? [];
  const expPrimaryInput = gold.manifest.mechanic?.primary_input;
  const expAspect = gold.manifest.viewport?.aspect_ratio;

  if (expMechName) {
    pushCheck(
      checks,
      "mech.name",
      8,
      norm(spec.mechanic_name) === norm(expMechName),
      expMechName,
      spec.mechanic_name,
    );
  }
  if (expWin) {
    pushCheck(
      checks,
      "mech.win",
      4,
      mentions(spec.win_condition, [expWin, "enemy", "castle", "destroy"]),
      expWin,
      spec.win_condition,
    );
  }
  if (expLoss) {
    pushCheck(
      checks,
      "mech.loss",
      4,
      mentions(spec.loss_condition, [expLoss, "player", "castle", "destroy"]),
      expLoss,
      spec.loss_condition,
    );
  }
  if (expPrimaryInput) {
    const declared = JSON.stringify(spec.numeric_params) + " " + spec.core_loop_one_sentence + " " + spec.first_5s_script;
    pushCheck(
      checks,
      "mech.input",
      4,
      mentions(declared, [expPrimaryInput, "drag", "release", "pull"]),
      expPrimaryInput,
      "(searched in core_loop + first_5s_script + params)",
    );
  }
  if (expTurnOrder.length > 0) {
    const corpus = `${spec.core_loop_one_sentence} ${spec.first_5s_script} ${JSON.stringify(spec.numeric_params)}`;
    const turnHints = ["turn", "alternat", "player_0", "enemy_0", "rotat"];
    pushCheck(
      checks,
      "turn.order",
      8,
      mentions(corpus, turnHints),
      expTurnOrder,
      "(searched in core_loop + first_5s_script)",
    );
  }
  if (expCastleHp !== undefined) {
    const params = spec.numeric_params ?? {};
    const hpKeys = Object.keys(params).filter((k) => /hp|health/i.test(k));
    const hpVals = hpKeys.map((k) => params[k]);
    const matchesDiscrete = hpVals.some((v) => Number(v) === expCastleHp);
    pushCheck(
      checks,
      "damage.hp_value",
      4,
      matchesDiscrete,
      expCastleHp,
      hpVals.length > 0 ? hpVals : "(no hp/health key in numeric_params)",
      hpVals.some((v) => Number(v) > 10) ? "continuous-HP smell (>10)" : undefined,
    );
  }
  if (expDestrStates.length >= 3) {
    const fields = spec.shared_state_shape?.fields ?? [];
    const hpField = fields.find((f) => /hp|health|destr|state/i.test(f.name));
    pushCheck(
      checks,
      "damage.destruction_states",
      3,
      hpField !== undefined,
      expDestrStates,
      hpField ?? "(no hp/destruction field in shared_state_shape)",
    );
  }

  if (gold.expected.end_state?.cta) {
    const ctaOk = typeof spec.cta_url === "string" && /^https?:\/\//.test(spec.cta_url);
    pushCheck(
      checks,
      "end.cta_url",
      6,
      ctaOk,
      "valid http(s) URL",
      spec.cta_url,
    );
    const corpus = `${spec.win_condition} ${spec.loss_condition} ${spec.core_loop_one_sentence}`;
    pushCheck(
      checks,
      "end.cta_both_sides",
      4,
      mentions(corpus, ["cta", "victory", "defeat", "store", "play now"]) || ctaOk,
      "CTA on both victory and defeat",
      "(searched corpus)",
    );
  }

  if (expCanvas || expAspect) {
    const want = (expAspect ?? "9:16").toLowerCase();
    const portraitOk = spec.render_mode === "2d" && (want === "9:16" || want === "portrait");
    pushCheck(
      checks,
      "layout.render_mode",
      3,
      portraitOk,
      `${spec.render_mode} portrait ${want}`,
      spec.render_mode,
    );
  }

  const roleMap = spec.asset_role_map ?? {};
  const roles = Object.keys(roleMap);
  const populatedRoles = roles.filter((r) => roleMap[r] !== null);
  pushCheck(
    checks,
    "asset.populated_count",
    4,
    populatedRoles.length >= 4,
    ">= 4 populated roles",
    populatedRoles.length,
  );
  const roleStr = roles.join(" ").toLowerCase();
  const semanticRoles = [
    { tag: "background", needles: ["background", "bg", "world", "scene"] },
    { tag: "castle_or_target", needles: ["castle", "tower", "target", "structure", "base"] },
    { tag: "projectile", needles: ["projectile", "missile", "bullet", "shot", "ball"] },
    { tag: "actor", needles: ["unit", "hero", "character", "player_unit", "enemy_unit"] },
  ];
  for (const { tag, needles } of semanticRoles) {
    pushCheck(
      checks,
      `asset.semantic.${tag}`,
      2,
      mentions(roleStr, needles),
      needles,
      roles,
    );
  }

  if (expSnapFields.length > 0) {
    const fieldNames = (spec.shared_state_shape?.fields ?? []).map((f) => f.name);
    const fnLower = fieldNames.map((n) => n.toLowerCase());
    const matched = expSnapFields.filter((f) =>
      fnLower.some((n) => n === f.toLowerCase() || n === norm(f) || n.includes(f.toLowerCase())),
    );
    const ratio = expSnapFields.length === 0 ? 1 : matched.length / expSnapFields.length;
    pushCheck(
      checks,
      "layout.snapshot_fields",
      6,
      ratio >= 0.7,
      expSnapFields,
      fieldNames,
      `${matched.length}/${expSnapFields.length} matched`,
    );
  }

  pushCheck(
    checks,
    "compliance.cta_url_set",
    3,
    typeof spec.cta_url === "string" && spec.cta_url.length > 0,
    "non-empty CTA URL",
    spec.cta_url,
  );

  const params = spec.numeric_params ?? {};
  const paramKeys = Object.keys(params);
  pushCheck(
    checks,
    "feedback.numeric_params_present",
    4,
    paramKeys.length >= 3,
    ">= 3 numeric params",
    paramKeys.length,
  );

  const tutorialField = (spec as unknown as { tutorial_loss_at_seconds?: number | null }).tutorial_loss_at_seconds;
  if (tutorialField !== null && tutorialField !== undefined) {
    pushCheck(
      checks,
      "mech.no_tutorial_loss",
      3,
      false,
      "null (gold has no tutorial loss)",
      tutorialField,
      "tutorial_loss_at_seconds present — masks gameplay end conditions",
    );
  }

  const byCriterion: Record<string, { weight: number; earned: number }> = {
    core_gameplay: { weight: 0, earned: 0 },
    visual_fidelity: { weight: 0, earned: 0 },
    feedback: { weight: 0, earned: 0 },
    playable_ad_compliance: { weight: 0, earned: 0 },
    layout_and_runtime: { weight: 0, earned: 0 },
  };
  for (const c of checks) {
    const bucket = byCriterion[c.criterion];
    if (!bucket) continue;
    bucket.weight += c.weight;
    if (c.pass) bucket.earned += c.weight;
  }

  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const earnedWeight = checks.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);

  const goldCriteriaWeights: Record<string, number> = {
    core_gameplay: wMech,
    visual_fidelity: wVisual,
    feedback: wFeedback,
    playable_ad_compliance: wCompliance,
    layout_and_runtime: wLayout,
  };
  let scaled = 0;
  for (const [name, target] of Object.entries(goldCriteriaWeights)) {
    const b = byCriterion[name];
    if (!b || b.weight === 0) continue;
    scaled += (b.earned / b.weight) * target;
  }

  return {
    goldId: "castle_clashers_gold",
    totalWeight,
    earnedWeight,
    scorePct: Math.round(scaled * 10) / 10,
    byCriterion,
    checks,
    missingFields: missing,
  };
}

export async function scoreSpecFromPaths(
  specPath: string,
  goldDir: string,
): Promise<DiscrepancyReport> {
  const [spec, gold] = await Promise.all([loadGameSpec(specPath), loadGold(goldDir)]);
  return scoreSpec(spec, gold);
}

export function summarizeReport(r: DiscrepancyReport): string {
  const lines: string[] = [];
  lines.push(`discrepancy score: ${r.scorePct} / 100`);
  for (const [name, b] of Object.entries(r.byCriterion)) {
    if (b.weight === 0) continue;
    const pct = Math.round((b.earned / b.weight) * 100);
    lines.push(`  ${name.padEnd(24)} ${b.earned}/${b.weight} (${pct}%)`);
  }
  const fails = r.checks.filter((c) => !c.pass);
  if (fails.length > 0) {
    lines.push("");
    lines.push(`fails (${fails.length}):`);
    for (const c of fails) {
      const exp = typeof c.expected === "string" ? c.expected : JSON.stringify(c.expected);
      const got = typeof c.got === "string" ? c.got : JSON.stringify(c.got);
      const expS = String(exp).slice(0, 60);
      const gotS = String(got).slice(0, 60);
      lines.push(`  ✗ ${c.id} (w${c.weight}): expected ${expS} got ${gotS}${c.note ? ` — ${c.note}` : ""}`);
    }
  }
  return lines.join("\n");
}
