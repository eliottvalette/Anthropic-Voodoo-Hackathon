// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: debris
// TYPE: vfx
// PURPOSE: Physics debris chunks — castle wall break, prop destruction
// USAGE:
//   const debris = [];
//   spawnDebris(debris, x, y, side, count?);  // side: "left" | "right"
//   updateDebris(debris, dt);
//   drawDebris(ctx, debris);
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function spawnDebris(debris, x, y, side = "left", count = 14) {
  const dir = side === "left" ? 1 : -1;
  for (let i = 0; i < count; i++) {
    debris.push({
      x,
      y,
      vx: dir * (0.04 + Math.random() * 0.13),
      vy: -0.15 + Math.random() * 0.18,
      size: 5 + Math.random() * 10,
      r: Math.random() * 6,
      spin: -0.006 + Math.random() * 0.012,
      life: 750 + Math.random() * 550,
      maxLife: 750 + Math.random() * 550,
    });
  }
}

function updateDebris(debris, dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.life -= dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.vy += 0.00075 * dt;
    d.r += d.spin * dt;
    if (d.life <= 0) debris.splice(i, 1);
  }
}

function drawDebris(ctx, debris, fill = "#7b7770", stroke = "#34312d") {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  for (const d of debris) {
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.r);
    ctx.globalAlpha = Math.max(0, Math.min(1, d.life / 650));
    ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size * 0.65);
    ctx.strokeRect(-d.size / 2, -d.size / 2, d.size, d.size * 0.65);
    ctx.restore();
  }
  ctx.restore();
}
