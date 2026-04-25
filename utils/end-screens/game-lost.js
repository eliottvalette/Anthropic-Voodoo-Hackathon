// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: game-lost
// TYPE: end-screen
// PURPOSE: Diagonal split overlay — left keeps game tint, right is red.
//          Replaceable headline + CTA button.
// USAGE:
//   drawGameLost(ctx, 360, 640, {
//     headline: "YOU LOST",
//     cta: "TRY AGAIN",
//     onHit: () => openStore(),     // wire pointer hit-test outside
//   });
// LAYOUT: 360×640, diagonal at top-left (-30°)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function drawGameLost(ctx, W, H, opts) {
  const headline = opts.headline || "YOU LOST";
  const cta = opts.cta || "TRY AGAIN";
  const tilt = opts.tilt ?? 130;       // px the diagonal shifts top → bottom
  const rightColor = opts.rightColor || "#c81e2c";
  const tint = opts.tint ?? 0.55;

  ctx.save();

  // Dark global tint
  ctx.fillStyle = "rgba(0,0,0," + tint + ")";
  ctx.fillRect(0, 0, W, H);

  // Right diagonal panel
  ctx.fillStyle = rightColor;
  ctx.beginPath();
  ctx.moveTo(W * 0.5 + tilt, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H);
  ctx.lineTo(W * 0.5 - tilt, H);
  ctx.closePath();
  ctx.fill();

  // Diagonal seam highlight
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(W * 0.5 + tilt, 0);
  ctx.lineTo(W * 0.5 - tilt, H);
  ctx.stroke();

  // Headline (split across the diagonal — drawn in white, outlined)
  ctx.font = "900 " + Math.floor(W / headline.length * 1.2) + "px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#000";
  ctx.strokeText(headline, W / 2, H * 0.32);
  ctx.fillStyle = "#fff";
  ctx.fillText(headline, W / 2, H * 0.32);

  // CTA pill
  const ctaW = W * 0.62;
  const ctaH = 64;
  const ctaX = (W - ctaW) / 2;
  const ctaY = H * 0.62;
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(ctaX + 4, ctaY + 5, ctaW, ctaH);
  ctx.fillStyle = "#22c55e";
  ctx.strokeStyle = "#0f7318";
  ctx.lineWidth = 5;
  roundRectPath(ctx, ctaX, ctaY, ctaW, ctaH, 14);
  ctx.fill();
  ctx.stroke();

  ctx.font = "900 26px Arial";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#0a0a0a";
  ctx.strokeText(cta, W / 2, ctaY + ctaH / 2 + 1);
  ctx.fillText(cta, W / 2, ctaY + ctaH / 2 + 1);

  // Sub line
  ctx.font = "800 13px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(opts.subText || "Tap to install", W / 2, ctaY + ctaH + 28);

  ctx.restore();

  // Expose CTA bounds for hit testing
  drawGameLost.lastCtaBounds = { x: ctaX, y: ctaY, w: ctaW, h: ctaH };
}

function roundRectPath(ctx, x, y, w, h, r) {
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
