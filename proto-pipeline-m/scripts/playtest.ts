import { chromium } from "playwright";
import { resolve } from "node:path";

const html = resolve(process.argv[2] ?? "outputs/gem31_b01/playable.html");
const out = resolve(process.argv[3] ?? "outputs/gem31_b01/_playtest");
import { mkdir } from "node:fs/promises";
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 360, height: 640 },
  hasTouch: true,
  isMobile: true,
});
const page = await ctx.newPage();

const errors: string[] = [];
const logs: string[] = [];
page.on("pageerror", (e) => errors.push(`PAGEERR: ${e.message}`));
page.on("console", (m) => {
  const t = m.type();
  if (t === "error" || t === "warning") errors.push(`${t.toUpperCase()}: ${m.text()}`);
  logs.push(`${t}: ${m.text()}`);
});

await page.goto(`file://${html}`);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/01_after_500ms.png` });

await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/02_after_1500ms.png` });

const snap0 = await page.evaluate(() => (window as any).__engineState?.snapshot?.());
console.log("snap0:", JSON.stringify(snap0));

await page.mouse.move(180, 400);
await page.mouse.down();
await page.waitForTimeout(50);
await page.mouse.move(180, 250, { steps: 8 });
await page.waitForTimeout(50);
await page.screenshot({ path: `${out}/03_dragging.png` });
await page.mouse.up();
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/04_after_release.png` });

const snap1 = await page.evaluate(() => (window as any).__engineState?.snapshot?.());
console.log("snap1:", JSON.stringify(snap1));

await page.waitForTimeout(2000);
const snap2 = await page.evaluate(() => (window as any).__engineState?.snapshot?.());
console.log("snap2:", JSON.stringify(snap2));
await page.screenshot({ path: `${out}/05_after_2s.png` });

const probe = await page.evaluate(() => {
  const c = document.getElementById("game") as HTMLCanvasElement;
  const ctx = c.getContext("2d")!;
  const cw = c.width, ch = c.height;
  const center = ctx.getImageData(cw/2, ch/2, 1, 1).data;
  const corner = ctx.getImageData(2, 2, 1, 1).data;
  const tl = ctx.getImageData(20, 20, 1, 1).data;
  const br = ctx.getImageData(cw-20, ch-20, 1, 1).data;
  return {
    cw, ch,
    center: [center[0], center[1], center[2]],
    corner: [corner[0], corner[1], corner[2]],
    tl: [tl[0], tl[1], tl[2]],
    br: [br[0], br[1], br[2]],
    cssW: c.clientWidth,
    cssH: c.clientHeight,
    domW: c.getBoundingClientRect().width,
    domH: c.getBoundingClientRect().height,
  };
});
console.log("probe:", JSON.stringify(probe, null, 2));

await page.screenshot({ path: `${out}/06_final.png`, fullPage: true });

console.log("errors:", JSON.stringify(errors, null, 2));
await browser.close();
