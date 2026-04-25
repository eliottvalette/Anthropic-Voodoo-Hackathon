// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: hp-segmented
// TYPE: hud
// PURPOSE: Segmented HP bar (3 hearts, 5 chunks, etc.)
//          Discrete HP visual when total HP is small
// USAGE:
//   drawHpSegmented(ctx, x, y, { current: 2, max: 3, segWidth: 30, color: "#ef4444" });
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function drawHpSegmented(ctx, x, y, opts) {
  const max = opts.max || 3;
  const cur = Math.max(0, Math.min(max, opts.current || 0));
  const w = opts.segWidth || 30;
  const h = opts.segHeight || 12;
  const gap = opts.gap || 4;
  const color = opts.color || "#ef4444";
  const dim = opts.dimColor || "#3a2222";
  const stroke = opts.stroke || "#0a0606";

  ctx.save();
  for (let i = 0; i < max; i++) {
    const sx = x + i * (w + gap);
    ctx.fillStyle = i < cur ? color : dim;
    ctx.fillRect(sx, y, w, h);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, y, w, h);
  }
  ctx.restore();
}
