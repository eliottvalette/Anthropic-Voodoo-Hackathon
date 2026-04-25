// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: coin-pop
// TYPE: vfx
// PURPOSE: Arcing rotating disc with fake-3D Y-axis flip — reward
//          feedback (gold, score, gem). Pairs naturally with float-text
//          for "+10" labels and burst for sparkle confetti.
// USAGE:
//   const coins = [];
//   spawnCoinPop(coins, x, y, opts?);
//   spawnCoinShower(coins, x, y, count?, opts?);
//   updateCoinPop(coins, dt, gravity?);
//   drawCoinPop(ctx, coins);
// PARAMS (spawnCoinPop opts):
//   color      — face color    (default "#ffd84a" — gold)
//   edgeColor  — rim color     (default "#a87514")
//   shineColor — center shine  (default "#fff7c2")
//   radius     — disc radius   (default 9)
//   life       — duration ms   (default 1200)
//   power      — pop velocity  (default 0.42)
//   angle      — launch angle in rad. Default = upward random spread.
// FAKE-3D: scaleX = |cos(spin)| produces edge-on flip; near zero, a thin
//          rectangle stands in for the rim. Gravity arcs the trajectory.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function spawnCoinPop(coins, x, y, opts = {}) {
    const o = {
        color: opts.color || "#ffd84a",
        edgeColor: opts.edgeColor || "#a87514",
        shineColor: opts.shineColor || "#fff7c2",
        radius: opts.radius !== undefined ? opts.radius : 9,
        life: opts.life !== undefined ? opts.life : 1200,
        power: opts.power !== undefined ? opts.power : 0.42,
    };
    const angle = opts.angle !== undefined
        ? opts.angle
        : -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    const speed = o.power * (0.7 + Math.random() * 0.55);
    coins.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spin: Math.random() * Math.PI * 2,
        spinSpeed: 0.012 + Math.random() * 0.012,
        color: o.color,
        edgeColor: o.edgeColor,
        shineColor: o.shineColor,
        radius: o.radius,
        life: o.life,
        maxLife: o.life,
    });
}

function spawnCoinShower(coins, x, y, count = 8, opts = {}) {
    for (let i = 0; i < count; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
        spawnCoinPop(coins, x, y, Object.assign({}, opts, { angle: a }));
    }
}

function updateCoinPop(coins, dt, gravity = 0.0011) {
    for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i];
        c.life -= dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.vy += gravity * dt;
        c.spin += c.spinSpeed * dt;
        if (c.life <= 0) coins.splice(i, 1);
    }
}

function drawCoinPop(ctx, coins) {
    ctx.save();
    for (const c of coins) {
        const alpha = Math.min(1, c.life / 350);
        if (alpha <= 0) continue;
        ctx.globalAlpha = alpha;
        const scaleX = Math.abs(Math.cos(c.spin));
        const rx = c.radius * scaleX;
        const ry = c.radius;
        // Rim edge — drawn as a thin rectangle; only visible when near edge-on
        // (scaleX < ~0.55 reads as "looking at the side of the coin").
        if (scaleX < 0.55) {
            const edgeAlpha = (1 - scaleX / 0.55) * alpha;
            ctx.globalAlpha = edgeAlpha;
            ctx.fillStyle = c.edgeColor;
            const edgeW = Math.max(1.5, c.radius * 0.45);
            ctx.fillRect(c.x - edgeW / 2, c.y - ry, edgeW, ry * 2);
            ctx.globalAlpha = alpha;
        }
        // Coin face (filled ellipse). Skip if too thin to see — the rim covers it.
        if (rx > 0.6) {
            ctx.fillStyle = c.color;
            ctx.beginPath();
            ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = c.edgeColor;
            ctx.lineWidth = 1.2;
            ctx.stroke();
            // Center shine — small offset highlight that fakes a specular hit.
            ctx.fillStyle = c.shineColor;
            ctx.beginPath();
            ctx.ellipse(
                c.x - rx * 0.25,
                c.y - ry * 0.32,
                Math.max(0.6, rx * 0.32),
                ry * 0.28,
                0, 0, Math.PI * 2
            );
            ctx.fill();
        }
    }
    ctx.restore();
}
