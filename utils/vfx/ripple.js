// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: ripple
// TYPE: vfx
// PURPOSE: Concentric expanding rings with stagger — water splashes,
//          ground-pound, sonar pings, ability-radius indicators
// USAGE:
//   const ripples = [];
//   spawnRipple(ripples, x, y, opts?);
//   updateRipples(ripples, dt);
//   drawRipples(ctx, ripples);
// PARAMS (spawnRipple opts):
//   ringCount  — number of rings (default 3)
//   color      — stroke color    (default "#7ef3ff")
//   maxRadius  — final radius    (default 90)
//   life       — duration per ring in ms (default 700)
//   gap        — start delay between successive rings in ms (default 140)
//   yScale     — vertical squash for "top-down puddle" look (default 0.42)
//   lineWidth  — initial stroke width (default 3)
// DIFF vs shockwave: yScale (ellipse) + multi-ring stagger + softer ease.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function spawnRipple(ripples, x, y, opts = {}) {
    const ringCount = opts.ringCount !== undefined ? opts.ringCount : 3;
    const color = opts.color || "#7ef3ff";
    const maxRadius = opts.maxRadius !== undefined ? opts.maxRadius : 90;
    const life = opts.life !== undefined ? opts.life : 700;
    const gap = opts.gap !== undefined ? opts.gap : 140;
    const yScale = opts.yScale !== undefined ? opts.yScale : 0.42;
    const lineWidth = opts.lineWidth !== undefined ? opts.lineWidth : 3;
    for (let i = 0; i < ringCount; i++) {
        ripples.push({
            x, y,
            color,
            maxRadius,
            lineWidth,
            yScale,
            life: life + i * gap,
            maxLife: life,
            delay: i * gap,
        });
    }
}

function updateRipples(ripples, dt) {
    for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        if (r.delay > 0) {
            r.delay -= dt;
        } else {
            r.life -= dt;
        }
        if (r.life <= 0) ripples.splice(i, 1);
    }
}

function drawRipples(ctx, ripples) {
    ctx.save();
    for (const r of ripples) {
        if (r.delay > 0) continue;
        const t = 1 - r.life / r.maxLife;
        // Ease-out cubic on radius — fast bloom, slow tail.
        const eased = 1 - Math.pow(1 - t, 3);
        const radius = eased * r.maxRadius;
        const alpha = Math.max(0, r.life / r.maxLife);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = Math.max(0.5, r.lineWidth * (1 - t * 0.7));
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, radius, radius * r.yScale, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}
