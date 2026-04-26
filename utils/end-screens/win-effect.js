// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: win-effect
// TYPE: end-screen / vfx
// PURPOSE: The dramatic "you won" moment used in 90% of brainrot
//          playable ads — the punctuation BEFORE the static end-screen
//          slides in. Drop-in animated sequence:
//            • golden full-screen flash
//            • rotating sun rays + pulsing radial glow
//            • huge bouncy headline ("VICTORY!") with overshoot
//            • confetti rain + corner cannons
//            • sparkle bursts orbiting the headline
//          Self-contained: no other utils required.
// USAGE:
//   const fx = createWinEffect({
//     W: 360, H: 640,
//     headline: "VICTORY!", subhead: "YOU WIN",
//     duration: 2.4,                 // seconds before .done flips true
//   });
//   // game loop:
//   fx.update(dt);                   // dt in ms
//   drawGame(ctx);                   // your game render
//   fx.draw(ctx);                    // overlay the effect
//   if (fx.done) drawGameWon(...);   // hand off to the static end-screen
//   // optional reset for replay:
//   fx.reset();
// FONT: load 'Lilita One' (Google Fonts) for the Supercell display look.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createWinEffect(opts = {}) {
    const W = opts.W ?? 360;
    const H = opts.H ?? 640;
    const cx = opts.cx ?? W / 2;
    const cy = opts.cy ?? H * 0.42;
    const headline = opts.headline ?? "VICTORY!";
    const subhead = opts.subhead ?? null;
    const duration = opts.duration ?? 2.4;
    const font = opts.font || "'Lilita One', 'Arial Black', Arial";
    const accent = opts.accent || "#ffd028";
    const accentDark = opts.accentDark || "#ff8a27";
    const fontSize = opts.fontSize ?? Math.min(W, H) * 0.18;

    const COLORS = opts.confettiColors || [
        "#ffbf31", "#ffe34a", "#73f03f", "#27a8ff",
        "#ff4141", "#e93cff", "#ffffff", "#ff8a27",
    ];

    // Cannon firing schedule (seconds after t=0)
    const CANNON_TIMES = opts.cannonTimes || [0.12, 0.55, 1.05];

    const confetti = [];
    const sparkles = [];

    let t = 0;          // elapsed seconds
    let done = false;
    let cannonIdx = 0;
    let topRainFired = false;
    let lastSparkleAt = 0;

    // ─────────── spawners ───────────

    function _spawnCannon(x, y, ang, count) {
        for (let i = 0; i < count; i++) {
            const a = ang + (Math.random() - 0.5) * 0.55;
            const sp = 0.45 + Math.random() * 0.50;
            confetti.push({
                x, y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp,
                rot: Math.random() * Math.PI * 2,
                spin: -0.008 + Math.random() * 0.016,
                wob: Math.random() * Math.PI * 2,
                wobS: 0.005 + Math.random() * 0.008,
                w: 6 + Math.random() * 5,
                h: 10 + Math.random() * 6,
                c: COLORS[(Math.random() * COLORS.length) | 0],
                life: 1800 + Math.random() * 600,
            });
        }
    }

    function _spawnRain(count) {
        for (let i = 0; i < count; i++) {
            confetti.push({
                x: Math.random() * W,
                y: -10 - Math.random() * 60,
                vx: (Math.random() - 0.5) * 0.10,
                vy: 0.10 + Math.random() * 0.18,
                rot: Math.random() * Math.PI * 2,
                spin: -0.008 + Math.random() * 0.016,
                wob: Math.random() * Math.PI * 2,
                wobS: 0.005 + Math.random() * 0.008,
                w: 6 + Math.random() * 5,
                h: 10 + Math.random() * 6,
                c: COLORS[(Math.random() * COLORS.length) | 0],
                life: 2400 + Math.random() * 900,
            });
        }
    }

    function _spawnSparkle(x, y) {
        sparkles.push({
            x, y,
            life: 600,
            max: 600,
            size: 12 + Math.random() * 8,
            color: ["#ffffff", "#ffe34a", "#ffd028"][(Math.random() * 3) | 0],
        });
    }

    // ─────────── update ───────────

    function update(dt) {
        if (done) return;
        const dts = dt / 1000;
        t += dts;

        // Fire scheduled cannon volleys
        while (cannonIdx < CANNON_TIMES.length && t >= CANNON_TIMES[cannonIdx]) {
            _spawnCannon(W * 0.05, H * 0.92, -Math.PI / 3.2, 28);
            _spawnCannon(W * 0.95, H * 0.92, -Math.PI + Math.PI / 3.2, 28);
            cannonIdx++;
        }
        // One top-down rain burst
        if (!topRainFired && t >= 0.20) {
            _spawnRain(50);
            topRainFired = true;
        }
        // Periodic sparkles around the headline once it's mostly settled
        if (t > 0.30 && t < duration - 0.30 && t - lastSparkleAt > 0.10) {
            lastSparkleAt = t;
            const ang = Math.random() * Math.PI * 2;
            const r = 60 + Math.random() * 70;
            _spawnSparkle(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
        }

        // Update confetti (gravity + air drag + rotation + flutter)
        for (let i = confetti.length - 1; i >= 0; i--) {
            const p = confetti[i];
            p.life -= dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 0.0006 * dt;
            p.vx -= p.vx * 0.0009 * dt;
            p.rot += p.spin * dt;
            p.wob += p.wobS * dt;
            if (p.life <= 0 || p.y > H + 30) confetti.splice(i, 1);
        }
        // Update sparkles
        for (let i = sparkles.length - 1; i >= 0; i--) {
            sparkles[i].life -= dt;
            if (sparkles[i].life <= 0) sparkles.splice(i, 1);
        }

        if (t >= duration) done = true;
    }

    // ─────────── draw layers ───────────

    function _drawRays(ctx) {
        const u = Math.min(1, Math.max(0, (t - 0.05) / 0.30));
        if (u <= 0) return;
        const rays = 14;
        const rot = t * 0.35;
        const len = Math.max(W, H) * 1.1;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.globalAlpha = 0.18 * u;
        for (let i = 0; i < rays; i++) {
            const a = rot + i * (Math.PI * 2 / rays);
            const aw = 0.085;
            ctx.fillStyle = i % 2 === 0 ? "#fff7c2" : accent;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a - aw) * len, Math.sin(a - aw) * len);
            ctx.lineTo(Math.cos(a + aw) * len, Math.sin(a + aw) * len);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    function _drawGlow(ctx) {
        const u = Math.min(1, Math.max(0, (t - 0.05) / 0.30));
        if (u <= 0) return;
        const pulse = 0.85 + Math.sin(t * 4.0) * 0.10;
        const r = 200 * pulse;
        const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
        g.addColorStop(0, "rgba(255,210,40," + (0.55 * u) + ")");
        g.addColorStop(0.45, "rgba(255,138,39," + (0.22 * u) + ")");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.save();
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    function _drawFlash(ctx) {
        if (t > 0.18) return;
        const a = Math.max(0, 1 - t / 0.18);
        ctx.save();
        ctx.fillStyle = "rgba(255,240,180," + (0.85 * a) + ")";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    function _drawConfetti(ctx) {
        ctx.save();
        for (const p of confetti) {
            const a = Math.min(1, p.life / 500);
            if (a <= 0) continue;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.scale(Math.cos(p.wob), 1);
            ctx.globalAlpha = a;
            ctx.fillStyle = p.c;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        }
        ctx.restore();
    }

    function _drawSparkles(ctx) {
        ctx.save();
        for (const s of sparkles) {
            const f = s.life / s.max;
            const a = Math.sin(f * Math.PI);
            if (a <= 0) continue;
            const sz = s.size * Math.sin((1 - f) * Math.PI * 0.9);
            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.globalAlpha = a;
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.25, 0);
            ctx.lineTo(0, sz); ctx.lineTo(-sz * 0.25, 0);
            ctx.closePath(); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(-sz, 0); ctx.lineTo(0, sz * 0.25);
            ctx.lineTo(sz, 0); ctx.lineTo(0, -sz * 0.25);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.beginPath(); ctx.arc(0, 0, sz * 0.22, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    function _drawHeadline(ctx) {
        const start = 0.10, animDur = 0.45;
        if (t < start) return;
        const u = Math.min(1, (t - start) / animDur);
        // back-out (overshoot) easing
        const c1 = 1.70158, c3 = c1 + 1;
        let scale = 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
        // post-settle gentle breathing
        if (t > start + animDur) {
            scale = 1 + Math.sin((t - start - animDur) * 5.0) * 0.025;
        }

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.font = fontSize + "px " + font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";

        // drop shadow
        ctx.lineWidth = fontSize * 0.22;
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.strokeText(headline, 0, 8);
        // main outline
        ctx.lineWidth = fontSize * 0.18;
        ctx.strokeStyle = "#0a0a0a";
        ctx.strokeText(headline, 0, 0);
        // gold gradient fill
        const grd = ctx.createLinearGradient(0, -fontSize * 0.6, 0, fontSize * 0.6);
        grd.addColorStop(0, "#fff7c2");
        grd.addColorStop(0.5, accent);
        grd.addColorStop(1, accentDark);
        ctx.fillStyle = grd;
        ctx.fillText(headline, 0, 0);
        // top highlight band
        ctx.save();
        ctx.beginPath();
        ctx.rect(-W, -fontSize * 0.5, W * 2, fontSize * 0.22);
        ctx.clip();
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fillText(headline, 0, 0);
        ctx.restore();

        ctx.restore();

        if (subhead) {
            const u2 = Math.min(1, (t - (start + animDur)) / 0.30);
            if (u2 <= 0) return;
            ctx.save();
            ctx.translate(cx, cy + fontSize * 0.75);
            ctx.globalAlpha = u2;
            ctx.font = (fontSize * 0.42) + "px " + font;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.lineJoin = "round";
            ctx.lineWidth = 5;
            ctx.strokeStyle = "#0a0a0a";
            ctx.strokeText(subhead, 0, 0);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(subhead, 0, 0);
            ctx.restore();
        }
    }

    function draw(ctx) {
        _drawRays(ctx);
        _drawGlow(ctx);
        _drawHeadline(ctx);
        _drawSparkles(ctx);
        _drawConfetti(ctx);
        _drawFlash(ctx);
    }

    function reset() {
        t = 0;
        done = false;
        cannonIdx = 0;
        topRainFired = false;
        lastSparkleAt = 0;
        confetti.length = 0;
        sparkles.length = 0;
    }

    return {
        update, draw, reset,
        get t() { return t; },
        get done() { return done; },
    };
}
