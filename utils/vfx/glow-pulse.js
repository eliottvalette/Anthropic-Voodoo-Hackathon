// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: glow-pulse
// TYPE: vfx
// PURPOSE: Soft radial-gradient glow that swells and fades — charge-up,
//          target highlight, aura/buff indicator, AOE telegraph
// USAGE:
//   const pulses = [];
//   spawnGlowPulse(pulses, x, y, opts?);
//   updateGlowPulses(pulses, dt);
//   drawGlowPulses(ctx, pulses);
// PARAMS (spawnGlowPulse opts):
//   color      — glow color           (default "#7ef3ff")
//   radius     — peak radius in px    (default 60)
//   life       — duration per pulse   (default 800)
//   count      — repeat count         (default 1)
//   gap        — delay between pulses (default 240)
//   peakAlpha  — max alpha 0..1       (default 0.7)
//   tracks     — { x, y } target to follow (optional)
// DIFF vs shockwave: filled radial gradient (soft ball) vs hard ring stroke.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function spawnGlowPulse(pulses, x, y, opts = {}) {
    const o = {
        color: opts.color || "#7ef3ff",
        radius: opts.radius !== undefined ? opts.radius : 60,
        life: opts.life !== undefined ? opts.life : 800,
        count: opts.count !== undefined ? opts.count : 1,
        gap: opts.gap !== undefined ? opts.gap : 240,
        peakAlpha: opts.peakAlpha !== undefined ? opts.peakAlpha : 0.7,
        tracks: opts.tracks || null,
    };
    for (let i = 0; i < o.count; i++) {
        pulses.push({
            x, y,
            color: o.color,
            maxRadius: o.radius,
            life: o.life + i * o.gap,
            maxLife: o.life,
            delay: i * o.gap,
            peakAlpha: o.peakAlpha,
            tracks: o.tracks,
        });
    }
}

function updateGlowPulses(pulses, dt) {
    for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        if (p.delay > 0) {
            p.delay -= dt;
        } else {
            p.life -= dt;
        }
        // Follow a moving target if provided.
        if (p.tracks) {
            p.x = p.tracks.x;
            p.y = p.tracks.y;
        }
        if (p.life <= 0) pulses.splice(i, 1);
    }
}

// Convert a hex or rgb-ish color into "rgba(r,g,b,a)" string.
// Accepts "#rrggbb", "#rgb", or "rgb(r,g,b)" forms.
function _glowToRgba(color, alpha) {
    if (color[0] === "#") {
        let r, g, b;
        if (color.length === 7) {
            r = parseInt(color.substr(1, 2), 16);
            g = parseInt(color.substr(3, 2), 16);
            b = parseInt(color.substr(5, 2), 16);
        } else {
            r = parseInt(color[1] + color[1], 16);
            g = parseInt(color[2] + color[2], 16);
            b = parseInt(color[3] + color[3], 16);
        }
        return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
    }
    if (color.indexOf("rgb(") === 0) {
        return color.replace("rgb(", "rgba(").replace(")", "," + alpha + ")");
    }
    return color;
}

function drawGlowPulses(ctx, pulses) {
    ctx.save();
    for (const p of pulses) {
        if (p.delay > 0) continue;
        const t = 1 - p.life / p.maxLife;
        // Sin-curve breathing: 0 → 1 → 0 across life.
        const env = Math.sin(Math.PI * t);
        if (env <= 0) continue;
        const radius = p.maxRadius * (0.45 + 0.55 * env);
        const alpha = p.peakAlpha * env;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        grad.addColorStop(0, _glowToRgba(p.color, alpha));
        grad.addColorStop(0.55, _glowToRgba(p.color, alpha * 0.35));
        grad.addColorStop(1, _glowToRgba(p.color, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
