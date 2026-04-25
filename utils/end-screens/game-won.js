// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: game-won
// TYPE: end-screen
// PURPOSE: Brawl Stars / Castle Clashers -style victory overlay.
//          Diagonal split, right side blue with checker + star icon texture.
//          Two-line title: dark badge word ("BATTLE") + outlined word ("WON").
//          Optional rewards row, optional CTA pill.
// USAGE:
//   drawGameWon(ctx, 360, 640, {
//     primary: "BATTLE", secondary: "WON",
//     cta: "PLAY NOW",
//     rewards: [{ label:"+15", color:"#f5c842", kind:"trophy" }, ...],
//   });
// FONT: load 'Lilita One' (Google Fonts).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function drawGameWon(ctx, W, H, opts = {}) {
  const primary = opts.primary || "BATTLE";
  const secondary = opts.secondary || "WON";
  const cta = opts.cta || "PLAY NOW";
  const tilt = opts.tilt ?? 110;
  const rightColor = opts.rightColor || "#1a8edb";
  const tint = opts.tint ?? 0.35;
  const font = opts.font || "'Lilita One', 'Arial Black', Arial";

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0," + tint + ")";
  ctx.fillRect(0, 0, W, H);

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
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  const cs = 38;
  for (let yy = 0; yy < H + cs; yy += cs * 2) {
    for (let xx = 0; xx < W + cs; xx += cs * 2) {
      ctx.fillRect(xx, yy, cs, cs);
      ctx.fillRect(xx + cs, yy + cs, cs, cs);
    }
  }
  // Star icons
  ctx.fillStyle = "rgba(255,255,255,0.13)";
  for (let i = 0; i < 30; i++) {
    const fx = (Math.sin(i * 12.9898) * 0.5 + 0.5) * W;
    const fy = (Math.sin(i * 78.233) * 0.5 + 0.5) * H;
    _drawStar(ctx, fx, fy, 11 + (i % 3) * 3);
  }
  // Confetti dots
  for (let i = 0; i < 24; i++) {
    const cx = (Math.sin(i * 9.32) * 0.5 + 0.5) * W;
    const cy = (Math.sin(i * 4.7) * 0.5 + 0.5) * H;
    ctx.fillStyle = ["#ffbf31", "#fff", "#73f03f", "#ff8a27"][i % 4];
    ctx.beginPath();
    ctx.arc(cx, cy, 2 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(0,0,0,0.42)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(W * 0.5 + tilt, 0);
  ctx.lineTo(W * 0.5 - tilt, H);
  ctx.stroke();

  const titleCx = W * 0.62;
  const titleY = H * 0.30;

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
  _roundRectGW(ctx, -pw / 2, -ph / 2, pw, ph, 4);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(primary, 0, 1);
  ctx.restore();

  ctx.save();
  ctx.translate(titleCx, titleY + 56);
  ctx.font = "52px " + font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 9;
  ctx.strokeStyle = "#0a0a0a";
  ctx.strokeText(secondary, 0, 0);
  ctx.fillStyle = "#ffd028";
  ctx.fillText(secondary, 0, 0);
  ctx.restore();

  if (opts.rewards && opts.rewards.length) {
    _drawRewardsRowW(ctx, titleCx, titleY + 110, opts.rewards, font);
  }

  if (cta !== false) {
    const ctaW = W * 0.62, ctaH = 60;
    const ctaX = (W - ctaW) / 2;
    const ctaY = H * 0.78;
    ctx.fillStyle = "#0a0a0a";
    _roundRectGW(ctx, ctaX + 4, ctaY + 5, ctaW, ctaH, 14);
    ctx.fill();
    ctx.fillStyle = "#22c55e";
    ctx.strokeStyle = "#0e6a3b";
    ctx.lineWidth = 4;
    _roundRectGW(ctx, ctaX, ctaY, ctaW, ctaH, 14);
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
    drawGameWon.lastCtaBounds = { x: ctaX, y: ctaY, w: ctaW, h: ctaH };
  } else {
    drawGameWon.lastCtaBounds = null;
  }

  ctx.restore();
}

function _drawStar(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
    const a2 = a + Math.PI / 5;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(a2) * r * 0.4, Math.sin(a2) * r * 0.4);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function _drawRewardsRowW(ctx, cx, cy, rewards, font) {
  ctx.save();
  ctx.font = "16px " + font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#0a0a0a";
  ctx.strokeText("Rewards:", cx, cy);
  ctx.fillStyle = "#fff";
  ctx.fillText("Rewards:", cx, cy);

  const itemSize = 42, gap = 8;
  const totalW = rewards.length * itemSize + (rewards.length - 1) * gap;
  let x = cx - totalW / 2;
  const itemY = cy + 14;
  for (const r of rewards) {
    ctx.fillStyle = "#0a0a0a";
    _roundRectGW(ctx, x + 2, itemY + 3, itemSize, itemSize, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    _roundRectGW(ctx, x, itemY, itemSize, itemSize, 8);
    ctx.fill();
    ctx.strokeStyle = "#0a0a0a";
    ctx.lineWidth = 2.5;
    _roundRectGW(ctx, x, itemY, itemSize, itemSize, 8);
    ctx.stroke();

    const color = r.color || "#f5c842";
    const kind = r.kind || "coin";
    ctx.save();
    if (kind === "trophy") {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x + itemSize/2 - 8, itemY + itemSize/2 - 13);
      ctx.lineTo(x + itemSize/2 + 8, itemY + itemSize/2 - 13);
      ctx.lineTo(x + itemSize/2 + 6, itemY + itemSize/2);
      ctx.lineTo(x + itemSize/2 - 6, itemY + itemSize/2);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(x + itemSize/2 - 4, itemY + itemSize/2, 8, 4);
    } else if (kind === "coin") {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + itemSize/2, itemY + itemSize/2 - 4, 9, 0, Math.PI*2);
      ctx.fill();
    } else if (kind === "wood") {
      ctx.fillStyle = color;
      ctx.fillRect(x + itemSize/2 - 8, itemY + itemSize/2 - 9, 16, 10);
    }
    ctx.restore();

    ctx.font = "13px " + font;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#0a0a0a";
    ctx.fillStyle = "#0a0a0a";
    ctx.strokeText(String(r.label), x + itemSize / 2, itemY + itemSize - 7);
    ctx.fillText(String(r.label), x + itemSize / 2, itemY + itemSize - 7);

    x += itemSize + gap;
  }
  ctx.restore();
}

function _roundRectGW(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
