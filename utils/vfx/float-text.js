// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: float-text
// TYPE: vfx
// PURPOSE: Floating damage / score / pickup numbers that rise and fade
// USAGE:
//   const floats = [];
//   spawnFloat(floats, x, y, "-72", "#ff4141");
//   updateFloats(floats, dt);
//   drawFloats(ctx, floats);
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function spawnFloat(floats, x, y, text, color = "#ffffff", life = 850) {
  floats.push({ x, y, text, color, life, maxLife: life });
}

function updateFloats(floats, dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.life -= dt;
    f.y -= dt * 0.05;
    if (f.life <= 0) floats.splice(i, 1);
  }
}

function drawFloats(ctx, floats, size = 26) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "900 " + size + "px Arial";
  ctx.lineWidth = 7;
  ctx.lineJoin = "round";
  for (const f of floats) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life / f.maxLife));
    ctx.strokeStyle = "#111111";
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.restore();
}
