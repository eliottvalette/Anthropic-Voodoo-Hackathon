import { chromium } from "playwright";
import { stat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  VerifyReportSchema,
  type VerifyReport,
} from "../schemas/verifyReport.ts";

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
  let canvasNonBlank = false;
  let interactionStateChange = false;

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

    canvasNonBlank = await page.evaluate(() => {
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

    const readState = () =>
      page.evaluate(() => {
        const w = window as unknown as {
          __engineState?: { snapshot?: () => unknown; inputs?: number };
        };
        const s = w.__engineState;
        let snap: unknown = null;
        try { snap = s?.snapshot?.() ?? null; } catch { snap = null; }
        return { snap, inputs: s?.inputs ?? 0 };
      });

    const before = await readState();

    await page.tap("canvas", { position: { x: 180, y: 320 } }).catch(() => {});
    await page.waitForTimeout(80);
    await page.mouse.move(180, 480);
    await page.mouse.down();
    await page.mouse.move(180, 320, { steps: 10 });
    await page.mouse.up();

    let changed = false;
    const deadline = Date.now() + 1000;
    while (!changed && Date.now() < deadline) {
      await page.waitForTimeout(100);
      const cur = await readState();
      const snapDiff =
        before.snap !== null &&
        cur.snap !== null &&
        JSON.stringify(before.snap) !== JSON.stringify(cur.snap);
      const inputsBumped = cur.inputs > before.inputs;
      if (snapDiff || inputsBumped) changed = true;
    }
    interactionStateChange = changed;
  } finally {
    await browser.close();
  }

  const runs =
    sizeOk &&
    consoleErrors.length === 0 &&
    canvasNonBlank &&
    mraidOk &&
    mechanicStringMatch &&
    interactionStateChange;

  return VerifyReportSchema.parse({
    sizeBytes,
    sizeOk,
    consoleErrors,
    canvasNonBlank,
    mraidOk,
    mechanicStringMatch,
    interactionStateChange,
    runs,
  });
}
