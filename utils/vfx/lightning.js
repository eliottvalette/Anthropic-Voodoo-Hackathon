// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: lightning
// TYPE: vfx
// PURPOSE: Jagged midpoint-displaced bolt between two points with glow
//          and side-branches — chain attacks, electric projectiles, ult abilities
// USAGE:
//   const bolts = [];
//   spawnLightning(bolts, ax, ay, bx, by, opts?);
//   updateLightning(bolts, dt);
//   drawLightning(ctx, bolts);
// PARAMS (spawnLightning opts):
//   color       — bolt glow color   (default "#a8e3ff")
//   coreColor   — bright inner core (default "#ffffff")
//   life        — duration in ms    (default 220)
//   detail      — subdivision levels 3..6 (default 5)
//   displace    — peak perpendicular jitter in px (default 28)
//   branchProb  — chance per midpoint to spawn side branch (default 0.32)
//   flickerMs   — regenerate path every Nms for crackle (default 35)
//   width       — core line width (default 2.4)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _genJaggedPath(ax, ay, bx, by, displace, levels) {
    let pts = [{ x: ax, y: ay }, { x: bx, y: by }];
    for (let l = 0; l < levels; l++) {
        const next = [];
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1];
            next.push(a);
            const dx = b.x - a.x, dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len, ny = dx / len;
            const offset = (Math.random() - 0.5) * displace;
            next.push({
                x: (a.x + b.x) / 2 + nx * offset,
                y: (a.y + b.y) / 2 + ny * offset,
            });
        }
        next.push(pts[pts.length - 1]);
        pts = next;
        displace *= 0.5;
    }
    return pts;
}

function _genBranches(path, displace, branchProb) {
    const branches = [];
    // Skip endpoints — only branch from interior points.
    for (let i = 2; i < path.length - 2; i += 2) {
        if (Math.random() > branchProb) continue;
        const p = path[i];
        const next = path[i + 1];
        // Direction along the bolt at this point, perturbed.
        let dx = next.x - p.x, dy = next.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.4;
        const dist = 18 + Math.random() * 36;
        const ex = p.x + Math.cos(angle) * dist;
        const ey = p.y + Math.sin(angle) * dist;
        branches.push(_genJaggedPath(p.x, p.y, ex, ey, displace * 0.5, 3));
    }
    return branches;
}

function spawnLightning(bolts, ax, ay, bx, by, opts = {}) {
    const o = {
        color: opts.color || "#a8e3ff",
        coreColor: opts.coreColor || "#ffffff",
        life: opts.life !== undefined ? opts.life : 220,
        detail: opts.detail !== undefined ? opts.detail : 5,
        displace: opts.displace !== undefined ? opts.displace : 28,
        branchProb: opts.branchProb !== undefined ? opts.branchProb : 0.32,
        flickerMs: opts.flickerMs !== undefined ? opts.flickerMs : 35,
        width: opts.width !== undefined ? opts.width : 2.4,
    };
    const path = _genJaggedPath(ax, ay, bx, by, o.displace, o.detail);
    bolts.push({
        ax, ay, bx, by,
        path,
        branches: _genBranches(path, o.displace, o.branchProb),
        flickerCountdown: o.flickerMs,
        life: o.life,
        maxLife: o.life,
        opts: o,
    });
}

function updateLightning(bolts, dt) {
    for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        b.life -= dt;
        b.flickerCountdown -= dt;
        if (b.flickerCountdown <= 0) {
            b.path = _genJaggedPath(b.ax, b.ay, b.bx, b.by, b.opts.displace, b.opts.detail);
            b.branches = _genBranches(b.path, b.opts.displace, b.opts.branchProb);
            b.flickerCountdown = b.opts.flickerMs;
        }
        if (b.life <= 0) bolts.splice(i, 1);
    }
}

function _strokePath(ctx, path) {
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();
}

function drawLightning(ctx, bolts) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const b of bolts) {
        const alpha = Math.max(0, b.life / b.maxLife);
        if (alpha <= 0) continue;
        const w = b.opts.width;
        // Wide soft glow
        ctx.globalAlpha = alpha * 0.18;
        ctx.strokeStyle = b.opts.color;
        ctx.lineWidth = w * 6;
        _strokePath(ctx, b.path);
        for (const br of b.branches) _strokePath(ctx, br);
        // Mid glow
        ctx.globalAlpha = alpha * 0.55;
        ctx.lineWidth = w * 2.4;
        _strokePath(ctx, b.path);
        for (const br of b.branches) _strokePath(ctx, br);
        // Bright core
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = b.opts.coreColor;
        ctx.lineWidth = w;
        _strokePath(ctx, b.path);
        ctx.lineWidth = w * 0.6;
        for (const br of b.branches) _strokePath(ctx, br);
    }
    ctx.restore();
}
