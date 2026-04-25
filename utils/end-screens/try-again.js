// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: try-again
// TYPE: end-screen
// PURPOSE: Neutral "almost there" overlay — encourages a retry without the
//          weight of a defeat screen. No diagonal split, soft amber accent.
// USAGE:
//   drawTryAgain(ctx, 360, 640, { headline: "ALMOST!", cta: "TRY AGAIN" });
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function drawTryAgain(ctx, W, H, opts = {}) {
  const headline = opts.headline || "ALMOST!";
  const cta = opts.cta || "TRY AGAIN";
  const accent = opts.accent || "#f59e0b";
  const tint = opts.tint ?? 0.5;

  ctx.save();

  // Tint full screen
  ctx.fillStyle = "rgba(0,0,0," + tint + ")";
  ctx.fillRect(0, 0, W, H);

  // Centered amber ribbon
  const ribbonH = 92;
  const ribbonY = H * 0.30;
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, ribbonY + 5, W, ribbonH);
  ctx.fillStyle = accent;
  ctx.fillRect(0, ribbonY, W, ribbonH);

  // Headline on the ribbon
  ctx.font = "900 " + Math.floor(W / Math.max(8, headline.length) * 1.3) + "px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#0a0a0a";
  ctx.strokeText(headline, W / 2, ribbonY + ribbonH / 2 + 1);
  ctx.fillStyle = "#fff";
  ctx.fillText(headline, W / 2, ribbonY + ribbonH / 2 + 1);

  // Sub line
  ctx.font = "800 14px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(opts.subText || "So close — one more shot", W / 2, ribbonY + ribbonH + 36);

  // CTA pill
  const ctaW = W * 0.62, ctaH = 64;
  const ctaX = (W - ctaW) / 2, ctaY = H * 0.62;
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(ctaX + 4, ctaY + 5, ctaW, ctaH);
  ctx.fillStyle = "#22c55e";
  ctx.strokeStyle = "#0f7318";
  ctx.lineWidth = 5;
  _roundRectT(ctx, ctaX, ctaY, ctaW, ctaH, 14);
  ctx.fill();
  ctx.stroke();
  ctx.font = "900 26px Arial";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#0a0a0a";
  ctx.strokeText(cta, W / 2, ctaY + ctaH / 2 + 1);
  ctx.fillStyle = "#fff";
  ctx.fillText(cta, W / 2, ctaY + ctaH / 2 + 1);

  ctx.font = "800 13px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(opts.installText || "Tap to install", W / 2, ctaY + ctaH + 28);

  ctx.restore();
  drawTryAgain.lastCtaBounds = { x: ctaX, y: ctaY, w: ctaW, h: ctaH };
}

function _roundRectT(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
