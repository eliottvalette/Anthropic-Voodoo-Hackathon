// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: burst
// TYPE: vfx
// PURPOSE: Radial particle explosion in a single color — impact, hit, pickup
// USAGE: burst(particles, x, y, color, count?, power?)
// PARAMS:
//   particles  — engine particle array
//   x, y       — emission center (world coords)
//   color      — particle fill (CSS color string)
//   count      — number of particles (default 20)
//   power      — speed scalar (default 0.18)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function burst(particles, x, y, color, count = 20, power = 0.18) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.03 + Math.random() * power;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.05,
      radius: 2 + Math.random() * 5,
      color,
      life: 360 + Math.random() * 600,
    });
  }
}
