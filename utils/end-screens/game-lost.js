// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: game-lost
// TYPE: end-screen
// PURPOSE: Castle Clashers / Brawl Stars -style defeat overlay.
//          Diagonal split, right side red with checker + flame icon texture.
//          Two-line title: dark badge word ("BATTLE") + outlined word ("FAILED").
//          Optional rewards row, optional CTA pill.
// USAGE:
//   drawGameLost(ctx, 360, 640, {
//     primary: "BATTLE", secondary: "FAILED",
//     cta: "TRY AGAIN",
//     rewards: [
//       { label: "-22.78", color: "#f5c842", kind: "trophy" },
//       { label: "90",     color: "#f5c842", kind: "coin" },
//       { label: "13",     color: "#a06d3a", kind: "wood" },
//     ],
//   });
// FONT: load 'Lilita One' (Google Fonts) for the Supercell display look.
// HIT-TEST: drawGameLost.lastCtaBounds = { x, y, w, h }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function drawGameLost(ctx, W, H, opts = {}) {
  const primary = opts.primary || "BATTLE";
  const secondary = opts.secondary || "FAILED";
  const cta = opts.cta || "TRY AGAIN";
  const tilt = opts.tilt ?? 110;
  const rightColor = opts.rightColor || "#c81e2c";
  const tint = opts.tint ?? 0.4;
  const font = opts.font || "'Lilita One', 'Arial Black', Arial";

  ctx.save();

  ctx.fillStyle = "rgba(0,0,0," + tint + ")";
  ctx.fillRect(0, 0, W, H);

  // ── Right diagonal panel with texture ──
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(W * 0.5 + tilt, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H);
  ctx.lineTo(W * 0.5 - tilt, H);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = rightColor;
  ctx.fillRect(0, 0, W, H);

  // Checker overlay
  ctx.fillStyle = "rgba(0,0,0,0.07)";
  const cs = 38;
  for (let yy = 0; yy < H + cs; yy += cs * 2) {
    for (let xx = 0; xx < W + cs; xx += cs * 2) {
      ctx.fillRect(xx, yy, cs, cs);
      ctx.fillRect(xx + cs, yy + cs, cs, cs);
    }
  }
  // Flame icons
  ctx.fillStyle = "rgba(0,0,0,0.13)";
  for (let i = 0; i < 32; i++) {
    const fx = (Math.sin(i * 12.9898) * 0.5 + 0.5) * W;
    const fy = (Math.sin(i * 78.233) * 0.5 + 0.5) * H;
    _drawFlame(ctx, fx, fy, 14 + (i % 3) * 3);
  }
  ctx.restore();

  // Diagonal seam shadow
  ctx.strokeStyle = "rgba(0,0,0,0.42)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(W * 0.5 + tilt, 0);
  ctx.lineTo(W * 0.5 - tilt, H);
  ctx.stroke();

  // ── Title block (centered horizontally on the right panel) ──
  const titleCx = W * 0.62;
  const titleY = H * 0.30;

  // Primary word — black ribbon badge, slight CCW tilt
  ctx.save();
  ctx.translate(titleCx, titleY);
  ctx.rotate(-0.045);
  ctx.font = "30px " + font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const pad = 22;
  const pw = ctx.measureText(primary).width + pad * 2;
  const ph = 44;
  ctx.fillStyle = "#0a0a0a";
  _roundRectGL(ctx, -pw / 2, -ph / 2, pw, ph, 4);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(primary, 0, 1);
  ctx.restore();

  // Secondary word — outlined display below
  ctx.save();
  ctx.translate(titleCx, titleY + 56);
  ctx.font = "44px " + font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 9;
  ctx.strokeStyle = "#0a0a0a";
  ctx.strokeText(secondary, 0, 0);
  ctx.fillStyle = "#fff";
  ctx.fillText(secondary, 0, 0);
  ctx.restore();

  // ── Optional rewards row ──
  if (opts.rewards && opts.rewards.length) {
    _drawRewardsRow(ctx, titleCx, titleY + 105, opts.rewards, font);
  }

  // ── CTA pill (optional, bottom) ──
  if (cta !== false) {
    const ctaW = W * 0.62, ctaH = 60;
    const ctaX = (W - ctaW) / 2;
    const ctaY = H * 0.78;
    ctx.fillStyle = "#0a0a0a";
    _roundRectGL(ctx, ctaX + 4, ctaY + 5, ctaW, ctaH, 14);
    ctx.fill();
    ctx.fillStyle = "#22c55e";
    ctx.strokeStyle = "#0e6a3b";
    ctx.lineWidth = 4;
    _roundRectGL(ctx, ctaX, ctaY, ctaW, ctaH, 14);
    ctx.fill();
    ctx.stroke();
    ctx.font = "26px " + font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#0a0a0a";
    ctx.strokeText(cta, W / 2, ctaY + ctaH / 2 + 1);
    ctx.fillStyle = "#fff";
    ctx.fillText(cta, W / 2, ctaY + ctaH / 2 + 1);
    drawGameLost.lastCtaBounds = { x: ctaX, y: ctaY, w: ctaW, h: ctaH };
  } else {
    drawGameLost.lastCtaBounds = null;
  }

  ctx.restore();
}

function _drawFlame(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 20, size / 20);
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.bezierCurveTo(8, -4, 7, 7, 0, 11);
  ctx.bezierCurveTo(-7, 7, -8, -4, 0, -10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function _drawRewardsRow(ctx, cx, cy, rewards, font) {
  ctx.save();
  ctx.font = "16px " + font;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#0a0a0a";
  ctx.strokeText("Rewards:", cx, cy);
  ctx.fillStyle = "#fff";
  ctx.fillText("Rewards:", cx, cy);

  const itemSize = 42;
  const gap = 8;
  const totalW = rewards.length * itemSize + (rewards.length - 1) * gap;
  let x = cx - totalW / 2;
  const itemY = cy + 14;
  for (const r of rewards) {
    ctx.fillStyle = "#0a0a0a";
    _roundRectGL(ctx, x + 2, itemY + 3, itemSize, itemSize, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    _roundRectGL(ctx, x, itemY, itemSize, itemSize, 8);
    ctx.fill();
    ctx.strokeStyle = "#0a0a0a";
    ctx.lineWidth = 2.5;
    _roundRectGL(ctx, x, itemY, itemSize, itemSize, 8);
    ctx.stroke();

    _drawRewardIcon(ctx, x + itemSize / 2, itemY + itemSize / 2 - 4, r);

    ctx.font = "13px " + font;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#0a0a0a";
    ctx.fillStyle = String(r.label).startsWith("-") ? "#ed2024" : "#0a0a0a";
    ctx.strokeText(String(r.label), x + itemSize / 2, itemY + itemSize - 7);
    ctx.fillText(String(r.label), x + itemSize / 2, itemY + itemSize - 7);

    x += itemSize + gap;
  }
  ctx.restore();
}

function _drawRewardIcon(ctx, cx, cy, r) {
  const color = r.color || "#f5c842";
  const kind = r.kind || "coin";
  ctx.save();
  if (kind === "trophy") {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 9);
    ctx.lineTo(cx + 8, cy - 9);
    ctx.lineTo(cx + 6, cy + 4);
    ctx.lineTo(cx - 6, cy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - 4, cy + 4, 8, 4);
    ctx.fillRect(cx - 6, cy + 8, 12, 2);
  } else if (kind === "coin") {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#a37a14";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (kind === "wood") {
    ctx.fillStyle = color;
    ctx.fillRect(cx - 8, cy - 5, 16, 10);
    ctx.strokeStyle = "#5e3f1c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 5); ctx.lineTo(cx - 4, cy + 5);
    ctx.moveTo(cx + 2, cy - 5); ctx.lineTo(cx + 2, cy + 5);
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function _roundRectGL(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function isPointInCta(bounds, x, y) {
  if (!bounds) return false;
  return x >= bounds.x && x <= bounds.x + bounds.w &&
         y >= bounds.y && y <= bounds.y + bounds.h;
}
