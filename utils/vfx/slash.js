// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: slash
// TYPE: vfx
// PURPOSE: Curved arc streak for melee swings — sword, ninja, claw,
//          dash strike. Animated head/tail sweep produces the iconic
//          "swoosh" comma-flash look.
// USAGE:
//   const slashes = [];
//   spawnSlash(slashes, cx, cy, fromAngle, toAngle, opts?);
//   updateSlashes(slashes, dt);
//   drawSlashes(ctx, slashes);
// PARAMS (spawnSlash opts):
//   radius     — arc radius from cx, cy (default 44)
//   thickness  — core stroke width      (default 8)
//   color      — bright core color      (default "#ffffff")
//   glowColor  — soft outer halo color  (default "#ffd84a")
//   life       — duration in ms         (default 260)
// MOTION: head leads, tail trails by an angular gap. Reveals →
//         steady → fade. Tunable arc length via |toAngle - fromAngle|.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function spawnSlash(slashes, cx, cy, fromAngle, toAngle, opts = {}) {
    const o = {
        radius: opts.radius !== undefined ? opts.radius : 44,
        thickness: opts.thickness !== undefined ? opts.thickness : 8,
        color: opts.color || "#ffffff",
        glowColor: opts.glowColor || "#ffd84a",
        life: opts.life !== undefined ? opts.life : 260,
    };
    slashes.push({
        cx, cy, fromAngle, toAngle,
        life: o.life,
        maxLife: o.life,
        opts: o,
    });
}

function updateSlashes(slashes, dt) {
    for (let i = slashes.length - 1; i >= 0; i--) {
        slashes[i].life -= dt;
        if (slashes[i].life <= 0) slashes.splice(i, 1);
    }
}

// Cubic ease-out — fast attack on the head sweep.
function _easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function drawSlashes(ctx, slashes) {
    ctx.save();
    ctx.lineCap = "round";
    for (const s of slashes) {
        const t = 1 - s.life / s.maxLife;
        // Head reaches end at t = 0.45; tail follows behind (delay 0.18).
        const headT = Math.min(1, _easeOutCubic(t / 0.45));
        const tailT = Math.max(0, Math.min(1, _easeOutCubic((t - 0.18) / 0.45)));
        if (headT - tailT <= 0.01) continue;

        const dir = s.toAngle >= s.fromAngle ? 1 : -1;
        const sweep = s.toAngle - s.fromAngle;
        const headAngle = s.fromAngle + sweep * headT;
        const tailAngle = s.fromAngle + sweep * tailT;

        // Alpha fades over full life, with extra tail-end taper.
        const alpha = Math.max(0, 1 - t) * Math.min(1, t * 3.5);
        if (alpha <= 0) continue;

        // Soft outer glow
        ctx.globalAlpha = alpha * 0.35;
        ctx.strokeStyle = s.opts.glowColor;
        ctx.lineWidth = s.opts.thickness * 2.6;
        ctx.beginPath();
        ctx.arc(s.cx, s.cy, s.opts.radius, tailAngle, headAngle, dir < 0);
        ctx.stroke();

        // Mid pass
        ctx.globalAlpha = alpha * 0.7;
        ctx.lineWidth = s.opts.thickness * 1.4;
        ctx.beginPath();
        ctx.arc(s.cx, s.cy, s.opts.radius, tailAngle, headAngle, dir < 0);
        ctx.stroke();

        // Bright core
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = s.opts.color;
        ctx.lineWidth = s.opts.thickness;
        ctx.beginPath();
        ctx.arc(s.cx, s.cy, s.opts.radius, tailAngle, headAngle, dir < 0);
        ctx.stroke();

        // Bright leading-edge tip dot — sells the "blade" feel.
        ctx.globalAlpha = alpha;
        ctx.fillStyle = s.opts.color;
        ctx.beginPath();
        ctx.arc(
            s.cx + Math.cos(headAngle) * s.opts.radius,
            s.cy + Math.sin(headAngle) * s.opts.radius,
            s.opts.thickness * 0.7,
            0, Math.PI * 2
        );
        ctx.fill();
    }
    ctx.restore();
}
