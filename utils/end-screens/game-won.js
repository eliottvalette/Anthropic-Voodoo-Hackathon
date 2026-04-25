// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: game-won
// TYPE: end-screen
// PURPOSE: Diagonal split overlay (mirror of game-lost) — right is blue.
//          Replaceable headline + CTA button.
// USAGE:
//   drawGameWon(ctx, 360, 640, {
//     headline: "YOU WIN",
//     cta: "PLAY NOW",
//   });
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function drawGameWon(ctx, W, H, opts) {
  const headline = opts.headline || "YOU WIN";
  const cta = opts.cta || "PLAY NOW";
  const tilt = opts.tilt ?? 130;
  const rightColor = opts.rightColor || "#1a8edb";
  const tint = opts.tint ?? 0.45;

  ctx.save();

  ctx.fillStyle = "rgba(0,0,0," + tint + ")";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = rightColor;
  ctx.beginPath();
  ctx.moveTo(W * 0.5 + tilt, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H);
  ctx.lineTo(W * 0.5 - tilt, H);
  ctx.closePath();
  ctx.fill();

  // Confetti dots in the blue panel
  for (let i = 0; i < 28; i++) {
    const cx = W * 0.55 + (Math.sin(i * 12.9898) * 0.5 + 0.5) * (W * 0.42);
    const cy = (Math.sin(i * 78.233) * 0.5 + 0.5) * H;
    const cr = 2 + (i % 3);
    ctx.fillStyle = ["#ffbf31", "#fff", "#73f03f", "#ff8a27"][i % 4];
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(W * 0.5 + tilt, 0);
  ctx.lineTo(W * 0.5 - tilt, H);
  ctx.stroke();

  ctx.font = "900 " + Math.floor(W / Math.max(8, headline.length) * 1.2) + "px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#000";
  ctx.strokeText(headline, W / 2, H * 0.32);
  ctx.fillStyle = "#fff";
  ctx.fillText(headline, W / 2, H * 0.32);

  const ctaW = W * 0.62;
  const ctaH = 64;
  const ctaX = (W - ctaW) / 2;
  const ctaY = H * 0.62;
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(ctaX + 4, ctaY + 5, ctaW, ctaH);
  ctx.fillStyle = "#22c55e";
  ctx.strokeStyle = "#0f7318";
  ctx.lineWidth = 5;
  roundRectPathW(ctx, ctaX, ctaY, ctaW, ctaH, 14);
  ctx.fill();
  ctx.stroke();

  ctx.font = "900 26px Arial";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#0a0a0a";
  ctx.strokeText(cta, W / 2, ctaY + ctaH / 2 + 1);
  ctx.fillText(cta, W / 2, ctaY + ctaH / 2 + 1);

  ctx.font = "800 13px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText(opts.subText || "Tap to install", W / 2, ctaY + ctaH + 28);

  ctx.restore();
  drawGameWon.lastCtaBounds = { x: ctaX, y: ctaY, w: ctaW, h: ctaH };
}

function roundRectPathW(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
