// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: hp-percentage
// TYPE: hud
// PURPOSE: Continuous HP bar with numeric percentage label
//          Smooth visual for granular HP values
// USAGE:
//   drawHpPercentage(ctx, x, y, w, h, { pct: 0.78, color: "#22c55e" });
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function drawHpPercentage(ctx, x, y, w, h, opts) {
  const pct = Math.max(0, Math.min(1, opts.pct ?? 1));
  const color = opts.color || "#22c55e";
  const bg = opts.bg || "#1a1f2e";
  const stroke = opts.stroke || "#000";
  const showLabel = opts.showLabel !== false;

  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * pct, h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  if (showLabel) {
    ctx.font = "900 " + Math.floor(h * 0.7) + "px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#000";
    ctx.strokeText(Math.round(pct * 100) + "%", x + w / 2, y + h / 2 + 1);
    ctx.fillStyle = "#fff";
    ctx.fillText(Math.round(pct * 100) + "%", x + w / 2, y + h / 2 + 1);
  }
  ctx.restore();
}
