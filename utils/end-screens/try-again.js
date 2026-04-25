// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: try-again
// TYPE: end-screen
// PURPOSE: Neutral retry overlay — diagonal split with amber right panel,
//          textured (dot pattern), Supercell-style stacked title.
// USAGE:
//   drawTryAgain(ctx, 360, 640, {
//     primary: "ALMOST", secondary: "THERE",
//     cta: "TRY AGAIN",
//   });
// FONT: load 'Lilita One'.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function drawTryAgain(ctx, W, H, opts = {}) {
  const primary = opts.primary || "ALMOST";
  const secondary = opts.secondary || "THERE";
  const cta = opts.cta || "TRY AGAIN";
  const tilt = opts.tilt ?? 110;
  const rightColor = opts.rightColor || "#f59e0b";
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

  // Polka dots texture
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  for (let yy = 0; yy < H + 20; yy += 28) {
    for (let xx = (yy / 28) % 2 ? 14 : 0; xx < W + 20; xx += 28) {
      ctx.beginPath();
      ctx.arc(xx, yy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(0,0,0,0.42)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(W * 0.5 + tilt, 0);
  ctx.lineTo(W * 0.5 - tilt, H);
  ctx.stroke();

  const titleCx = W * 0.62;
  const titleY = H * 0.34;

  ctx.save();
  ctx.translate(titleCx, titleY);
  ctx.rotate(-0.045);
  ctx.font = "28px " + font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const pad = 22;
  const pw = ctx.measureText(primary).width + pad * 2;
  const ph = 42;
  ctx.fillStyle = "#0a0a0a";
  _rrTA(ctx, -pw / 2, -ph / 2, pw, ph, 4);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(primary, 0, 1);
  ctx.restore();

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

  if (cta !== false) {
    const ctaW = W * 0.62, ctaH = 60;
    const ctaX = (W - ctaW) / 2;
    const ctaY = H * 0.78;
    ctx.fillStyle = "#0a0a0a";
    _rrTA(ctx, ctaX + 4, ctaY + 5, ctaW, ctaH, 14);
    ctx.fill();
    ctx.fillStyle = "#22c55e";
    ctx.strokeStyle = "#0e6a3b";
    ctx.lineWidth = 4;
    _rrTA(ctx, ctaX, ctaY, ctaW, ctaH, 14);
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
    drawTryAgain.lastCtaBounds = { x: ctaX, y: ctaY, w: ctaW, h: ctaH };
  }

  ctx.restore();
}

function _rrTA(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
