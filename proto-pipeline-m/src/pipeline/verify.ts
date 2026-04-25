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
      const ctx = c.getContext("2d");
      if (!ctx) return false;
      try {
        const cx = Math.floor(c.width / 2);
        const cy = Math.floor(c.height / 2);
        const center = ctx.getImageData(cx, cy, 4, 4).data;
        const corner = ctx.getImageData(0, 0, 1, 1).data;
        for (let i = 0; i < center.length; i += 4) {
          for (let k = 0; k < 3; k++) {
            if (Math.abs(center[i + k]! - corner[k]!) > 6) return true;
          }
        }
      } catch {
        return false;
      }
      return false;
    });

    const before = await page.evaluate(() => {
      const w = window as unknown as {
        __engineState?: { snapshot?: () => unknown };
      };
      return w.__engineState?.snapshot?.() ?? null;
    });

    await page.tap("canvas", { position: { x: 180, y: 320 } }).catch(() => {});
    await page.mouse.move(180, 480);
    await page.mouse.down();
    await page.mouse.move(180, 320, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(800);

    const after = await page.evaluate(() => {
      const w = window as unknown as {
        __engineState?: { snapshot?: () => unknown };
      };
      return w.__engineState?.snapshot?.() ?? null;
    });

    interactionStateChange =
      before !== null &&
      after !== null &&
      JSON.stringify(before) !== JSON.stringify(after);
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
