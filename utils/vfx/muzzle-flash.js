// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: muzzle-flash
// TYPE: vfx
// PURPOSE: Directional cone polygon flash + radial glow + spike lines —
//          cannon fire, gunshot, projectile-launch frame, fireball-out
// USAGE:
//   const flashes = [];
//   spawnMuzzleFlash(flashes, x, y, angleRad, opts?);
//   updateMuzzleFlashes(flashes, dt);
//   drawMuzzleFlashes(ctx, flashes);
// PARAMS (spawnMuzzleFlash opts):
//   length     — cone reach in px            (default 60)
//   width      — cone half-width at base     (default 18)
//   color      — outer cone color            (default "#ffbf31")
//   coreColor  — inner cone color            (default "#ffffff")
//   life       — duration in ms              (default 110)
//   spikes     — number of radial spike lines (default 5)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function spawnMuzzleFlash(flashes, x, y, angleRad, opts = {}) {
    const o = {
        length: opts.length !== undefined ? opts.length : 60,
        width: opts.width !== undefined ? opts.width : 18,
        color: opts.color || "#ffbf31",
        coreColor: opts.coreColor || "#ffffff",
        life: opts.life !== undefined ? opts.life : 110,
        spikes: opts.spikes !== undefined ? opts.spikes : 5,
    };
    const spikeData = [];
    for (let i = 0; i < o.spikes; i++) {
        spikeData.push({
            angle: (Math.random() - 0.5) * 1.6, // relative to forward direction
            len: o.length * (0.4 + Math.random() * 0.7),
        });
    }
    flashes.push({
        x, y,
        angle: angleRad,
        spikes: spikeData,
        life: o.life,
        maxLife: o.life,
        opts: o,
    });
}

function updateMuzzleFlashes(flashes, dt) {
    for (let i = flashes.length - 1; i >= 0; i--) {
        flashes[i].life -= dt;
        if (flashes[i].life <= 0) flashes.splice(i, 1);
    }
}

function drawMuzzleFlashes(ctx, flashes) {
    ctx.save();
    for (const f of flashes) {
        const t = 1 - f.life / f.maxLife;
        // Sharp punch in/out: scale 0 -> 1 -> 0 with fast attack.
        const scale = Math.sin(Math.PI * t);
        if (scale <= 0) continue;
        const alpha = Math.min(1, scale * 1.4);
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.angle);

        const len = f.opts.length * scale;
        const w = f.opts.width * scale;

        // Soft radial glow at the muzzle origin
        const gradR = Math.max(2, w * 1.6);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, gradR);
        grad.addColorStop(0, "rgba(255, 230, 160, " + (alpha * 0.85).toFixed(3) + ")");
        grad.addColorStop(1, "rgba(255, 230, 160, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, gradR, 0, Math.PI * 2);
        ctx.fill();

        // Spike lines radiating from the muzzle
        ctx.globalAlpha = alpha * 0.7;
        ctx.strokeStyle = f.opts.color;
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        for (const s of f.spikes) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            const sl = s.len * scale;
            ctx.lineTo(Math.cos(s.angle) * sl, Math.sin(s.angle) * sl);
            ctx.stroke();
        }

        // Outer cone polygon (teardrop)
        ctx.globalAlpha = alpha;
        ctx.fillStyle = f.opts.color;
        ctx.beginPath();
        ctx.moveTo(len, 0);
        ctx.quadraticCurveTo(len * 0.55, w * 0.85, 0, w * 0.45);
        ctx.lineTo(0, -w * 0.45);
        ctx.quadraticCurveTo(len * 0.55, -w * 0.85, len, 0);
        ctx.closePath();
        ctx.fill();

        // Inner bright core cone
        ctx.fillStyle = f.opts.coreColor;
        ctx.beginPath();
        ctx.moveTo(len * 0.78, 0);
        ctx.quadraticCurveTo(len * 0.4, w * 0.45, 0, w * 0.18);
        ctx.lineTo(0, -w * 0.18);
        ctx.quadraticCurveTo(len * 0.4, -w * 0.45, len * 0.78, 0);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
    ctx.restore();
}
