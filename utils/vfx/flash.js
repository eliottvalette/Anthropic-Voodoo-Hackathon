// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: flash
// TYPE: vfx
// PURPOSE: Full-canvas (or rect-bounded) color flash that fades fast
//          — hit confirms, big-impact punctuation, screen transitions
// USAGE:
//   const flashes = [];
//   spawnFlash(flashes, color?, life?, peak?, rect?);
//   updateFlashes(flashes, dt);
//   drawFlashes(ctx, flashes, canvasW, canvasH);
// PARAMS (spawnFlash):
//   color  — fill color (default "#ffffff")
//   life   — duration in ms (default 180)
//   peak   — max alpha 0..1 (default 0.6)
//   rect   — optional { x, y, w, h } to bound the flash; full-canvas if omitted
// CURVE: alpha rises sharply then fades — sin(π·t) gives an instant pop.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function spawnFlash(flashes, color = "#ffffff", life = 180, peak = 0.6, rect) {
    flashes.push({ color, life, maxLife: life, peak, rect });
}

function updateFlashes(flashes, dt) {
    for (let i = flashes.length - 1; i >= 0; i--) {
        flashes[i].life -= dt;
        if (flashes[i].life <= 0) flashes.splice(i, 1);
    }
}

function drawFlashes(ctx, flashes, canvasW, canvasH) {
    if (flashes.length === 0) return;
    ctx.save();
    for (const f of flashes) {
        const t = 1 - f.life / f.maxLife;
        // sin curve: 0 → peak at t=0.5 → 0. Punchy in/out.
        const alpha = Math.sin(Math.PI * t) * f.peak;
        if (alpha <= 0) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = f.color;
        if (f.rect) {
            ctx.fillRect(f.rect.x, f.rect.y, f.rect.w, f.rect.h);
        } else {
            ctx.fillRect(0, 0, canvasW, canvasH);
        }
    }
    ctx.restore();
}
