// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: camera-lerp
// TYPE: mechanic
// PURPOSE: 2D camera with x/y/zoom, smooth dt-based lerp toward target
//          Pairs with pointerToWorld() reverse transform
// USAGE:
//   const cam = createCamera({ x: 180, y: 320, zoom: 1, smoothMs: 260 });
//   cam.setTarget({ x: 165, zoom: 1.28 });   // any subset
//   cam.update(dt);                           // every frame
//   cam.apply(ctx, W, H);                     // before drawing world
//   const wp = cam.pointerToWorld(e, canvas, W, H);
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createCamera(init = {}) {
  const cam = {
    x: init.x ?? 0,
    y: init.y ?? 0,
    zoom: init.zoom ?? 1,
    target: { x: init.x ?? 0, y: init.y ?? 0, zoom: init.zoom ?? 1 },
    smoothMs: init.smoothMs ?? 260,
  };

  return {
    get x() { return cam.x; },
    get y() { return cam.y; },
    get zoom() { return cam.zoom; },
    setTarget(t) {
      if (t.x !== undefined) cam.target.x = t.x;
      if (t.y !== undefined) cam.target.y = t.y;
      if (t.zoom !== undefined) cam.target.zoom = t.zoom;
    },
    snapTo(t) {
      if (t.x !== undefined) cam.x = cam.target.x = t.x;
      if (t.y !== undefined) cam.y = cam.target.y = t.y;
      if (t.zoom !== undefined) cam.zoom = cam.target.zoom = t.zoom;
    },
    update(dt) {
      const t = Math.min(1, dt / cam.smoothMs);
      cam.x += (cam.target.x - cam.x) * t;
      cam.y += (cam.target.y - cam.y) * t;
      cam.zoom += (cam.target.zoom - cam.zoom) * t;
    },
    apply(ctx, W, H) {
      ctx.translate(W / 2, H / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);
    },
    pointerToWorld(event, canvas, W, H) {
      const r = canvas.getBoundingClientRect();
      const sx = ((event.clientX - r.left) / r.width) * W;
      const sy = ((event.clientY - r.top) / r.height) * H;
      return {
        x: (sx - W / 2) / cam.zoom + cam.x,
        y: (sy - H / 2) / cam.zoom + cam.y,
        sx, sy,
      };
    },
  };
}
