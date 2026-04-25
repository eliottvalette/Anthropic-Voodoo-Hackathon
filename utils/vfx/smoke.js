// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: smoke
// TYPE: vfx
// PURPOSE: Rising gray puffs — destruction, impact, respawn dust
// USAGE: smoke(particles, x, y, count?)
// PARAMS:
//   particles  — your engine's particle array (push target)
//   x, y       — world coords of emission center
//   count      — number of puffs (default 14)
// PARTICLE SHAPE: { x, y, vx, vy, radius, color, life }
// RENDER: any particle renderer using ctx.arc + life-based alpha
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function smoke(particles, x, y, count = 14) {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
    const speed = 0.04 + Math.random() * 0.06;
    const g = 175 + Math.floor(Math.random() * 60);
    particles.push({
      x: x + (Math.random() - 0.5) * 45,
      y: y + (Math.random() - 0.5) * 18,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 13 + Math.random() * 18,
      color: "rgb(" + g + "," + g + "," + g + ")",
      life: 900 + Math.random() * 800,
      // Buoyancy: smoke floats upward against default gravity.
      gravity: -0.00018,
    });
  }
}
