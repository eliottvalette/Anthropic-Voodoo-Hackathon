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
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
    const speed = 0.02 + Math.random() * 0.055;
    const g = 145 + Math.floor(Math.random() * 85);
    particles.push({
      x: x + (Math.random() - 0.5) * 55,
      y: y + (Math.random() - 0.5) * 30,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 11 + Math.random() * 19,
      color: "rgb(" + g + "," + g + "," + g + ")",
      life: 750 + Math.random() * 700,
    });
  }
}
