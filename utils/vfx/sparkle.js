// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: sparkle
// TYPE: vfx
// PURPOSE: 4-point twinkle stars — pickups, coins, magic, level-up shimmer
// USAGE:
//   const sparkles = [];
//   spawnSparkle(sparkles, x, y, color?, size?, life?);
//   spawnSparkleBurst(sparkles, x, y, color?, count?, radius?);
//   updateSparkles(sparkles, dt);
//   drawSparkles(ctx, sparkles);
// PARAMS (spawnSparkle):
//   color  — fill color (default "#ffffff")
//   size   — peak half-length of long axis in px (default 10)
//   life   — total duration in ms (default 600)
// SHAPE: Two crossed slim diamonds form a bright pinch-tipped 4-point star.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function spawnSparkle(sparkles, x, y, color = "#ffffff", size = 10, life = 600) {
    sparkles.push({
        x,
        y,
        color,
        size,
        rotation: Math.random() * Math.PI,
        spin: -0.0008 + Math.random() * 0.0016,
        life,
        maxLife: life,
    });
}

function spawnSparkleBurst(sparkles, x, y, color = "#ffffff", count = 6, radius = 22) {
    for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * radius;
        spawnSparkle(
            sparkles,
            x + Math.cos(a) * r,
            y + Math.sin(a) * r,
            color,
            6 + Math.random() * 8,
            450 + Math.random() * 350
        );
    }
}

function updateSparkles(sparkles, dt) {
    for (let i = sparkles.length - 1; i >= 0; i--) {
        const s = sparkles[i];
        s.life -= dt;
        s.rotation += s.spin * dt;
        if (s.life <= 0) sparkles.splice(i, 1);
    }
}

function drawSparkles(ctx, sparkles) {
    ctx.save();
    for (const s of sparkles) {
        const t = 1 - s.life / s.maxLife;
        // Twinkle scale: 0 → 1 → 0 (sin curve, peaks mid-life).
        const scale = Math.sin(Math.PI * t);
        if (scale <= 0) continue;
        const long = s.size * scale;
        const short = long * 0.22;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rotation);
        ctx.globalAlpha = Math.min(1, scale * 1.4);
        ctx.fillStyle = s.color;
        // Horizontal long diamond
        ctx.beginPath();
        ctx.moveTo(-long, 0);
        ctx.lineTo(0, -short);
        ctx.lineTo(long, 0);
        ctx.lineTo(0, short);
        ctx.closePath();
        ctx.fill();
        // Vertical long diamond
        ctx.beginPath();
        ctx.moveTo(0, -long);
        ctx.lineTo(short, 0);
        ctx.lineTo(0, long);
        ctx.lineTo(-short, 0);
        ctx.closePath();
        ctx.fill();
        // Bright center hot-spot
        ctx.globalAlpha = Math.min(1, scale * 1.8);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0.5, short * 0.9), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();
}
