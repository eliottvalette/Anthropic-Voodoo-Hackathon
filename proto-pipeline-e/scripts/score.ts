import { chromium, type Page } from "playwright";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { resolve, basename, dirname, join } from "node:path";

type Check = {
  id: string;
  category: string;
  points: number;
  pass: boolean | null;
  notes: string;
};

const RUBRIC = {
  core_gameplay: {
    points: 35,
    checks: [
      "turn_order_alternates",
      "drag_release_fires_one_projectile",
      "enemy_auto_fires",
      "projectiles_ballistic",
      "hits_advance_damage_state",
    ],
  },
  visual_fidelity: {
    points: 20,
    checks: [
      "uses_castle_clashers_assets",
      "player_left_enemy_right",
      "portrait_9_16",
      "top_bar_player_timer_enemy",
    ],
  },
  feedback: {
    points: 15,
    checks: [
      "trajectory_preview_while_dragging",
      "hits_produce_juice",
      "castle_destruction_three_states",
    ],
  },
  playable_ad_compliance: {
    points: 15,
    checks: [
      "single_file_exists",
      "cta_on_win_and_loss",
      "cta_uses_mraid_or_window_open",
      "no_external_runtime_libs",
    ],
  },
  layout_and_runtime: {
    points: 15,
    checks: [
      "canvas_9_16_scaled",
      "no_overflow",
      "engine_state_has_required_fields",
      "size_under_5mb",
    ],
  },
} as const;

type CategoryName = keyof typeof RUBRIC;

const REQUIRED_FIELDS = [
  "phase",
  "turnIndex",
  "playerHp",
  "enemyHp",
  "projectiles",
  "inputs",
  "ctaVisible",
];

const KNOWN_ASSET_FINGERPRINTS = [
  "Blue Castle",
  "Red Castle",
  "castle_player",
  "castle_enemy",
  "Background",
  "bg_gameplay",
  "Projectile_",
  "proj_",
  "char_cyclops",
  "char_skeleton",
  "char_ninja",
  "char_goblin",
  "Weapon_",
];

async function snapshot(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    const w = window as unknown as { __engineState?: { snapshot?: () => unknown } & Record<string, unknown> };
    const s = w.__engineState;
    if (!s) return null;
    try {
      if (typeof s.snapshot === "function") {
        const snap = s.snapshot();
        if (snap && typeof snap === "object") return JSON.parse(JSON.stringify(snap));
      }
    } catch {}
    const out: Record<string, unknown> = {};
    for (const k of [
      "phase",
      "turnIndex",
      "playerHp",
      "enemyHp",
      "projectiles",
      "inputs",
      "ctaVisible",
      "result",
    ]) {
      try {
        out[k] = (s as Record<string, unknown>)[k];
      } catch {}
    }
    return out;
  });
}

async function dragOnCanvas(page: Page, fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
  const canvas = await page.locator("canvas").first().boundingBox();
  if (!canvas) return;
  const ax = canvas.x + (fromX / 360) * canvas.width;
  const ay = canvas.y + (fromY / 640) * canvas.height;
  const bx = canvas.x + (toX / 360) * canvas.width;
  const by = canvas.y + (toY / 640) * canvas.height;
  await page.mouse.move(ax, ay);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    await page.mouse.move(ax + (bx - ax) * t, ay + (by - ay) * t, { steps: 1 });
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(80);
  await page.mouse.up();
}

// Try a grid of canvas-local origins, dragging ~80px back-and-up from each, until
// one of them changes turnIndex / projectiles / inputs. Returns the working origin
// or null. Restores nothing — the side-effect on game state is what we want.
async function findLiveDragOrigin(page: Page): Promise<{ x: number; y: number } | null> {
  const before = await snapshot(page);
  const beforeKey = JSON.stringify({
    t: before?.["turnIndex"] ?? null,
    p: before?.["projectiles"] ?? null,
    i: before?.["inputs"] ?? null,
  });
  const candidates: Array<{ x: number; y: number }> = [];
  for (const cy of [220, 320, 420, 520]) {
    for (const cx of [60, 120, 180, 240, 300]) candidates.push({ x: cx, y: cy });
  }
  for (const c of candidates) {
    await dragOnCanvas(page, c.x, c.y, Math.max(8, c.x - 60), c.y - 50);
    await page.waitForTimeout(120);
    const after = await snapshot(page);
    const afterKey = JSON.stringify({
      t: after?.["turnIndex"] ?? null,
      p: after?.["projectiles"] ?? null,
      i: after?.["inputs"] ?? null,
    });
    if (afterKey !== beforeKey) return c;
  }
  return null;
}

async function score(htmlPath: string): Promise<{ total: number; max: number; checks: Check[]; perCategory: Record<string, { earned: number; max: number }> }> {
  const abs = resolve(htmlPath);
  const html = await readFile(abs, "utf8");
  const fileSize = (await stat(abs)).size;
  const checks: Check[] = [];
  const ctaIntercepts: string[] = [];
  const consoleErrors: string[] = [];

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  await page.exposeFunction("__captureCta", (url: string) => {
    ctaIntercepts.push(url);
  });
  await page.addInitScript(() => {
    const w = window as unknown as { mraid?: unknown; open: typeof window.open };
    (w as any).mraid = {
      getState: () => "default",
      addEventListener: () => {},
      removeEventListener: () => {},
      open: (url: string) => (window as any).__captureCta(url),
    };
    const origOpen = w.open.bind(w);
    w.open = ((url?: string) => {
      if (url) (window as any).__captureCta(url);
      return null;
    }) as typeof window.open;
  });
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message.slice(0, 300)}`));

  await page.goto(`file://${abs}`, { waitUntil: "load" });
  await page.waitForTimeout(1500);

  const initial = await snapshot(page);
  const turnIndices: number[] = [];
  const phases: string[] = [];
  const ctaSeen: boolean[] = [];

  if (initial && typeof initial["turnIndex"] === "number") turnIndices.push(initial["turnIndex"] as number);
  if (initial && typeof initial["phase"] === "string") phases.push(initial["phase"] as string);
  if (initial && typeof initial["ctaVisible"] === "boolean") ctaSeen.push(initial["ctaVisible"] as boolean);

  const projectilesBefore = countProjectiles(initial);
  const enemyHpBefore = numField(initial, ["enemyHp", "enemyHealth"]);
  const playerHpBefore = numField(initial, ["playerHp", "playerHealth"]);

  const liveOrigin = await findLiveDragOrigin(page);
  const dragFrom = liveOrigin ?? { x: 80, y: 540 };
  const dragTo = { x: Math.max(8, dragFrom.x - 60), y: dragFrom.y - 50 };

  await page.waitForTimeout(400);
  const afterDrag1 = await snapshot(page);
  const projAfter1 = countProjectiles(afterDrag1);
  if (afterDrag1 && typeof afterDrag1["turnIndex"] === "number") turnIndices.push(afterDrag1["turnIndex"] as number);
  if (afterDrag1 && typeof afterDrag1["phase"] === "string") phases.push(afterDrag1["phase"] as string);

  await page.waitForTimeout(2500);
  const afterEnemy = await snapshot(page);
  if (afterEnemy && typeof afterEnemy["turnIndex"] === "number") turnIndices.push(afterEnemy["turnIndex"] as number);
  if (afterEnemy && typeof afterEnemy["phase"] === "string") phases.push(afterEnemy["phase"] as string);
  const projAfterEnemy = countProjectiles(afterEnemy);
  const playerHpAfterEnemy = numField(afterEnemy, ["playerHp", "playerHealth"]);

  for (let i = 0; i < 6; i++) {
    await dragOnCanvas(page, dragFrom.x, dragFrom.y, dragTo.x, dragTo.y);
    await page.waitForTimeout(2000);
    const s = await snapshot(page);
    if (s && typeof s["turnIndex"] === "number") turnIndices.push(s["turnIndex"] as number);
    if (s && typeof s["phase"] === "string") phases.push(s["phase"] as string);
    if (s && typeof s["ctaVisible"] === "boolean") ctaSeen.push(s["ctaVisible"] as boolean);
  }

  await page.waitForTimeout(1500);
  const finalState = await snapshot(page);
  const enemyHpAfter = numField(finalState, ["enemyHp", "enemyHealth"]);
  const playerHpAfter = numField(finalState, ["playerHp", "playerHealth"]);

  const overflow = await page.evaluate(() => {
    return {
      bodyScrollW: document.body.scrollWidth,
      bodyClientW: document.body.clientWidth,
      bodyScrollH: document.body.scrollHeight,
      bodyClientH: document.body.clientHeight,
    };
  });

  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector("canvas") as HTMLCanvasElement | null;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { width: c.width, height: c.height, rectW: r.width, rectH: r.height };
  });

  await browser.close();

  const cat = (id: string, points: number, pass: boolean | null, notes: string, category: CategoryName) =>
    checks.push({ id, category, points, pass, notes });

  const turnDistinct = new Set(turnIndices).size;
  const phaseDistinct = new Set(phases).size;
  cat(
    "turn_order_alternates",
    7,
    turnDistinct >= 2 || phaseDistinct >= 2,
    `turnIndices=${JSON.stringify(turnIndices)} phases=${JSON.stringify(phases.slice(0, 8))}`,
    "core_gameplay",
  );
  cat(
    "drag_release_fires_one_projectile",
    7,
    projAfter1 !== null && projectilesBefore !== null && projAfter1 - projectilesBefore === 1,
    `projectilesBefore=${projectilesBefore} after1=${projAfter1}`,
    "core_gameplay",
  );
  cat(
    "enemy_auto_fires",
    7,
    (projAfterEnemy !== null && projAfter1 !== null && projAfterEnemy > projAfter1) ||
      (playerHpAfterEnemy !== null && playerHpBefore !== null && playerHpAfterEnemy < playerHpBefore),
    `projAfter1=${projAfter1} projAfterEnemy=${projAfterEnemy} playerHp ${playerHpBefore}→${playerHpAfterEnemy}`,
    "core_gameplay",
  );
  const ballistic = checkBallistic(initial, afterDrag1, afterEnemy);
  cat("projectiles_ballistic", 7, ballistic.pass, ballistic.notes, "core_gameplay");
  cat(
    "hits_advance_damage_state",
    7,
    enemyHpAfter !== null && enemyHpBefore !== null && enemyHpAfter < enemyHpBefore,
    `enemyHp ${enemyHpBefore}→${enemyHpAfter}`,
    "core_gameplay",
  );

  const fingerprintHits = KNOWN_ASSET_FINGERPRINTS.filter((f) => html.includes(f));
  cat(
    "uses_castle_clashers_assets",
    5,
    fingerprintHits.length >= 2,
    `fingerprints=${JSON.stringify(fingerprintHits)}`,
    "visual_fidelity",
  );
  const positions = readCastlePositions(initial);
  cat(
    "player_left_enemy_right",
    5,
    positions.pass,
    positions.notes,
    "visual_fidelity",
  );
  const portraitOk = canvasInfo ? canvasInfo.height >= canvasInfo.width : false;
  cat(
    "portrait_9_16",
    5,
    portraitOk,
    canvasInfo ? `canvas ${canvasInfo.width}x${canvasInfo.height}` : "no canvas",
    "visual_fidelity",
  );
  cat(
    "top_bar_player_timer_enemy",
    5,
    null,
    "manual review (visual top bar with health+timer+health)",
    "visual_fidelity",
  );

  cat(
    "trajectory_preview_while_dragging",
    5,
    null,
    "manual review (visible dotted trajectory during drag)",
    "feedback",
  );
  cat("hits_produce_juice", 5, null, "manual review (shake, particles, float text)", "feedback");
  cat(
    "castle_destruction_three_states",
    5,
    typeof enemyHpBefore === "number" && enemyHpBefore <= 5,
    `discrete HP iff small initial HP. enemyHpBefore=${enemyHpBefore}`,
    "feedback",
  );

  cat("single_file_exists", 4, true, `${abs} (${(fileSize / 1e6).toFixed(2)}MB)`, "playable_ad_compliance");
  cat(
    "cta_on_win_and_loss",
    4,
    ctaSeen.some((v) => v === true),
    `ctaSeen=${JSON.stringify(ctaSeen)} ctaIntercepts=${ctaIntercepts.length}`,
    "playable_ad_compliance",
  );
  cat(
    "cta_uses_mraid_or_window_open",
    4,
    /mraid\.open\s*\(/.test(html) || /\bwindow\.open\s*\(/.test(html),
    `mraid.open in html=${/mraid\.open\s*\(/.test(html)} window.open=${/\bwindow\.open\s*\(/.test(html)}`,
    "playable_ad_compliance",
  );
  const externalSrc = (html.match(/(src|href)\s*=\s*["']https?:\/\/[^"']+["']/gi) ?? []).filter(
    (m) => !/data:|fonts\.googleapis|fonts\.gstatic|play\.google|apps\.apple|store\./i.test(m),
  );
  cat(
    "no_external_runtime_libs",
    3,
    externalSrc.length === 0,
    `externalSrc=${externalSrc.length}`,
    "playable_ad_compliance",
  );

  const ratio = canvasInfo ? canvasInfo.width / canvasInfo.height : 0;
  const wantedRatio = 360 / 640;
  cat(
    "canvas_9_16_scaled",
    4,
    canvasInfo !== null && Math.abs(ratio - wantedRatio) < 0.02,
    canvasInfo ? `${canvasInfo.width}x${canvasInfo.height} ratio=${ratio.toFixed(3)}` : "no canvas",
    "layout_and_runtime",
  );
  cat(
    "no_overflow",
    4,
    overflow.bodyScrollW <= overflow.bodyClientW + 1 && overflow.bodyScrollH <= overflow.bodyClientH + 1,
    `scrollW=${overflow.bodyScrollW} clientW=${overflow.bodyClientW} scrollH=${overflow.bodyScrollH} clientH=${overflow.bodyClientH}`,
    "layout_and_runtime",
  );
  const fieldsPresent = REQUIRED_FIELDS.filter((f) => initial && f in (initial as Record<string, unknown>));
  cat(
    "engine_state_has_required_fields",
    4,
    initial !== null && fieldsPresent.length === REQUIRED_FIELDS.length,
    `present=${fieldsPresent.length}/${REQUIRED_FIELDS.length} missing=${REQUIRED_FIELDS.filter((f) => !fieldsPresent.includes(f)).join(",")}`,
    "layout_and_runtime",
  );
  cat(
    "size_under_5mb",
    3,
    fileSize <= 5_000_000,
    `${(fileSize / 1e6).toFixed(2)}MB`,
    "layout_and_runtime",
  );

  const perCategory: Record<string, { earned: number; max: number }> = {};
  let total = 0;
  for (const k of Object.keys(RUBRIC) as CategoryName[]) {
    perCategory[k] = { earned: 0, max: RUBRIC[k].points };
  }
  for (const c of checks) {
    const earned = c.pass === true ? c.points : 0;
    perCategory[c.category]!.earned += earned;
    total += earned;
  }
  return {
    total,
    max: 100,
    checks,
    perCategory,
  };
}

function countProjectiles(s: Record<string, unknown> | null): number | null {
  if (!s) return null;
  const p = s["projectiles"];
  if (Array.isArray(p)) return p.length;
  if (typeof p === "number") return p;
  return null;
}

function numField(s: Record<string, unknown> | null, keys: string[]): number | null {
  if (!s) return null;
  for (const k of keys) {
    const v = s[k];
    if (typeof v === "number") return v;
  }
  return null;
}

function readCastlePositions(s: Record<string, unknown> | null): { pass: boolean; notes: string } {
  if (!s) return { pass: false, notes: "no engineState" };
  const tryGet = (...path: string[]): number | null => {
    let cur: unknown = s;
    for (const k of path) {
      if (!cur || typeof cur !== "object") return null;
      cur = (cur as Record<string, unknown>)[k];
    }
    return typeof cur === "number" ? cur : null;
  };
  const candidates: Array<[number | null, number | null]> = [
    [tryGet("playerCastle", "x"), tryGet("enemyCastle", "x")],
    [tryGet("castles", "player", "x"), tryGet("castles", "enemy", "x")],
    [tryGet("playerX"), tryGet("enemyX")],
  ];
  for (const [p, e] of candidates) {
    if (p !== null && e !== null) {
      return { pass: p < e, notes: `playerX=${p} enemyX=${e}` };
    }
  }
  return { pass: false, notes: "castle x positions not in __engineState (manual review)" };
}

function checkBallistic(
  a: Record<string, unknown> | null,
  b: Record<string, unknown> | null,
  c: Record<string, unknown> | null,
): { pass: boolean; notes: string } {
  const sample = (s: Record<string, unknown> | null) => {
    if (!s) return null;
    const p = s["projectiles"];
    if (!Array.isArray(p) || p.length === 0) return null;
    const first = p[0];
    if (!first || typeof first !== "object") return null;
    const o = first as Record<string, unknown>;
    return {
      vy: typeof o["vy"] === "number" ? (o["vy"] as number) : null,
      y: typeof o["y"] === "number" ? (o["y"] as number) : null,
    };
  };
  const sa = sample(a);
  const sb = sample(b);
  const sc = sample(c);
  const samples = [sa, sb, sc].filter((x) => x !== null);
  if (samples.length < 1) return { pass: false, notes: "no projectile samples" };
  const vys = samples.map((s) => s!.vy).filter((v) => v !== null) as number[];
  if (vys.length >= 2 && vys[vys.length - 1]! > vys[0]!) {
    return { pass: true, notes: `vy increased ${vys[0]}→${vys[vys.length - 1]} (gravity)` };
  }
  if (samples.length >= 1) {
    return { pass: true, notes: `at least one projectile observed (heuristic)` };
  }
  return { pass: false, notes: "no ballistic evidence" };
}

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("usage: bun run scripts/score.ts <playable.html> [--label NAME]");
  process.exit(1);
}
const htmlArg = resolve(args[0]!);
let label: string | null = null;
for (let i = 1; i < args.length; i++) {
  if (args[i] === "--label" && args[i + 1]) label = args[++i] ?? null;
}
const tag = label ?? basename(dirname(htmlArg));

const result = await score(htmlArg);
const outDir = resolve("outputs", "score", tag);
await mkdir(outDir, { recursive: true });
const reportPath = join(outDir, "score.json");
await writeFile(
  reportPath,
  JSON.stringify(
    {
      htmlPath: htmlArg,
      generatedAt: new Date().toISOString(),
      ...result,
    },
    null,
    2,
  ),
  "utf8",
);

console.log(`\n=== ${tag} — ${result.total}/${result.max} ===\n`);
for (const cat of Object.keys(result.perCategory)) {
  const c = result.perCategory[cat]!;
  console.log(`  ${cat.padEnd(28)} ${c.earned}/${c.max}`);
}
console.log("\nchecks:");
for (const c of result.checks) {
  const mark = c.pass === true ? "✓" : c.pass === false ? "✗" : "?";
  console.log(
    `  [${mark}] ${c.id.padEnd(38)} ${(c.pass === true ? c.points : 0)}/${c.points}  ${c.notes}`,
  );
}
console.log(`\n→ ${reportPath}`);
