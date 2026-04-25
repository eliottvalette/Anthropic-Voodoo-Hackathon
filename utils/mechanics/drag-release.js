// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: drag-release
// TYPE: mechanic
// PURPOSE: Slingshot / artillery aim — pointer down on origin, drag back, release fires
//          Pointer Events API with capture, works mouse + touch + pen
// USAGE:
//   const dr = createDragRelease(canvas, {
//     getOrigin: () => ({ x: 131, y: 251 }),   // world coords of "gun"
//     pointerToWorld: (e) => ({ x, y }),       // YOUR camera transform
//     activeRadius: 95,                         // tap detection radius (world units)
//     pullRangeX: [26, 135],
//     pullRangeY: [-85, 105],
//     toVelocity: ({ pullX, pullY }) => ({ vx: 0.24 + pullX*0.0038, vy: -0.27 + pullY*0.0027 }),
//     onFire: ({ vx, vy }) => fireProjectile(vx, vy),
//     isEnabled: () => state.phase === 'aiming',
//   });
//   // ... in render loop:
//   dr.drawTrajectory(ctx);
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createDragRelease(canvas, opts) {
  let drag = null;

  function onDown(e) {
    if (opts.isEnabled && !opts.isEnabled()) return;
    const origin = opts.getOrigin();
    const pos = opts.pointerToWorld(e);
    if (Math.hypot(pos.x - origin.x, pos.y - origin.y) > (opts.activeRadius ?? 95)) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { startX: origin.x, startY: origin.y - 20, x: pos.x, y: pos.y };
    if (opts.onStart) opts.onStart();
  }

  function onMove(e) {
    if (!drag) return;
    const pos = opts.pointerToWorld(e);
    drag.x = pos.x;
    drag.y = pos.y;
  }

  function onUp() {
    if (!drag) return;
    const d = drag;
    drag = null;
    const [pxMin, pxMax] = opts.pullRangeX || [26, 135];
    const [pyMin, pyMax] = opts.pullRangeY || [-85, 105];
    const pullX = Math.max(pxMin, Math.min(pxMax, d.startX - d.x));
    const pullY = Math.max(pyMin, Math.min(pyMax, d.startY - d.y));
    const v = opts.toVelocity({ pullX, pullY });
    if (opts.onFire) opts.onFire(v);
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  return {
    isDragging: () => drag !== null,
    drawTrajectory(ctx, steps = 20, dotR = 3.5) {
      if (!drag) return;
      const [pxMin, pxMax] = opts.pullRangeX || [26, 135];
      const [pyMin, pyMax] = opts.pullRangeY || [-85, 105];
      const pullX = Math.max(pxMin, Math.min(pxMax, drag.startX - drag.x));
      const pullY = Math.max(pyMin, Math.min(pyMax, drag.startY - drag.y));
      const v = opts.toVelocity({ pullX, pullY });
      const g = opts.gravity ?? 0.00078;
      const dt = opts.previewDt ?? 78;
      let x = drag.startX, y = drag.startY, vx = v.vx, vy = v.vy;
      ctx.save();
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < steps; i++) {
        x += vx * dt;
        y += vy * dt;
        vy += g * dt;
        ctx.globalAlpha = Math.max(0.15, 0.95 - i * 0.04);
        ctx.beginPath();
        ctx.arc(x, y, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.62)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(drag.startX, drag.startY);
      ctx.lineTo(drag.x, drag.y);
      ctx.stroke();
      ctx.restore();
    },
    destroy() {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    },
  };
}
