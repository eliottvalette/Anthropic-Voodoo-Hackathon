// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: confetti
// TYPE: vfx
// PURPOSE: Spinning colored ribbons with gravity + air drag — win states,
//          level-up, perfect-score, end-screen celebration
// USAGE:
//   const pieces = [];
//   spawnConfetti(pieces, x, y, count?, opts?);
//   spawnConfettiCannon(pieces, x, y, angleRad, count?, power?, opts?);
//   updateConfetti(pieces, dt, gravity?, drag?);
//   drawConfetti(ctx, pieces);
// PARAMS (spawnConfetti):
//   count   — number of pieces (default 60)
//   opts    — { colors?, spread?, vyMin?, vyMax?, life? }
// FLUTTER: a wobble phase animates a fake-3D scaleX = cos(phase),
//          producing the classic ribbon flip-spin look.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CONFETTI_DEFAULT_COLORS = [
    "#ff4141", "#ffbf31", "#ffe34a", "#73f03f",
    "#27a8ff", "#5b6cff", "#e93cff", "#ff8be0",
];

function _confettiPiece(x, y, vx, vy, colors, life) {
    return {
        x,
        y,
        vx,
        vy,
        rotation: Math.random() * Math.PI * 2,
        spin: -0.008 + Math.random() * 0.016,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.005 + Math.random() * 0.008,
        w: 6 + Math.random() * 5,
        h: 10 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        life,
        maxLife: life,
    };
}

function spawnConfetti(pieces, x, y, count = 60, opts = {}) {
    const colors = opts.colors || CONFETTI_DEFAULT_COLORS;
    const spread = opts.spread !== undefined ? opts.spread : 220;
    const vyMin = opts.vyMin !== undefined ? opts.vyMin : -0.32;
    const vyMax = opts.vyMax !== undefined ? opts.vyMax : -0.08;
    const life = opts.life !== undefined ? opts.life : 2200;
    for (let i = 0; i < count; i++) {
        const sx = x + (Math.random() - 0.5) * spread;
        const vx = (Math.random() - 0.5) * 0.25;
        const vy = vyMin + Math.random() * (vyMax - vyMin);
        pieces.push(_confettiPiece(sx, y, vx, vy, colors, life + Math.random() * 600));
    }
}

function spawnConfettiCannon(pieces, x, y, angleRad, count = 50, power = 0.45, opts = {}) {
    const colors = opts.colors || CONFETTI_DEFAULT_COLORS;
    const life = opts.life !== undefined ? opts.life : 2400;
    for (let i = 0; i < count; i++) {
        const a = angleRad + (Math.random() - 0.5) * 0.6;
        const speed = power * (0.55 + Math.random() * 0.55);
        pieces.push(
            _confettiPiece(
                x,
                y,
                Math.cos(a) * speed,
                Math.sin(a) * speed,
                colors,
                life + Math.random() * 500
            )
        );
    }
}

function updateConfetti(pieces, dt, gravity = 0.0006, drag = 0.0009) {
    for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += gravity * dt;
        // Air drag — exponential decay toward zero horizontal velocity.
        p.vx -= p.vx * drag * dt;
        p.rotation += p.spin * dt;
        p.wobble += p.wobbleSpeed * dt;
        if (p.life <= 0) pieces.splice(i, 1);
    }
}

function drawConfetti(ctx, pieces) {
    ctx.save();
    for (const p of pieces) {
        const alpha = Math.min(1, p.life / 500);
        if (alpha <= 0) continue;
        const sx = Math.cos(p.wobble); // fake-3D flutter
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.scale(sx, 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
    }
    ctx.restore();
}
