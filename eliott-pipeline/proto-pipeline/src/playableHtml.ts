import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { JsonObject } from "./gemini.ts";

type AssetSpec = {
  key: string;
  filename: string;
  mimeType: string;
  required: boolean;
};

const selectedAssets: AssetSpec[] = [
  { key: "background", filename: "Background.png", mimeType: "image/png", required: true },
  { key: "blueCastle", filename: "Blue Castle.png", mimeType: "image/png", required: true },
  { key: "redCastle", filename: "Red Castle.png", mimeType: "image/png", required: true },
  { key: "projectilePlayer", filename: "Projectile_1.png", mimeType: "image/png", required: true },
  { key: "projectileEnemy", filename: "Projectile_2.png", mimeType: "image/png", required: true },
  { key: "weaponPlayer", filename: "Weapon_1.png", mimeType: "image/png", required: false },
  { key: "weaponEnemy", filename: "Weapon_2.png", mimeType: "image/png", required: false },
  { key: "sfx", filename: "Sfx.wav", mimeType: "audio/wav", required: false },
  { key: "music", filename: "Music.ogg", mimeType: "audio/ogg", required: false },
];

const maxPlayableSizeBytes = 5 * 1024 * 1024;

export async function generatePlayableHtml(options: {
  outputDir: string;
  assetDir: string;
  featureSpec: JsonObject;
}): Promise<{ path: string; sizeBytes: number; selectedAssets: string[] }> {
  const assets = await loadAssets(options.assetDir);
  const html = renderHtml({
    title: stringAt(options.featureSpec, "prototype_name", "Castle Clashers Playable"),
    assets,
    config: configFromSpec(options.featureSpec),
  });
  const path = join(options.outputDir, "playable.html");
  await writeFile(path, html, "utf8");
  const fileStats = await stat(path);
  if (fileStats.size > maxPlayableSizeBytes) {
    throw new Error(`playable.html is ${fileStats.size} bytes, above the 5 MB playable limit.`);
  }
  return {
    path,
    sizeBytes: fileStats.size,
    selectedAssets: Object.keys(assets),
  };
}

async function loadAssets(assetDir: string): Promise<Record<string, string>> {
  const assets: Record<string, string> = {};
  for (const asset of selectedAssets) {
    const path = join(assetDir, asset.filename);
    try {
      const bytes = await readFile(path);
      assets[asset.key] = `data:${asset.mimeType};base64,${bytes.toString("base64")}`;
    } catch (error) {
      if (asset.required) {
        throw new Error(`Required asset missing: ${path}`);
      }
      console.warn(`Optional asset skipped: ${basename(path)}`);
    }
  }
  return assets;
}

function configFromSpec(featureSpec: JsonObject): Record<string, unknown> {
  const parameters = Array.isArray(featureSpec.parameters) ? featureSpec.parameters : [];
  const config: Record<string, unknown> = {
    playerDamage: 22,
    enemyDamage: 16,
    enemyFireRateMs: 2300,
    projectileSpeed: 760,
    gravity: 960,
    sessionLengthSeconds: 35,
  };

  for (const parameter of parameters) {
    if (typeof parameter !== "object" || parameter === null || Array.isArray(parameter)) {
      continue;
    }
    const item = parameter as JsonObject;
    const name = typeof item.name === "string" ? item.name.toLowerCase() : "";
    const value = typeof item.default === "number" ? item.default : Number(item.default);
    if (!Number.isFinite(value)) {
      continue;
    }
    if (name.includes("player") && name.includes("damage")) {
      config.playerDamage = clamp(value, 8, 45);
    } else if (name.includes("enemy") && name.includes("damage")) {
      config.enemyDamage = clamp(value, 6, 35);
    } else if (name.includes("enemy") && (name.includes("rate") || name.includes("fire"))) {
      config.enemyFireRateMs = clamp(value, 900, 5000);
    } else if (name.includes("gravity")) {
      config.gravity = clamp(value, 450, 1400);
    }
  }

  return config;
}

function renderHtml(input: {
  title: string;
  assets: Record<string, string>;
  config: Record<string, unknown>;
}): string {
  const jsAssets = JSON.stringify(input.assets);
  const jsConfig = JSON.stringify(input.config);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>${escapeHtml(input.title)}</title>
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111;touch-action:none;user-select:none;-webkit-user-select:none;font-family:Arial,Helvetica,sans-serif}
#game{display:block;width:100vw;height:100vh;background:#9cc884}
#cta{position:fixed;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(18,22,24,.72);color:#fff;text-align:center}
#cta h1{margin:0 0 18px;font-size:42px;line-height:.95;text-shadow:0 4px 0 #482714,0 6px 18px rgba(0,0,0,.55)}
#cta button{border:4px solid #6e3517;border-radius:14px;background:linear-gradient(#ffd982,#df862a);color:#fff;font-weight:900;font-size:30px;padding:12px 34px;text-shadow:0 3px 0 #6e3517;box-shadow:0 8px 0 #8f4a1e;cursor:pointer}
</style>
</head>
<body>
<canvas id="game"></canvas>
<div id="cta"><h1>CASTLE<br>CLASHERS</h1><button>PLAY</button></div>
<script>
(() => {
  "use strict";
  const assets = ${jsAssets};
  const config = ${jsConfig};
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const cta = document.getElementById("cta");
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const W = 360;
  const H = 640;
  const images = {};
  const sounds = {};
  let scale = 1;
  let ox = 0;
  let oy = 0;
  let last = performance.now();
  let started = false;
  let ended = false;
  let winner = false;
  let playerHealth = 100;
  let enemyHealth = 100;
  let nextEnemyShot = 1600;
  let elapsed = 0;
  let pointer = null;
  let particles = [];
  let projectiles = [];

  const playerCastle = {x: 34, y: 330, w: 118, h: 166};
  const enemyCastle = {x: 210, y: 102, w: 118, h: 166};
  const playerMuzzle = {x: 128, y: 356};
  const enemyMuzzle = {x: 231, y: 196};

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = src;
    });
  }

  async function boot() {
    for (const [key, src] of Object.entries(assets)) {
      if (src.startsWith("data:image/")) images[key] = await loadImage(src);
      if (src.startsWith("data:audio/")) sounds[key] = new Audio(src);
    }
    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    cta.querySelector("button").addEventListener("click", () => { window.location.href = "https://play.google.com/store/apps/details?id=com.epicoro.castleclashers"; });
    requestAnimationFrame(tick);
  }

  function resize() {
    canvas.width = Math.floor(innerWidth * DPR);
    canvas.height = Math.floor(innerHeight * DPR);
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    scale = Math.min(innerWidth / W, innerHeight / H);
    ox = (innerWidth - W * scale) / 2;
    oy = (innerHeight - H * scale) / 2;
  }

  function toWorld(event) {
    return {x: (event.clientX - ox) / scale, y: (event.clientY - oy) / scale};
  }

  function onDown(event) {
    if (ended) return;
    started = true;
    tryPlay(sounds.music, true, .24);
    pointer = {start: toWorld(event), now: toWorld(event)};
    canvas.setPointerCapture(event.pointerId);
  }

  function onMove(event) {
    if (!pointer || ended) return;
    pointer.now = toWorld(event);
  }

  function onUp(event) {
    if (!pointer || ended) return;
    const dx = pointer.start.x - pointer.now.x;
    const dy = pointer.start.y - pointer.now.y;
    const power = Math.min(Math.hypot(dx, dy), 118);
    if (power > 14) {
      const angle = Math.atan2(dy, dx);
      fireProjectile("player", playerMuzzle.x, playerMuzzle.y, Math.cos(angle) * power * 7.2, Math.sin(angle) * power * 7.2);
    }
    pointer = null;
  }

  function fireProjectile(owner, x, y, vx, vy) {
    projectiles.push({owner, x, y, vx, vy, r: owner === "player" ? 12 : 10, life: 4.2});
    burst(x, y, owner === "player" ? "#ffe66b" : "#ff6b6b", 8);
    tryPlay(sounds.sfx, false, .45);
  }

  function enemyFire() {
    const targetX = playerCastle.x + playerCastle.w * (.38 + Math.random() * .28);
    const targetY = playerCastle.y + playerCastle.h * (.25 + Math.random() * .28);
    const dx = targetX - enemyMuzzle.x;
    const dy = targetY - enemyMuzzle.y;
    const t = 0.78;
    fireProjectile("enemy", enemyMuzzle.x, enemyMuzzle.y, dx / t, (dy - .5 * Number(config.gravity) * t * t) / t);
  }

  function tick(now) {
    const dt = Math.min((now - last) / 1000, .033);
    last = now;
    if (!ended) update(dt);
    draw();
    requestAnimationFrame(tick);
  }

  function update(dt) {
    elapsed += dt;
    if (started) {
      nextEnemyShot -= dt * 1000;
      if (nextEnemyShot <= 0) {
        enemyFire();
        nextEnemyShot = Number(config.enemyFireRateMs) * (.78 + Math.random() * .44);
      }
    }
    for (const p of projectiles) {
      p.life -= dt;
      p.vy += Number(config.gravity) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const target = p.owner === "player" ? enemyCastle : playerCastle;
      if (circleRect(p, target)) {
        p.life = -1;
        if (p.owner === "player") enemyHealth = Math.max(0, enemyHealth - Number(config.playerDamage));
        else playerHealth = Math.max(0, playerHealth - Number(config.enemyDamage));
        burst(p.x, p.y, p.owner === "player" ? "#fff1a8" : "#ffb1b1", 24);
        tryPlay(sounds.sfx, false, .55);
      }
    }
    projectiles = projectiles.filter((p) => p.life > 0 && p.x > -40 && p.x < W + 40 && p.y < H + 80);
    for (const fx of particles) {
      fx.life -= dt;
      fx.x += fx.vx * dt;
      fx.y += fx.vy * dt;
      fx.vy += 420 * dt;
    }
    particles = particles.filter((fx) => fx.life > 0);
    if (enemyHealth <= 0 || playerHealth <= 0 || elapsed >= Number(config.sessionLengthSeconds)) {
      ended = true;
      winner = enemyHealth <= 0 || playerHealth > enemyHealth;
      setTimeout(() => { cta.style.display = "flex"; cta.querySelector("h1").textContent = winner ? "VICTORY!" : "TRY AGAIN"; }, 550);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    drawScene();
    ctx.restore();
  }

  function drawScene() {
    if (images.background) drawCover(images.background, 0, 0, W, H);
    else { ctx.fillStyle = "#9cc884"; ctx.fillRect(0, 0, W, H); }
    drawHills();
    drawHud();
    drawCastle(playerCastle, images.blueCastle, playerHealth, false);
    drawCastle(enemyCastle, images.redCastle, enemyHealth, true);
    drawWeapon(playerMuzzle, images.weaponPlayer, false);
    drawWeapon(enemyMuzzle, images.weaponEnemy, true);
    if (!started) drawTutorial();
    if (pointer) drawTrajectory();
    drawProjectiles();
    drawParticles();
  }

  function drawHills() {
    ctx.fillStyle = "rgba(106,75,60,.92)";
    ctx.fillRect(0, 516, W, 124);
    ctx.fillStyle = "rgba(83,55,48,.6)";
    for (let x = -20; x < W; x += 42) {
      ctx.beginPath(); ctx.arc(x, 516, 24, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawHud() {
    bar(14, 18, 120, 16, playerHealth, "#1b9cff");
    bar(W - 134, 18, 120, 16, enemyHealth, "#ef1f2d");
    ctx.font = "900 32px Arial";
    ctx.textAlign = "center";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#111";
    ctx.fillStyle = "#fff";
    ctx.strokeText("VS", W / 2, 38);
    ctx.fillText("VS", W / 2, 38);
    ctx.font = "900 16px Arial";
    ctx.textAlign = "left";
    label(Math.round(playerHealth) + "%", 24, 66);
    ctx.textAlign = "right";
    label(Math.round(enemyHealth) + "%", W - 24, 66);
  }

  function bar(x, y, w, h, value, color) {
    ctx.fillStyle = "#171717"; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x, y, w * value / 100, h);
    ctx.strokeStyle = "#050505"; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
  }

  function label(text, x, y) {
    ctx.lineWidth = 4; ctx.strokeStyle = "#111"; ctx.fillStyle = "#fff";
    ctx.strokeText(text, x, y); ctx.fillText(text, x, y);
  }

  function drawCastle(rect, img, health, flip) {
    ctx.save();
    const shake = health < 35 ? Math.sin(performance.now() / 80) * 1.8 : 0;
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2 + shake);
    ctx.rotate((100 - health) * (flip ? -0.0008 : 0.0008));
    if (img) ctx.drawImage(img, -rect.w / 2, -rect.h / 2, rect.w, rect.h);
    else { ctx.fillStyle = flip ? "#c33" : "#38f"; ctx.fillRect(-rect.w / 2, -rect.h / 2, rect.w, rect.h); }
    if (health < 72) {
      ctx.globalAlpha = (72 - health) / 95;
      ctx.fillStyle = "#111";
      for (let i = 0; i < 8; i++) ctx.fillRect(-44 + i * 13, -60 + (i % 3) * 34, 18, 18);
    }
    ctx.restore();
  }

  function drawWeapon(pos, img, flip) {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    if (flip) ctx.scale(-1, 1);
    if (img) ctx.drawImage(img, -28, -14, 56, 28);
    else { ctx.fillStyle = "#333"; ctx.fillRect(-24, -8, 48, 16); }
    ctx.restore();
  }

  function drawTutorial() {
    ctx.fillStyle = "rgba(0,0,0,.38)";
    ctx.fillRect(26, 538, W - 52, 70);
    ctx.font = "900 21px Arial";
    ctx.textAlign = "center";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#111";
    ctx.fillStyle = "#fff";
    ctx.strokeText("DRAG TO AIM - RELEASE TO FIRE", W / 2, 580);
    ctx.fillText("DRAG TO AIM - RELEASE TO FIRE", W / 2, 580);
  }

  function drawTrajectory() {
    const dx = pointer.start.x - pointer.now.x;
    const dy = pointer.start.y - pointer.now.y;
    const power = Math.min(Math.hypot(dx, dy), 118);
    const angle = Math.atan2(dy, dx);
    let x = playerMuzzle.x, y = playerMuzzle.y;
    let vx = Math.cos(angle) * power * 7.2;
    let vy = Math.sin(angle) * power * 7.2;
    ctx.fillStyle = "rgba(255,255,255,.75)";
    for (let i = 0; i < 18; i++) {
      const t = i * .07;
      const px = x + vx * t;
      const py = y + vy * t + .5 * Number(config.gravity) * t * t;
      ctx.beginPath(); ctx.arc(px, py, Math.max(2, 5 - i * .12), 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawProjectiles() {
    for (const p of projectiles) {
      const img = p.owner === "player" ? images.projectilePlayer : images.projectileEnemy;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.vy, p.vx));
      if (img) ctx.drawImage(img, -p.r, -p.r, p.r * 2, p.r * 2);
      else { ctx.fillStyle = p.owner === "player" ? "#f33" : "#222"; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const fx of particles) {
      ctx.globalAlpha = Math.max(0, fx.life / fx.maxLife);
      ctx.fillStyle = fx.color;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawCover(img, x, y, w, h) {
    const s = Math.max(w / img.width, h / img.height);
    const sw = w / s;
    const sh = h / s;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 40 + Math.random() * 180;
      particles.push({x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, size: 2 + Math.random() * 5, life: .35 + Math.random() * .55, maxLife: .8});
    }
  }

  function circleRect(c, r) {
    const nx = Math.max(r.x, Math.min(c.x, r.x + r.w));
    const ny = Math.max(r.y, Math.min(c.y, r.y + r.h));
    return (c.x - nx) * (c.x - nx) + (c.y - ny) * (c.y - ny) <= c.r * c.r;
  }

  function tryPlay(audio, loop, volume) {
    if (!audio) return;
    try {
      audio.loop = loop;
      audio.volume = volume;
      audio.currentTime = 0;
      void audio.play();
    } catch {}
  }

  boot();
})();
</script>
</body>
</html>`;
}

function stringAt(object: JsonObject, key: string, fallback: string): string {
  return typeof object[key] === "string" ? object[key] : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char] ?? char;
  });
}
