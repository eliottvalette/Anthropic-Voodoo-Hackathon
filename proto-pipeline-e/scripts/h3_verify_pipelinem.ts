// Inlined copy of pipeline-m's verify.ts logic, run against an arbitrary HTML.
// No dependency on pipeline-m sources. Uses Playwright from proto-pipeline-e.
// Goal H3: confirm that pipeline-m verify gate gives runs:true on the gold.

import { chromium, type Page } from "playwright";
import { stat, readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, basename, dirname, join } from "node:path";

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

async function dragRelease(page: Page, fromX: number, fromY: number, toX: number, toY: number, steps = 10): Promise<void> {
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps });
  await page.waitForTimeout(50);
  await page.mouse.up();
}

async function verify(htmlPath: string, expectedMechanicName: string) {
  const abs = resolve(htmlPath);
  const sizeBytes = (await stat(abs)).size;
  const sizeOk = sizeBytes <= 5 * 1024 * 1024;
  const html = await readFile(abs, "utf8");
  const mechanicStringMatch = expectedMechanicName.length > 0 && html.includes(expectedMechanicName);
  const mraidOk = /mraid\.open\s*\(/.test(html);

  const browser = await chromium.launch({ headless: true });
  const consoleErrors: string[] = [];
  const notes: string[] = [];
  let canvasNonBlank = false;
  let interactionStateChange = false;
  let turnLoopObserved = false;
  let hpDecreasesOnHit = false;
  let ctaReachable = false;
  let inputsTotal = 0;
  let phasesArr: string[] = [];
  let turnsArr: number[] = [];

  try {
    const context = await browser.newContext({ viewport: { width: 360, height: 640 } });
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
        break;
      }
    }
    if (!interactionStateChange) notes.push("first drag did not change state or bump inputs");

    const settleEnd = Date.now() + 2500;
    let lastSnap = postDrag.snap;
    while (Date.now() < settleEnd) {
      await page.waitForTimeout(120);
      const s = await readState(page);
      lastSnap = s.snap;
      recordSnap(s.snap);
      if ((turnIndicesSeen.size >= 2) || (phasesSeen.has("aiming") && phasesSeen.has("acting"))) {
        turnLoopObserved = true;
      }
    }

    const afterHp = hpFromSnap(lastSnap);
    if (initialHp.player !== null && afterHp.player !== null && initialHp.enemy !== null && afterHp.enemy !== null) {
      const playerDropped = afterHp.player < initialHp.player;
      const enemyDropped = afterHp.enemy < initialHp.enemy;
      hpDecreasesOnHit = playerDropped || enemyDropped;
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
        if ((turnIndicesSeen.size >= 2) || (phasesSeen.has("aiming") && phasesSeen.has("projectile"))) {
          turnLoopObserved = true;
        }
      }
    }

    const ctaProbeBudget = Date.now() + 8000;
    while (Date.now() < ctaProbeBudget) {
      const s = await readState(page);
      recordSnap(s.snap);
      lastSnap = s.snap;
      const snap = s.snap as Record<string, unknown> | null;
      if (snap && (snap.ctaVisible === true || snap.phase === "win" || snap.phase === "loss" || typeof snap.result === "string")) {
        ctaReachable = true;
        break;
      }
      await dragRelease(page, 200, 500, 60, 280, 6);
      await page.waitForTimeout(700);
    }

    const finalState = await readState(page);
    inputsTotal = finalState.inputs;
    phasesArr = Array.from(phasesSeen);
    turnsArr = Array.from(turnIndicesSeen);
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

  return {
    htmlPath: abs,
    expectedMechanicName,
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
    inputsTotal,
    phasesSeen: phasesArr,
    turnIndicesSeen: turnsArr,
    runs,
  };
}

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("usage: bun run scripts/h3_verify_pipelinem.ts <html> [--mechanic NAME]");
  process.exit(1);
}
const htmlArg = resolve(args[0]!);
let mechanic = "manual_artillery_turns";
for (let i = 1; i < args.length; i++) {
  if (args[i] === "--mechanic" && args[i + 1]) mechanic = args[++i] ?? mechanic;
}

const r = await verify(htmlArg, mechanic);
const tag = `${basename(dirname(htmlArg))}__pipelinem_verify`;
const outDir = resolve("outputs", "h3_verify_pipelinem", tag);
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "report.json"), JSON.stringify(r, null, 2), "utf8");

console.log(`\n=== H3 — pipeline-m verify on ${basename(dirname(htmlArg))} ===`);
console.log(`mechanic_name expected = ${mechanic}`);
console.log(`runs = ${r.runs}`);
console.log(`  sizeOk                  = ${r.sizeOk} (${(r.sizeBytes / 1e6).toFixed(2)}MB)`);
console.log(`  consoleErrors           = ${r.consoleErrors.length}`);
console.log(`  canvasNonBlank          = ${r.canvasNonBlank}`);
console.log(`  mraidOk                 = ${r.mraidOk}`);
console.log(`  mechanicStringMatch     = ${r.mechanicStringMatch}`);
console.log(`  interactionStateChange  = ${r.interactionStateChange}`);
console.log(`  turnLoopObserved        = ${r.turnLoopObserved}`);
console.log(`  hpDecreasesOnHit        = ${r.hpDecreasesOnHit}`);
console.log(`  ctaReachable            = ${r.ctaReachable}`);
console.log(`  phasesSeen              = ${JSON.stringify(r.phasesSeen)}`);
console.log(`  turnIndicesSeen         = ${JSON.stringify(r.turnIndicesSeen)}`);
console.log(`  inputsTotal             = ${r.inputsTotal}`);
if (r.behavioralNotes.length > 0) console.log(`  notes                   = ${r.behavioralNotes.join("; ")}`);
console.log(`\n→ ${join(outDir, "report.json")}`);
