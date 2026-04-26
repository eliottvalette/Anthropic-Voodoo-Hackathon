// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: game-over-effect
// TYPE: end-screen / vfx
// PURPOSE: The dramatic "you lost" moment used in 90% of brainrot
//          playable ads — the punctuation BEFORE the static end-screen
//          slides in. Drop-in animated sequence:
//            • red full-screen flash
//            • screen-shake offset (caller applies via ctx.translate)
//            • desaturate-to-grayscale of the underlying frame
//            • dark red radial vignette pulse
//            • huge "GAME OVER" headline drops from above with bounce
//          Self-contained: no other utils required.
// USAGE:
//   const fx = createGameOverEffect({
//     W: 360, H: 640,
//     headline: "GAME OVER", subhead: "TAP TO RETRY",
//     duration: 1.8,
//   });
//   // game loop:
//   fx.update(dt);                          // dt in ms
//   ctx.save();
//   ctx.translate(fx.shakeX, fx.shakeY);    // apply shake to game world
//   drawGame(ctx);
//   ctx.restore();
//   fx.draw(ctx);                           // overlay the effect (no shake)
//   if (fx.done) drawGameLost(...);         // hand off to the static end-screen
//   // optional reset for replay:
//   fx.reset();
// FONT: load 'Lilita One' (Google Fonts).
// NOTE: desaturate uses ctx.globalCompositeOperation = "saturation".
//       Make sure your game frame has been drawn before calling fx.draw().
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createGameOverEffect(opts = {}) {
    const W = opts.W ?? 360;
    const H = opts.H ?? 640;
    const cx = opts.cx ?? W / 2;
    const cy = opts.cy ?? H * 0.40;
    const headline = opts.headline ?? "GAME OVER";
    const subhead = opts.subhead ?? null;
    const duration = opts.duration ?? 1.8;
    const font = opts.font || "'Lilita One', 'Arial Black', Arial";
    const accent = opts.accent || "#ed2024";
    const fontSize = opts.fontSize ?? Math.min(W, H) * 0.16;
    const shakeMag = opts.shakeMag ?? 14;
    const shakeDur = opts.shakeDur ?? 0.40;
    const desatStrength = opts.desatStrength ?? 1.0;   // 0..1 (1 = full grayscale)
    const dimStrength = opts.dimStrength ?? 0.30;      // 0..1 (extra darkening)

    let t = 0;
    let done = false;
    let shakeX = 0;
    let shakeY = 0;

    function update(dt) {
        if (done) return;
        const dts = dt / 1000;
        t += dts;

        // Quadratic-decay shake during the first shakeDur seconds
        const sT = Math.max(0, 1 - t / shakeDur);
        const mag = shakeMag * sT * sT;
        shakeX = (Math.random() - 0.5) * mag * 2;
        shakeY = (Math.random() - 0.5) * mag * 2;

        if (t >= duration) done = true;
    }

    // ─────────── draw layers ───────────

    function _drawRedFlash(ctx) {
        if (t > 0.10) return;
        const a = 1 - t / 0.10;
        ctx.save();
        ctx.fillStyle = "rgba(180,20,30," + (0.7 * a) + ")";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    function _drawDesat(ctx) {
        // Desaturate the underlying frame using composite op + neutral-gray fill.
        // "saturation" replaces saturation of the destination with the source's
        // saturation (which here is zero for solid gray) → grayscale.
        const u = Math.min(1, Math.max(0, (t - 0.05) / 0.50)) * desatStrength;
        if (u > 0) {
            ctx.save();
            ctx.globalCompositeOperation = "saturation";
            ctx.globalAlpha = u;
            ctx.fillStyle = "#808080";
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }
        // Subtle dim on top
        const d = Math.min(1, Math.max(0, (t - 0.05) / 0.50)) * dimStrength;
        if (d > 0) {
            ctx.save();
            ctx.fillStyle = "rgba(0,0,0," + d + ")";
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }
    }

    function _drawVignette(ctx) {
        const u = Math.min(1, Math.max(0, (t - 0.10) / 0.50));
        if (u <= 0) return;
        const pulse = 0.85 + Math.sin(t * 3.5) * 0.12;
        const inner = Math.min(W, H) * 0.30;
        const outer = Math.max(W, H) * 0.85;
        const g = ctx.createRadialGradient(W / 2, H * 0.45, inner, W / 2, H * 0.45, outer);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(0.65, "rgba(80,0,0," + (0.35 * u * pulse) + ")");
        g.addColorStop(1, "rgba(20,0,0," + (0.85 * u * pulse) + ")");
        ctx.save();
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    function _drawHeadline(ctx) {
        const start = 0.10, animDur = 0.55;
        if (t < start) return;
        const u = Math.min(1, (t - start) / animDur);

        // Bounce-out easing (4 bounces, identical curve to easeOutBounce)
        const n1 = 7.5625, d1 = 2.75;
        let bounce;
        if (u < 1 / d1) bounce = n1 * u * u;
        else if (u < 2 / d1) { const v = u - 1.5 / d1; bounce = n1 * v * v + 0.75; }
        else if (u < 2.5 / d1) { const v = u - 2.25 / d1; bounce = n1 * v * v + 0.9375; }
        else { const v = u - 2.625 / d1; bounce = n1 * v * v + 0.984375; }

        // Drop from above (yOff is added to cy)
        const dropFrom = -(cy + fontSize);
        const yOff = dropFrom * (1 - bounce);

        // Slight tilt that resolves to flat after the drop
        const settle = Math.min(1, Math.max(0, (t - start - animDur) / 0.30));
        const tilt = -0.045 * (1 - settle);

        // Tiny landing micro-shake on first beat
        let mx = 0, my = 0;
        if (t > start + 0.10 && t < start + 0.22) {
            const k = 1 - (t - start - 0.10) / 0.12;
            mx = (Math.random() - 0.5) * 4 * k;
            my = (Math.random() - 0.5) * 4 * k;
        }

        ctx.save();
        ctx.translate(cx + mx, cy + yOff + my);
        ctx.rotate(tilt);
        ctx.font = fontSize + "px " + font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";

        // shadow
        ctx.lineWidth = fontSize * 0.24;
        ctx.strokeStyle = "rgba(0,0,0,0.65)";
        ctx.strokeText(headline, 0, 8);
        // outline
        ctx.lineWidth = fontSize * 0.20;
        ctx.strokeStyle = "#0a0a0a";
        ctx.strokeText(headline, 0, 0);
        // red gradient fill
        const grd = ctx.createLinearGradient(0, -fontSize * 0.6, 0, fontSize * 0.6);
        grd.addColorStop(0, "#ff5a6a");
        grd.addColorStop(0.5, accent);
        grd.addColorStop(1, "#7a0a14");
        ctx.fillStyle = grd;
        ctx.fillText(headline, 0, 0);
        // top highlight band
        ctx.save();
        ctx.beginPath();
        ctx.rect(-W, -fontSize * 0.5, W * 2, fontSize * 0.20);
        ctx.clip();
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fillText(headline, 0, 0);
        ctx.restore();

        ctx.restore();

        if (subhead) {
            const u2 = Math.min(1, (t - start - animDur) / 0.30);
            if (u2 <= 0) return;
            // gentle pulse on the subhead
            const p = 0.85 + Math.sin(t * 4.5) * 0.15;
            ctx.save();
            ctx.translate(cx, cy + fontSize * 0.85);
            ctx.globalAlpha = u2 * p;
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
        _drawDesat(ctx);
        _drawVignette(ctx);
        _drawRedFlash(ctx);
        _drawHeadline(ctx);
    }

    function reset() {
        t = 0;
        done = false;
        shakeX = 0;
        shakeY = 0;
    }

    return {
        update, draw, reset,
        get t() { return t; },
        get done() { return done; },
        get shakeX() { return shakeX; },
        get shakeY() { return shakeY; },
    };
}
