// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: drag-release
// TYPE: mechanic
// PURPOSE: True slingshot aim — drag in any direction, release fires opposite.
//          Pointer Events with capture (mouse + touch + pen).
//          Defaults are symmetric (360° aim, no gravity). Override pullRange,
//          toVelocity, gravity for game-specific feels (e.g. arc artillery).
// USAGE (generic 360° slingshot):
//   const dr = createDragRelease(canvas, {
//     getOrigin: () => ({ x: 180, y: 480 }),
//     pointerToWorld: e => ({ x, y }),
//     onFire: ({ vx, vy }) => spawnProjectile(vx, vy),
//   });
// USAGE (Castle Clashers artillery):
//   createDragRelease(canvas, {
//     getOrigin, pointerToWorld,
//     pullRangeX: [26, 135], pullRangeY: [-85, 105],
//     toVelocity: ({ pullX, pullY }) => ({ vx: 0.24 + pullX*0.0038, vy: -0.27 + pullY*0.0027 }),
//     gravity: 0.00078,
//     onFire,
//   });
// HOW PULL IS COMPUTED:
//   pullX = startX - currentX        (positive = dragged left)
//   pullY = startY - currentY        (positive = dragged up)
//   Velocity is the OPPOSITE of the drag → drag left fires right.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const _defaultToVelocity = ({ pullX, pullY }) => ({ vx: pullX * 0.004, vy: pullY * 0.004 });

function createDragRelease(canvas, opts) {
  let drag = null;
  const minPull = opts.minPull ?? 0;            // dead zone — don't fire if drag distance below this
  const offsetY = opts.originOffsetY ?? -20;    // raise drag origin above the unit (cannon height)

  function onDown(e) {
    if (opts.isEnabled && !opts.isEnabled()) return;
    const origin = opts.getOrigin();
    const pos = opts.pointerToWorld(e);
    if (Math.hypot(pos.x - origin.x, pos.y - origin.y) > (opts.activeRadius ?? 95)) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { startX: origin.x, startY: origin.y + offsetY, x: pos.x, y: pos.y };
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
    // Default symmetric range allows 360° aim. Game-specific code overrides.
    const [pxMin, pxMax] = opts.pullRangeX || [-150, 150];
    const [pyMin, pyMax] = opts.pullRangeY || [-150, 150];
    const rawPullX = d.startX - d.x;
    const rawPullY = d.startY - d.y;
    if (Math.hypot(rawPullX, rawPullY) < minPull) {
      if (opts.onCancel) opts.onCancel();
      return;
    }
    const pullX = Math.max(pxMin, Math.min(pxMax, rawPullX));
    const pullY = Math.max(pyMin, Math.min(pyMax, rawPullY));
    const v = (opts.toVelocity || _defaultToVelocity)({ pullX, pullY });
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
      const [pxMin, pxMax] = opts.pullRangeX || [-150, 150];
      const [pyMin, pyMax] = opts.pullRangeY || [-150, 150];
      const pullX = Math.max(pxMin, Math.min(pxMax, drag.startX - drag.x));
      const pullY = Math.max(pyMin, Math.min(pyMax, drag.startY - drag.y));
      const v = (opts.toVelocity || _defaultToVelocity)({ pullX, pullY });
      const g = opts.gravity ?? 0;        // generic slingshot has no gravity by default
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
