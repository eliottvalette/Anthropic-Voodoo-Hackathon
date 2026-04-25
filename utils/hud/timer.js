// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: timer
// TYPE: hud
// PURPOSE: Countdown timer display, MM:SS or seconds, with urgency color
// USAGE:
//   drawTimer(ctx, x, y, secondsLeft, { size: 32, urgentBelow: 5 });
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function drawTimer(ctx, x, y, seconds, opts = {}) {
  const size = opts.size || 32;
  const urgent = seconds <= (opts.urgentBelow ?? 5);
  const color = urgent ? (opts.urgentColor || "#ff4141") : (opts.color || "#ffffff");
  const s = Math.max(0, seconds);
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  const text = (opts.showMinutes !== false ? mm + ":" : "") + ss;

  ctx.save();
  ctx.font = "900 " + size + "px Arial";
  ctx.textAlign = opts.align || "center";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(4, size * 0.16);
  ctx.strokeStyle = "#0a0606";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}
