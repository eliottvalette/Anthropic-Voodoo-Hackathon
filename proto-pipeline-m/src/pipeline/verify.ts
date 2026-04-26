import { chromium, type Page } from "playwright";
import { stat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  VerifyReportSchema,
  type VerifyReport,
} from "../schemas/verifyReport.ts";

type StateSnap = {
  phase?: string | null;
  turnIndex?: number | null;
  playerHp?: number | null;
  enemyHp?: number | null;
  projectiles?: number | null;
  inputs?: number | null;
  ctaVisible?: boolean | null;
  result?: string | null;
} | null;

async function readState(page: Page): Promise<{ snap: StateSnap; inputs: number }> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __engineState?: { snapshot?: () => unknown; inputs?: number };
    };
    const s = w.__engineState;
    let snap: unknown = null;
    try { snap = s?.snapshot?.() ?? null; } catch { snap = null; }
    return { snap: snap as StateSnap, inputs: s?.inputs ?? 0 };
  });
}

function hpFromSnap(snap: StateSnap): { player: number | null; enemy: number | null } {
  if (!snap || typeof snap !== "object") return { player: null, enemy: null };
  const s = snap as Record<string, unknown>;
  const num = (k: string): number | null => {
    const v = s[k];
    return typeof v === "number" ? v : null;
  };
  return { player: num("playerHp"), enemy: num("enemyHp") };
}

async function pollUntil<T>(
  fn: () => Promise<T | null>,
  predicate: (v: T) => boolean,
  budgetMs: number,
  intervalMs = 100,
): Promise<T | null> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v !== null && predicate(v)) return v;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

async function detectCanvasNonBlank(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const c = document.querySelector("canvas") as HTMLCanvasElement | null;
    if (!c) return false;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    try {
      const w = c.width, h = c.height;
      const N = 6;
      let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
      for (let i = 1; i < N; i++) {
        for (let j = 1; j < N; j++) {
          const x = Math.floor((w * i) / N);
          const y = Math.floor((h * j) / N);
          const d = ctx.getImageData(x, y, 1, 1).data;
          if (d[0]! < rMin) rMin = d[0]!;
          if (d[0]! > rMax) rMax = d[0]!;
          if (d[1]! < gMin) gMin = d[1]!;
          if (d[1]! > gMax) gMax = d[1]!;
          if (d[2]! < bMin) bMin = d[2]!;
          if (d[2]! > bMax) bMax = d[2]!;
        }
      }
      const span = Math.max(rMax - rMin, gMax - gMin, bMax - bMin);
      return span > 20;
    } catch {
      return false;
    }
  });
}

async function dragRelease(
  page: Page,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  steps = 10,
): Promise<void> {
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps });
  await page.waitForTimeout(50);
  await page.mouse.up();
}

export async function verify(
  htmlPath: string,
  expectedMechanicName: string,
): Promise<VerifyReport> {
  const abs = resolve(htmlPath);
  const sizeBytes = (await stat(abs)).size;
  const sizeOk = sizeBytes <= 5 * 1024 * 1024;
  const html = await readFile(abs, "utf8");
  const mechanicStringMatch =
    expectedMechanicName.length > 0 && html.includes(expectedMechanicName);
  const mraidOk = /mraid\.open\s*\(/.test(html);

  const browser = await chromium.launch({ headless: true });
  const consoleErrors: string[] = [];
  const notes: string[] = [];
  let canvasNonBlank = false;
  let interactionStateChange = false;
  let turnLoopObserved = false;
  let hpDecreasesOnHit = false;
  let ctaReachable = false;
  let initialSnap: StateSnap = null;
  let afterFirstInputSnap: StateSnap = null;
  let finalSnap: StateSnap = null;
  let inputsTotal = 0;
  let phasesArr: string[] = [];
  let turnsArr: number[] = [];
  let hpDeltaPlayer: number | null = null;
  let hpDeltaEnemy: number | null = null;

  try {
    const context = await browser.newContext({
      viewport: { width: 360, height: 640 },
    });
    const page = await context.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(e.message));

    await page.goto("file://" + abs);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1200);

    canvasNonBlank = await detectCanvasNonBlank(page);

    const before = await readState(page);
    initialSnap = before.snap;
    const phasesSeen = new Set<string>();
    const turnIndicesSeen = new Set<number>();
    const initialHp = hpFromSnap(before.snap);

    const recordSnap = (snap: StateSnap) => {
      if (!snap) return;
      const s = snap as Record<string, unknown>;
      if (typeof s.phase === "string") phasesSeen.add(s.phase);
      if (typeof s.turnIndex === "number") turnIndicesSeen.add(s.turnIndex);
    };
    recordSnap(before.snap);

    await dragRelease(page, 180, 480, 180, 320, 10);

    const dragDeadline = Date.now() + 1500;
    let postDrag = before;
    while (Date.now() < dragDeadline) {
      await page.waitForTimeout(80);
      postDrag = await readState(page);
      recordSnap(postDrag.snap);
      const inputsBumped = postDrag.inputs > before.inputs;
      const snapDiff =
        before.snap && postDrag.snap &&
        JSON.stringify(before.snap) !== JSON.stringify(postDrag.snap);
      if (inputsBumped || snapDiff) {
        interactionStateChange = true;
        afterFirstInputSnap = postDrag.snap;
        break;
      }
    }
    if (!afterFirstInputSnap) afterFirstInputSnap = postDrag.snap;
    if (!interactionStateChange) notes.push("first drag did not change state or bump inputs");

    const settleEnd = Date.now() + 2500;
    let lastSnap = postDrag.snap;
    while (Date.now() < settleEnd) {
      await page.waitForTimeout(120);
      const s = await readState(page);
      lastSnap = s.snap;
      recordSnap(s.snap);
      if (
        (turnIndicesSeen.size >= 2) ||
        (phasesSeen.has("aiming") && phasesSeen.has("projectile"))
      ) {
        turnLoopObserved = true;
      }
    }
    if (!turnLoopObserved) {
      notes.push(
        `turn loop not observed (phases=${[...phasesSeen].join(",")} turnIndices=${[...turnIndicesSeen].join(",")})`,
      );
    }

    const afterHp = hpFromSnap(lastSnap);
    if (initialHp.player !== null && afterHp.player !== null && initialHp.enemy !== null && afterHp.enemy !== null) {
      const playerDropped = afterHp.player < initialHp.player;
      const enemyDropped = afterHp.enemy < initialHp.enemy;
      hpDecreasesOnHit = playerDropped || enemyDropped;
      if (!hpDecreasesOnHit) {
        notes.push(`hp unchanged after drag (player ${initialHp.player}->${afterHp.player}, enemy ${initialHp.enemy}->${afterHp.enemy})`);
      }
    } else {
      const fields = lastSnap && typeof lastSnap === "object" ? Object.keys(lastSnap as object) : [];
      notes.push(`playerHp/enemyHp not exposed in snapshot (fields: ${fields.slice(0, 8).join(",")})`);
    }

    if (!hpDecreasesOnHit) {
      const driveBudget = Date.now() + 12000;
      let bursts = 0;
      while (Date.now() < driveBudget && !hpDecreasesOnHit) {
        bursts++;
        const offset = (bursts % 4) * 30;
        await dragRelease(page, 180 + offset, 500, 180 - offset - 40, 280, 8);
        await page.waitForTimeout(900);
        const s = await readState(page);
        recordSnap(s.snap);
        const cur = hpFromSnap(s.snap);
        if (initialHp.player !== null && initialHp.enemy !== null && cur.player !== null && cur.enemy !== null) {
          if (cur.player < initialHp.player || cur.enemy < initialHp.enemy) {
            hpDecreasesOnHit = true;
            lastSnap = s.snap;
          }
        }
        if (
          (turnIndicesSeen.size >= 2) ||
          (phasesSeen.has("aiming") && phasesSeen.has("projectile"))
        ) {
          turnLoopObserved = true;
        }
      }
      if (!hpDecreasesOnHit) notes.push(`hp never decreased across ${bursts} drag bursts`);
    }

    const ctaProbeBudget = Date.now() + 8000;
    while (Date.now() < ctaProbeBudget) {
      const s = await readState(page);
      recordSnap(s.snap);
      lastSnap = s.snap;
      const snap = s.snap as Record<string, unknown> | null;
      if (snap && (snap.ctaVisible === true || snap.phase === "ended" || typeof snap.result === "string")) {
        ctaReachable = true;
        break;
      }
      await dragRelease(page, 200, 500, 60, 280, 6);
      await page.waitForTimeout(700);
    }
    if (!ctaReachable) {
      notes.push("ctaVisible never became true within probe window");
    }
    finalSnap = lastSnap;
    const finalState = await readState(page);
    inputsTotal = finalState.inputs;
    if (finalState.snap) finalSnap = finalState.snap;
    phasesArr = Array.from(phasesSeen);
    turnsArr = Array.from(turnIndicesSeen);
    const finalHp = hpFromSnap(finalSnap);
    hpDeltaPlayer =
      initialHp.player !== null && finalHp.player !== null
        ? initialHp.player - finalHp.player
        : null;
    hpDeltaEnemy =
      initialHp.enemy !== null && finalHp.enemy !== null
        ? initialHp.enemy - finalHp.enemy
        : null;
  } finally {
    await browser.close();
  }

  const runs =
    sizeOk &&
    consoleErrors.length === 0 &&
    canvasNonBlank &&
    mraidOk &&
    mechanicStringMatch &&
    interactionStateChange &&
    turnLoopObserved &&
    hpDecreasesOnHit &&
    ctaReachable;

  const trajectory = {
    initial: (initialSnap as Record<string, unknown> | null) ?? null,
    afterFirstInput: (afterFirstInputSnap as Record<string, unknown> | null) ?? null,
    final: (finalSnap as Record<string, unknown> | null) ?? null,
    phasesSeen: phasesArr,
    turnIndicesSeen: turnsArr,
    inputsTotal,
    hpDeltaPlayer,
    hpDeltaEnemy,
  };

  return VerifyReportSchema.parse({
    sizeBytes,
    sizeOk,
    consoleErrors,
    canvasNonBlank,
    mraidOk,
    mechanicStringMatch,
    interactionStateChange,
    turnLoopObserved,
    hpDecreasesOnHit,
    ctaReachable,
    behavioralNotes: notes,
    trajectory,
    runs,
  });
}

export function buildRetryAddendum(report: VerifyReport): string {
  const lines: string[] = [];
  if (!report.canvasNonBlank) lines.push("Canvas was blank after 1.2s — ensure draw loop runs and clears with a non-uniform background.");
  if (!report.mraidOk) lines.push("CTA did not call mraid.open(...) — wire CTA tap to call window.mraid.open(STORE_URL) with window.open fallback.");
  if (!report.mechanicStringMatch) lines.push("HTML did not contain the mechanic_name string — embed `mechanic_name` constant verbatim somewhere reachable in JS.");
  if (!report.interactionStateChange) lines.push("Pointer interaction did not increment window.__engineState.inputs nor change snapshot — wire pointerdown/pointerup to bump inputs and update phase.");
  if (!report.turnLoopObserved) lines.push("Turn loop not observed — phase must transition aiming → projectile → enemy_wait → projectile, and turnIndex must change at least once after a shot.");
  if (!report.hpDecreasesOnHit) lines.push("HP never decreased after drag bursts — playerHp/enemyHp must be discrete integers (start at 3) and decrement on impact, not continuous bars.");
  if (!report.ctaReachable) lines.push("CTA never became reachable — set window.__engineState.ctaVisible=true when a side reaches 0 HP and on first drag in test mode if your end condition is too long.");
  if (report.consoleErrors.length > 0) lines.push(`Console errors must be eliminated: ${report.consoleErrors.slice(0, 3).join(" | ")}`);
  if (!report.sizeOk) lines.push(`Output exceeds 5 MB — keep the single file under the budget; downsample assets if needed.`);
  if (report.behavioralNotes.length > 0) lines.push(`Behavioral notes: ${report.behavioralNotes.join("; ")}`);
  return lines.length > 0 ? lines.map((l) => `- ${l}`).join("\n") : "";
}
