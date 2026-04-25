// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: shockwave
// TYPE: vfx
// PURPOSE: Expanding ring on impact — explosions, ground-pound, big hits
// USAGE:
//   const waves = [];
//   spawnShockwave(waves, x, y, color?, maxRadius?, life?, lineWidth?);
//   updateShockwaves(waves, dt);
//   drawShockwaves(ctx, waves);
// PARAMS (spawnShockwave):
//   x, y       — center of the wave
//   color      — stroke color (default "#ffffff")
//   maxRadius  — final radius in px (default 90)
//   life       — total duration in ms (default 500)
//   lineWidth  — initial stroke width, thins to 1 (default 6)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function spawnShockwave(waves, x, y, color = "#ffffff", maxRadius = 90, life = 500, lineWidth = 6) {
    waves.push({
        x,
        y,
        radius: 0,
        maxRadius,
        color,
        lineWidth,
        life,
        maxLife: life,
    });
}

function updateShockwaves(waves, dt) {
    for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i];
        w.life -= dt;
        // Ease-out radius growth: fast start, slow finish.
        const t = 1 - w.life / w.maxLife;
        const eased = 1 - (1 - t) * (1 - t);
        w.radius = eased * w.maxRadius;
        if (w.life <= 0) waves.splice(i, 1);
    }
}

function drawShockwaves(ctx, waves) {
    ctx.save();
    for (const w of waves) {
        const alpha = Math.max(0, w.life / w.maxLife);
        const t = 1 - alpha;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = w.color;
        ctx.lineWidth = Math.max(1, w.lineWidth * (1 - t));
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}
