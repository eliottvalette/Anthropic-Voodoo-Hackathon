// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: section-destroy
// TYPE: vfx
// PURPOSE: Polygon-based destruction — split a sprite into N pieces
//          along jagged seams and remove them one-by-one as HP drops.
//          Each removed piece falls + drifts + fades.
// USAGE:
//   const SECTIONS = makeSectionPolys(3);   // 3 horizontal pieces, top falls first
//   // every frame:
//   for (let i = 0; i < hp; i++) drawSection(ctx, img, rect, SECTIONS[i]);
//   for (const d of dyingSections) drawDyingSection(ctx, img, rect, d, SECTIONS);
//
//   // on hit:
//   const destroyed = prevHp - 1;     // section that just died
//   dyingSections.push(makeDyingSection(destroyed, side));
//   updateDyingSections(dyingSections, dt);
//
// rect = { x, y, w, h }, side = "left" | "right" (drift direction)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeSectionPolys(n = 3) {
  // Returns n polygons stacked vertically, with jagged seams between them.
  // Index 0 = bottom (last to fall), n-1 = top (first to fall).
  if (n === 3) {
    return [
      [ [0,0.66], [0.15,0.64], [0.38,0.68], [0.62,0.63], [0.84,0.67], [1,0.65], [1,1], [0,1] ],
      [ [0,0.31], [0.20,0.33], [0.44,0.28], [0.66,0.32], [0.88,0.30], [1,0.31],
        [1,0.65], [0.84,0.67], [0.62,0.63], [0.38,0.68], [0.15,0.64], [0,0.66] ],
      [ [0,0], [1,0], [1,0.31], [0.88,0.30], [0.66,0.32], [0.44,0.28], [0.20,0.33], [0,0.31] ],
    ];
  }
  // Generic N-section: evenly spaced jagged seams
  const polys = [];
  for (let i = 0; i < n; i++) {
    const yTop = i / n, yBot = (i + 1) / n;
    const seamTop = i === 0 ? 0 : yTop + (Math.sin(i*7.3) * 0.02);
    const seamBot = i === n-1 ? 1 : yBot + (Math.sin((i+1)*7.3) * 0.02);
    polys.unshift([
      [0, seamTop], [0.5, seamTop + 0.02], [1, seamTop],
      [1, seamBot], [0.5, seamBot - 0.02], [0, seamBot],
    ]);
  }
  return polys;
}

function _polyPath(ctx, rect, poly) {
  ctx.beginPath();
  poly.forEach(([nx, ny], i) => {
    const px = rect.x + nx * rect.w;
    const py = rect.y + ny * rect.h;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
}

function _drawImageContain(ctx, img, x, y, w, h) {
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawSection(ctx, img, rect, poly) {
  if (!img) return;
  ctx.save();
  _polyPath(ctx, rect, poly);
  ctx.clip();
  _drawImageContain(ctx, img, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

function makeDyingSection(sectionIndex, side = "left", maxAge = 520) {
  return {
    sectionIndex,
    age: 0,
    maxAge,
    vx: side === "left" ? -0.045 : 0.045,
    gravity: 0.0010,
  };
}

function updateDyingSections(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].age += dt;
    if (list[i].age >= list[i].maxAge) list.splice(i, 1);
  }
}

function drawDyingSection(ctx, img, rect, d, polys) {
  if (!img) return;
  const t = d.age / d.maxAge;
  const fallY = 0.5 * d.gravity * d.age * d.age;
  const driftX = d.vx * d.age;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - t * t);
  ctx.translate(driftX, fallY);
  _polyPath(ctx, rect, polys[d.sectionIndex]);
  ctx.clip();
  _drawImageContain(ctx, img, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}
