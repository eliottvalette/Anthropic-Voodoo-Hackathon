// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: trail
// TYPE: vfx
// PURPOSE: Trailing particles behind a moving object — projectiles, dashes, missiles
// USAGE: Call spawnTrail() every frame on the projectile's position.
//   spawnTrail(particles, x, y, color, count = 1, spread = 4)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function spawnTrail(particles, x, y, color, count = 1, spread = 4) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * spread,
      y: y + (Math.random() - 0.5) * spread,
      vx: (Math.random() - 0.5) * 0.04,
      vy: (Math.random() - 0.5) * 0.04,
      radius: 2.5 + Math.random() * 3.5,
      color,
      life: 220 + Math.random() * 220,
    });
  }
}
