// ═══════════════════════════════════════════════════════════════════════════
// Castle Clashers — V2 PROMAX
//
//   • Live runtime destructible castle: each hit punches a real hole in the
//     sprite, charred bricks + cracks + broken edges are drawn into separate
//     mask canvases, and PNG-extracted fragment debris explode outward with
//     gravity, rotation, bounce, friction and shockwave forces.
//   • Reactive explosion: rays + glow + shockwave ring + core, no static PNG.
//   • Player-favoring damage: player deals 33.4% per hit (66.8% on crit),
//     player only takes 20% per enemy hit (40% glance rate on top → 0 dmg).
//     Player wins in ~3 hits, ~5 enemy hits to lose.
//   • Hit-stop on every impact (60ms), 130ms on crit, slow-mo on killing blow.
//   • Cinematic win/lose intro before the static end-screen.
//   • Haptics on every meaningful event (tap / hit / crit / win / lose).
//   • Audio (audio.js) + haptics (haptics.js) wired into every event.
//   • Combo counter, crit telegraph, tutorial hand on first turn.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  const W = 360;
  const H = 640;
  const WORLD_W = 740;
  const TAU = Math.PI * 2;
  const STORE_URL = "https://play.google.com/store/apps/details?id=com.epicoro.castleclashers";

  // ── Tuning knobs ──────────────────────────────────────────────────────────
  const PLAYER_CRIT_INTERVAL = 3;
  const PLAYER_DAMAGE_NORMAL = 33.4;     // % per hit
  const PLAYER_DAMAGE_CRIT   = 66.8;     // 2× normal
  const ENEMY_DAMAGE         = 20.0;     // % per non-glance enemy hit
  const ENEMY_GLANCE_RATE    = 0.40;
  const HIT_STOP_MS          = 60;
  const HIT_STOP_CRIT_MS     = 130;
  const SLOWMO_DURATION_MS   = 320;
  const SLOWMO_TIME_SCALE    = 0.35;
  // Destruction physics — world-units per second² and fractional damping/sec.
  const DESTRUCT = {
    gravity:        780,
    airDamping:     0.992,           // applied per-frame as Math.pow(damping, dt*60)
    groundBounce:   0.34,
    groundFriction: 0.72,
    impactPower:    1650,            // explosion force / radius driver
    critPowerMul:   1.85,
  };
  const COMBO_TIERS = [
    { min: 1, color: "#ffffff", scale: 1.0 },
    { min: 2, color: "#ffd24a", scale: 1.15 },
    { min: 3, color: "#ff8a27", scale: 1.32 },
    { min: 4, color: "#ff4141", scale: 1.50 },
  ];

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // ── DOM overlays (Supercell-style hint + permanent download CTA) ──────
  const elPullHint = document.getElementById("pull-hint");
  const elDownloadCta = document.getElementById("download-cta");
  if (elDownloadCta) {
    const triggerCta = () => {
      try { playSfx("ui"); } catch (e) {}
      try { haptic("ui"); } catch (e) {}
      openStore(STORE_URL);
    };
    elDownloadCta.addEventListener("click", triggerCta);
    elDownloadCta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); triggerCta(); }
    });
  }
  // ── Live tuning panel (top-right sliders, temporary while we dial in) ──
  // Defined now (no `state` access at parse time); invoked from boot() once
  // `state` is initialized.
  function bindTuningPanel() {
    const panel    = document.getElementById("tuning-panel");
    const toggle   = document.getElementById("tuning-toggle");
    const positionControls = [
      { side: "player", slot: 0, axis: "x", input: document.getElementById("t-p0-x"), output: document.getElementById("t-p0-x-out") },
      { side: "player", slot: 0, axis: "y", input: document.getElementById("t-p0-y"), output: document.getElementById("t-p0-y-out") },
      { side: "player", slot: 1, axis: "x", input: document.getElementById("t-p1-x"), output: document.getElementById("t-p1-x-out") },
      { side: "player", slot: 1, axis: "y", input: document.getElementById("t-p1-y"), output: document.getElementById("t-p1-y-out") },
      { side: "player", slot: 2, axis: "x", input: document.getElementById("t-p2-x"), output: document.getElementById("t-p2-x-out") },
      { side: "player", slot: 2, axis: "y", input: document.getElementById("t-p2-y"), output: document.getElementById("t-p2-y-out") },
      { side: "enemy", slot: 0, axis: "x", input: document.getElementById("t-e0-x"), output: document.getElementById("t-e0-x-out") },
      { side: "enemy", slot: 0, axis: "y", input: document.getElementById("t-e0-y"), output: document.getElementById("t-e0-y-out") },
      { side: "enemy", slot: 1, axis: "x", input: document.getElementById("t-e1-x"), output: document.getElementById("t-e1-x-out") },
      { side: "enemy", slot: 1, axis: "y", input: document.getElementById("t-e1-y"), output: document.getElementById("t-e1-y-out") },
      { side: "enemy", slot: 2, axis: "x", input: document.getElementById("t-e2-x"), output: document.getElementById("t-e2-x-out") },
      { side: "enemy", slot: 2, axis: "y", input: document.getElementById("t-e2-y"), output: document.getElementById("t-e2-y-out") },
    ];
    if (!panel || !toggle) return;
    if (positionControls.some(c => !c.input || !c.output)) return;
    positionControls.forEach((control) => {
      control.input.value = String(unitSlots[control.side][control.slot][control.axis]);
    });

    function applyAll() {
      positionControls.forEach((control) => {
        const value = Number(control.input.value);
        unitSlots[control.side][control.slot][control.axis] = value;
        control.output.textContent = String(Math.round(value));
      });
      state.tuning.unitPositions = {
        player: unitSlots.player.map(p => ({ x: p.x, y: p.y })),
        enemy: unitSlots.enemy.map(p => ({ x: p.x, y: p.y })),
      };
    }

    positionControls.map(c => c.input)
      .forEach(el => el.addEventListener("input", applyAll));
    toggle.addEventListener("click", () => panel.classList.toggle("collapsed"));
    applyAll();
  }

  function syncOverlays() {
    if (!elPullHint || !elDownloadCta) return;
    // PULL BACK hint visible while the player has not yet thrown a shot:
    // mirrors the tutorial-hand lifecycle.
    const showPull =
      !state.tutorialDismissed &&
      !state.ctaVisible &&
      state.phase === "aiming" &&
      state.currentSide === "player";
    elPullHint.classList.toggle("show",   showPull);
    elPullHint.classList.toggle("hidden", !showPull);
    // Download CTA: always visible during gameplay, hidden when end-screen
    // takes over (the end-screen has its own CTA).
    elDownloadCta.classList.toggle("hidden", state.ctaVisible);
  }

  const state = {
    phase: "loading",
    turnIndex: 0,
    playerHp: 100,
    enemyHp:  100,
    timer: 0,
    inputs: 0,
    drag: null,
    activeProjectile: null,
    projectiles: [],
    particles: [],
    floats: [],
    explosions: [],
    debris: [],
    ctaVisible: false,
    result: null,
    enemyQueuedAt: 0,
    lastTime: 0,
    snapshot: {},
    impactSide: null,
    currentSide: "player",
    teamSlot: { player: 0, enemy: 0 },
    playerShotsFired: 0,
    combo: 0,
    bestCombo: 0,
    hitStopUntil: 0,
    slowMoUntil: 0,
    flashUntil: 0,
    flashColor: null,
    endEffect: null,
    endStaticAt: 0,
    tutorialHandle: null,
    tutorialDismissed: false,
    castles: { player: null, enemy: null },   // Castle instances (v2)
    revealRadius: 0,                          // X-ray circle around active unit
  };

  const HAND_CURSOR_SRC = "../../../../nico-sandbox/runs/B11/final-assets-v1/ui/ui_hand_cursor.png";

  const shake = createShake(0.045);
  const camera = { x: WORLD_W / 2, y: 330, zoom: 0.72 };

  const unitTypes = [
    { unit: "unitPoison",  projectile: "projPoison",  color: "#73f03f", baseDmg: "33%",  label: "POISON" },
    { unit: "unitFire",    projectile: "projFire",    color: "#ff8a27", baseDmg: "33%",  label: "FIRE" },
    { unit: "unitMissile", projectile: "projMissile", color: "#ff4141", baseDmg: "33%", label: "ROCKET" },
  ];

  // World-space bounding rect for each castle (used for projectile collision and
  // for placing the destructible sprite). Centre and dims fixed, regardless of
  // current visual destruction state.
  const castleBoxes = {
    player: { x: 34,  y: 124, w: 235, h: 386 },
    enemy:  { x: 472, y: 124, w: 235, h: 386 },
  };
  const unitSlots = {
    player: [{ x: 214, y: 271 }, { x: 158, y: 348 }, { x: 102, y: 380 }],
    enemy:  [{ x: 533, y: 277 }, { x: 563, y: 376 }, { x: 630, y: 455 }],
  };

  // ── Vec2 + RNG helpers (small, local — full version is in the bank if reused)
  function vec(x, y) { return { x, y }; }
  function vAdd(a, b)   { return { x: a.x + b.x, y: a.y + b.y }; }
  function vSub(a, b)   { return { x: a.x - b.x, y: a.y - b.y }; }
  function vMul(v, s)   { return { x: v.x * s,   y: v.y * s }; }
  function vLen(v)      { return Math.hypot(v.x, v.y); }
  function vNormSafe(v) { const l = vLen(v); if (l < 1e-8) return { x: 1, y: 0 }; return { x: v.x / l, y: v.y / l }; }
  function fromAng(a)   { return { x: Math.cos(a), y: Math.sin(a) }; }

  function makeRng(seed) {
    let s = seed >>> 0;
    return {
      next() {
        let t = s += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      range(a, b) { return a + (b - a) * this.next(); },
      int(a, b)   { return Math.floor(this.range(a, b + 1)); },
      pick(arr)   { return arr[this.int(0, arr.length - 1)]; },
    };
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function makeOffscreen(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.floor(w));
    c.height = Math.max(1, Math.floor(h));
    return c;
  }

  // Mutate a {x,y,w,h} world-space box so that mapping the image's opaque
  // pixel AABB through it lands on the same world rect after trimming away
  // transparent borders. Threshold is tuned so anti-aliased halos don't pad
  // the rect.
  function tightenBoxToOpaque(box, image, alphaThresh) {
    if (!image || !box) return box;
    const t = (alphaThresh == null) ? 24 : alphaThresh;
    const w = image.naturalWidth, h = image.naturalHeight;
    const c = makeOffscreen(w, h);
    c.getContext("2d").drawImage(image, 0, 0);
    const data = c.getContext("2d").getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] >= t) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return box; // fully transparent, leave alone
    // Convert opaque pixel bounds back to the original world rect.
    const sx = box.w / w, sy = box.h / h;
    const newX = box.x + minX * sx;
    const newY = box.y + minY * sy;
    const newW = (maxX - minX + 1) * sx;
    const newH = (maxY - minY + 1) * sy;
    box.x = newX; box.y = newY; box.w = newW; box.h = newH;
    return box;
  }

  // ── Castle: live destructible sprite ──────────────────────────────────────
  // Keeps the source PNG, plus 4 mask canvases (removed, charred, edge, crack)
  // and a composed renderCanvas. Each hit calls applyExplosion(worldPoint, power)
  // which carves a hole and returns fragment Debris ready to push into state.debris.
  class Castle {
    constructor(image, side, box, rng) {
      this.image = image;
      this.side = side;
      this.box = box;
      this.rng = rng;

      this.naturalW = image.naturalWidth;
      this.naturalH = image.naturalHeight;
      // Sprite scale to fit the world bounding rect (uniform).
      this.scaleX = box.w / this.naturalW;
      this.scaleY = box.h / this.naturalH;
      this.scale  = Math.min(this.scaleX, this.scaleY);

      // Offscreen canvases at the natural sprite resolution.
      this.sourceCanvas = makeOffscreen(this.naturalW, this.naturalH);
      this.sourceCanvas.getContext("2d").drawImage(image, 0, 0);
      this.sourceData = this.sourceCanvas.getContext("2d").getImageData(0, 0, this.naturalW, this.naturalH).data;

      this.sourceMask    = makeOffscreen(this.naturalW, this.naturalH);
      this.sourceMask.getContext("2d").drawImage(image, 0, 0);

      this.removedMask   = makeOffscreen(this.naturalW, this.naturalH);
      this.charredCanvas = makeOffscreen(this.naturalW, this.naturalH);
      this.edgeCanvas    = makeOffscreen(this.naturalW, this.naturalH);
      this.crackCanvas   = makeOffscreen(this.naturalW, this.naturalH);
      this.renderCanvas  = makeOffscreen(this.naturalW, this.naturalH);
      // Cached alpha of the live renderCanvas, refreshed on each rebuild().
      // Used for per-pixel projectile collision so hits only register on the
      // visible silhouette, not the transparent areas of the bounding box.
      this.renderAlpha   = null;
      this.alphaThreshold = 32;   // out of 255

      this.rebuild();
    }

    // Sample current visible alpha (post-destruction) at a world-space point.
    // Returns 0..255 (0 = transparent / no hit, 255 = solid).
    alphaAt(worldPoint) {
      if (!this.renderAlpha) return 0;
      const local = this.worldToLocal(worldPoint);
      const x = Math.floor(local.x);
      const y = Math.floor(local.y);
      if (x < 0 || y < 0 || x >= this.naturalW || y >= this.naturalH) return 0;
      return this.renderAlpha[y * this.naturalW + x];
    }
    contains(worldPoint) {
      return this.alphaAt(worldPoint) >= this.alphaThreshold;
    }

    // World coord (inside the box rect) → local pixel inside the source image
    worldToLocal(p) {
      return {
        x: (p.x - this.box.x) / this.box.w * this.naturalW,
        y: (p.y - this.box.y) / this.box.h * this.naturalH,
      };
    }
    localToWorld(p) {
      return {
        x: this.box.x + (p.x / this.naturalW) * this.box.w,
        y: this.box.y + (p.y / this.naturalH) * this.box.h,
      };
    }

    hasAlpha(x, y) {
      if (x < 0 || y < 0 || x >= this.naturalW || y >= this.naturalH) return false;
      return this.sourceData[(y * this.naturalW + x) * 4 + 3] > 24;
    }

    applyExplosion(worldPoint, power) {
      const local = this.worldToLocal(worldPoint);
      // Damage shapes are sized in source-pixel space.
      const px2local = 1 / Math.max(this.scaleX, this.scaleY);
      const damageR = Math.max(28, power * 0.082 * px2local);
      const holeR   = Math.max(22, power * 0.058 * px2local);

      const damageBlob = jaggedBlob(local.x, local.y, damageR, 28, 0.42, this.rng);
      const holeBlob   = jaggedBlob(local.x, local.y, holeR,    22, 0.50, this.rng);

      // Burn marks (sticky charred area)
      const charCtx = this.charredCanvas.getContext("2d");
      this._drawCharredArea(charCtx, damageBlob);

      // Broken silhouette outline
      const edgeCtx = this.edgeCanvas.getContext("2d");
      drawBrokenEdge(edgeCtx, damageBlob, this.rng);

      // Crack rays
      const crackCtx = this.crackCanvas.getContext("2d");
      this._drawCracks(crackCtx, local, damageR, power);

      // Carve the hole permanently
      const maskCtx = this.removedMask.getContext("2d");
      maskCtx.fillStyle = "rgba(0,0,0,1)";
      drawPolygon(maskCtx, holeBlob);

      // Spawn fragments — they live in WORLD space (state.debris).
      const fragmentCount = Math.floor(clamp(power / 5.5, 90, 280));
      const fragments = this._spawnDebris(local, worldPoint, power, fragmentCount);

      this.rebuild();
      return fragments;
    }

    _drawCharredArea(ctx, polygon) {
      ctx.save();
      ctx.beginPath();
      polyPath(ctx, polygon);
      ctx.closePath();
      ctx.clip();
      const b = polygonBounds(polygon);
      const grad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
      grad.addColorStop(0,    "rgba(5,5,7,0.96)");
      grad.addColorStop(0.65, "rgba(22,20,22,0.96)");
      grad.addColorStop(1,    "rgba(6,6,8,0.96)");
      ctx.fillStyle = grad;
      ctx.fillRect(b.x - 10, b.y - 10, b.w + 20, b.h + 20);
      // Brick noise lines
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "rgba(80,72,72,0.8)";
      ctx.lineWidth = 1;
      const brickH = Math.max(7, this.naturalH * 0.018);
      const brickW = Math.max(18, this.naturalW * 0.068);
      for (let y = b.y - brickH; y < b.y + b.h + brickH; y += brickH) {
        ctx.beginPath();
        ctx.moveTo(b.x - 20, y); ctx.lineTo(b.x + b.w + 20, y);
        ctx.stroke();
        const offset = Math.floor(y / brickH) % 2 === 0 ? 0 : brickW / 2;
        for (let x = b.x - brickW; x < b.x + b.w + brickW; x += brickW) {
          ctx.beginPath();
          ctx.moveTo(x + offset, y); ctx.lineTo(x + offset, y + brickH);
          ctx.stroke();
        }
      }
      // Embers glow
      ctx.globalAlpha = 1;
      for (let i = 0; i < 14; i++) {
        const p = { x: this.rng.range(b.x, b.x + b.w), y: this.rng.range(b.y, b.y + b.h) };
        const len = this.rng.range(8, 36);
        const a = this.rng.range(-0.45, 0.45);
        ctx.strokeStyle = `rgba(255,${this.rng.int(72, 124)},${this.rng.int(12, 35)},${this.rng.range(0.18, 0.45)})`;
        ctx.lineWidth = this.rng.range(1, 2.4);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * len, p.y + Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawCracks(ctx, local, radius, power) {
      const count = Math.floor(6 + power / 110);
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 0; i < count; i++) {
        const angle = this.rng.range(-Math.PI, Math.PI);
        const startR = this.rng.range(radius * 0.5, radius * 0.95);
        let x = local.x + Math.cos(angle) * startR;
        let y = local.y + Math.sin(angle) * startR;
        let dir = angle + this.rng.range(-0.7, 0.7);
        const points = [{ x, y }];
        const steps = this.rng.int(2, 4);
        for (let s = 0; s < steps; s++) {
          dir += this.rng.range(-0.4, 0.4);
          const d = this.rng.range(10, 36);
          x += Math.cos(dir) * d;
          y += Math.sin(dir) * d;
          points.push({ x, y });
        }
        ctx.strokeStyle = "rgba(35,31,30,0.86)";
        ctx.lineWidth = 2;
        polyline(ctx, points);
        ctx.strokeStyle = "rgba(190,180,160,0.22)";
        ctx.lineWidth = 1;
        polyline(ctx, points);
      }
      ctx.restore();
    }

    _spawnDebris(local, worldPoint, power, count) {
      const fragments = [];
      const radius = power * 0.06 * (1 / Math.max(this.scaleX, this.scaleY));
      for (let i = 0; i < count; i++) {
        const a = this.rng.range(-Math.PI, Math.PI);
        const r = radius * Math.sqrt(this.rng.next());
        const lx = Math.floor(local.x + Math.cos(a) * r);
        const ly = Math.floor(local.y + Math.sin(a) * r);
        if (!this.hasAlpha(lx, ly)) continue;

        const size = this.rng.int(8, 24);
        const sx = clamp(Math.floor(lx - size / 2), 0, this.naturalW - 2);
        const sy = clamp(Math.floor(ly - size / 2), 0, this.naturalH - 2);
        const sw = clamp(size, 2, this.naturalW - sx);
        const sh = clamp(size, 2, this.naturalH - sy);

        const frag = makeOffscreen(sw, sh);
        const fctx = frag.getContext("2d");
        fctx.drawImage(this.sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
        // Cut the fragment to an irregular polygon so it doesn't look square.
        fctx.globalCompositeOperation = "destination-in";
        fctx.beginPath();
        const sides = this.rng.int(3, 6);
        const cx = sw * this.rng.range(0.34, 0.66);
        const cy = sh * this.rng.range(0.34, 0.66);
        const rr = Math.min(sw, sh) * this.rng.range(0.42, 0.78);
        for (let k = 0; k < sides; k++) {
          const aa = (k / sides) * TAU + this.rng.range(-0.45, 0.45);
          const pr = rr * this.rng.range(0.55, 1.16);
          const px = cx + Math.cos(aa) * pr;
          const py = cy + Math.sin(aa) * pr;
          if (k === 0) fctx.moveTo(px, py); else fctx.lineTo(px, py);
        }
        fctx.closePath();
        fctx.fill();
        fctx.globalCompositeOperation = "source-over";

        // Slight random darkening so fragments read as scorched rubble.
        if (i % 3 === 0) {
          fctx.fillStyle = `rgba(0,0,0,${this.rng.range(0.20, 0.45)})`;
          fctx.fillRect(0, 0, sw, sh);
        }

        const spawn = this.localToWorld({ x: sx + sw / 2, y: sy + sh / 2 });
        // Direction = away from impact, biased upward (explosion pushes up).
        const away = vSub(spawn, worldPoint);
        const dir = vNormSafe(vLen(away) < 0.01
          ? fromAng(this.rng.range(-Math.PI, Math.PI))
          : away);
        // Add upward bias
        const finalDir = vNormSafe({ x: dir.x, y: dir.y - 0.6 });
        // Speed scales with power in WORLD units / sec.
        const baseSpeed = (DESTRUCT.impactPower * 0.55) * this.rng.range(0.5, 1.0);
        const vel = vMul(finalDir, baseSpeed);
        // Extra upward kick
        vel.y -= this.rng.range(80, 260);
        // A small group gets propelled much further (the "hero shards")
        if (i % 5 === 0) {
          vel.x *= 1.4; vel.y -= 120;
        }

        const massScale = (sw * sh) / 760;
        const mass = clamp(massScale, 0.4, 4.0);
        const fragment = new Fragment(
          frag,
          spawn,
          vel,
          this.rng.range(-Math.PI, Math.PI),
          this.rng.range(-9, 9),
          mass,
          this.rng.range(3.0, 5.5),  // lifetime seconds
          this.scale
        );
        fragments.push(fragment);
      }
      return fragments;
    }

    rebuild() {
      const r = this.renderCanvas.getContext("2d");
      r.clearRect(0, 0, this.naturalW, this.naturalH);
      r.globalCompositeOperation = "source-over";
      r.drawImage(this.sourceCanvas, 0, 0);
      r.drawImage(this.charredCanvas, 0, 0);
      r.drawImage(this.edgeCanvas, 0, 0);
      r.drawImage(this.crackCanvas, 0, 0);
      r.globalCompositeOperation = "destination-in";
      r.drawImage(this.sourceMask, 0, 0);
      r.globalCompositeOperation = "destination-out";
      r.drawImage(this.removedMask, 0, 0);
      r.globalCompositeOperation = "source-over";

      // Refresh cached alpha for per-pixel collision.
      const data = r.getImageData(0, 0, this.naturalW, this.naturalH).data;
      const total = this.naturalW * this.naturalH;
      if (!this.renderAlpha || this.renderAlpha.length !== total) {
        this.renderAlpha = new Uint8ClampedArray(total);
      }
      for (let i = 0, j = 3; i < total; i++, j += 4) {
        this.renderAlpha[i] = data[j];
      }
    }

    draw(ctx) {
      const tilt = this.tiltRad || 0;
      if (!tilt) {
        ctx.drawImage(this.renderCanvas, this.box.x, this.box.y, this.box.w, this.box.h);
        return;
      }
      const cx = this.box.x + this.box.w * 0.5;
      const cy = this.box.y + this.box.h * 0.5;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tilt);
      ctx.drawImage(this.renderCanvas, -this.box.w * 0.5, -this.box.h * 0.5, this.box.w, this.box.h);
      ctx.restore();
    }
  }

  // ── Explosion: reactive shockwave + rays + glow + core ────────────────────
  class Explosion {
    constructor(position, power, rng) {
      this.position = { x: position.x, y: position.y };
      this.power = power;
      this.age = 0;
      this.duration = 0.78;        // seconds
      this.forceDuration = 0.32;
      this.maxRadius = power * 0.26;
      this.rays = [];
      const rayCount = 38;
      for (let i = 0; i < rayCount; i++) {
        this.rays.push({
          angle: rng.range(-Math.PI, Math.PI),
          length: rng.range(0.35, 1.35),
          width: rng.range(0.018, 0.075),
          color: rng.int(0, 3),
        });
      }
    }
    update(dtSec) { this.age += dtSec; }
    get alive() { return this.age < this.duration; }

    forceAt(point) {
      if (this.age > this.forceDuration) return { x: 0, y: 0 };
      const delta = vSub(point, this.position);
      const distance = Math.max(1, vLen(delta));
      const dir = vMul(delta, 1 / distance);
      const t = clamp(this.age / this.forceDuration, 0, 1);
      const radius = this.maxRadius * (0.1 + 0.9 * easeOutCubic(t));
      const band = this.maxRadius * 0.18;
      const ring = Math.exp(-((distance - radius) ** 2) / (2 * band * band));
      const core = Math.max(0, 1 - distance / (this.maxRadius * 0.62));
      const strength = this.power * (4.6 * ring + 1.6 * core) * Math.pow(1 - t, 1.3);
      return vMul(dir, strength);
    }

    draw(ctx) {
      const t = clamp(this.age / this.duration, 0, 1);
      const ft = clamp(this.age / this.forceDuration, 0, 1);
      const radius = this.maxRadius * easeOutCubic(ft);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      // Radial glow
      const glow = ctx.createRadialGradient(
        this.position.x, this.position.y, 0,
        this.position.x, this.position.y, Math.max(1, radius * 0.55)
      );
      glow.addColorStop(0,    `rgba(255,235,255,${0.8 * (1 - t)})`);
      glow.addColorStop(0.28, `rgba(255,170,80,${0.42 * (1 - t)})`);
      glow.addColorStop(1,    "rgba(80,30,10,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(this.position.x, this.position.y, radius * 0.62, 0, TAU);
      ctx.fill();

      // Rays
      for (const ray of this.rays) {
        const len = this.maxRadius * ray.length * easeOutCubic(clamp(t * 1.55, 0, 1));
        const width = this.maxRadius * ray.width * (1 - t * 0.76);
        if (width <= 0.4) continue;
        const axis = fromAng(ray.angle);
        const normal = { x: -axis.y, y: axis.x };
        const p1 = vAdd(this.position, vMul(normal,  width));
        const p2 = vAdd(this.position, vMul(normal, -width));
        const p3 = vAdd(this.position, vMul(axis,   len));
        const alpha = 0.66 * Math.pow(1 - t, 1.15);
        if (ray.color === 0)      ctx.fillStyle = `rgba(255,235,255,${alpha})`;
        else if (ray.color === 1) ctx.fillStyle = `rgba(255,150,60,${alpha})`;
        else if (ray.color === 2) ctx.fillStyle = `rgba(255,60,55,${alpha * 0.65})`;
        else                       ctx.fillStyle = `rgba(20,15,12,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      // Shockwave ring
      if (ft < 1) {
        ctx.strokeStyle = `rgba(255,228,178,${0.85 * (1 - ft)})`;
        ctx.lineWidth = Math.max(2, this.maxRadius * 0.018);
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, Math.max(2, radius), 0, TAU);
        ctx.stroke();
      }

      // Dark core
      ctx.fillStyle = `rgba(25,18,16,${0.95 * (1 - t)})`;
      ctx.beginPath();
      const coreR = this.maxRadius * 0.075 * (1 - t * 0.35);
      for (let i = 0; i < 13; i++) {
        const a = (i / 13) * TAU;
        const r = coreR * (0.72 + 0.36 * Math.sin(i * 2.41));
        const x = this.position.x + Math.cos(a) * r;
        const y = this.position.y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Fragment: a piece of the castle PNG with full physics ─────────────────
  class Fragment {
    constructor(canvasFrag, position, velocity, angle, angularVelocity, mass, lifeSec, scale) {
      this.canvas = canvasFrag;
      this.position = { x: position.x, y: position.y };
      this.velocity = { x: velocity.x, y: velocity.y };
      this.angle = angle;
      this.angularVelocity = angularVelocity;
      this.mass = mass;
      this.life = lifeSec;
      this.age = 0;
      this.resting = false;
      this.bounce = 0.20 + Math.random() * 0.22;
      this.friction = 0.56 + Math.random() * 0.22;
      this.scale = scale;
    }
    update(dt, explosions) {
      if (this.resting) { this.age += dt; return; }
      for (const e of explosions) {
        const f = e.forceAt(this.position);
        this.velocity.x += f.x * dt / this.mass;
        this.velocity.y += f.y * dt / this.mass;
      }
      this.velocity.y += DESTRUCT.gravity * dt;
      const damp = Math.pow(DESTRUCT.airDamping, dt * 60);
      this.velocity.x *= damp;
      this.velocity.y *= damp;
      this.position.x += this.velocity.x * dt;
      this.position.y += this.velocity.y * dt;
      this.angle += this.angularVelocity * dt;
      // Ground at y = 510 (below castle bases) in world coords.
      const gy = 510;
      if (this.position.y > gy) {
        this.position.y = gy;
        if (Math.abs(this.velocity.y) > 60) {
          this.velocity.y *= -DESTRUCT.groundBounce;
          this.velocity.x *= DESTRUCT.groundFriction;
          this.angularVelocity *= 0.72;
        } else {
          this.velocity.y = 0;
          this.velocity.x *= this.friction;
          this.angularVelocity *= 0.58;
        }
        if (Math.abs(this.velocity.x) < 8 && Math.abs(this.angularVelocity) < 0.25) {
          this.velocity.x = 0;
          this.angularVelocity = 0;
          this.resting = true;
        }
      }
      this.age += dt;
    }
    get alive() { return this.age < this.life; }
    draw(ctx) {
      const fade = clamp(1 - Math.max(0, this.age - this.life + 1) / 1, 0, 1);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(this.position.x, this.position.y);
      ctx.rotate(this.angle);
      // Shrink fragment in world coords by the castle's render scale so a
      // 16-pixel sprite fragment ends up ~16*scale world units wide.
      const sx = this.scale, sy = this.scale;
      ctx.drawImage(this.canvas,
        -this.canvas.width * sx * 0.5, -this.canvas.height * sy * 0.5,
        this.canvas.width * sx, this.canvas.height * sy);
      ctx.restore();
    }
  }

  // ── Polygon helpers ─────────────────────────────────────────────────────
  function polyPath(ctx, polygon) {
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x, polygon[i].y);
  }
  function drawPolygon(ctx, polygon) {
    ctx.beginPath();
    polyPath(ctx, polygon);
    ctx.closePath();
    ctx.fill();
  }
  function polyline(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
  function polygonBounds(polygon) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of polygon) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  function jaggedBlob(cx, cy, radius, points, wobble, rng) {
    const poly = [];
    for (let i = 0; i < points; i++) {
      const a = (i / points) * TAU;
      const r = radius * rng.range(1 - wobble, 1 + wobble);
      poly.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return poly;
  }
  function drawBrokenEdge(ctx, polygon, rng) {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(18,16,17,0.92)";
    ctx.lineWidth = 5;
    ctx.beginPath(); polyPath(ctx, polygon); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = "rgba(70,60,55,0.72)";
    ctx.lineWidth = 2;
    ctx.beginPath(); polyPath(ctx, polygon); ctx.closePath(); ctx.stroke();
    for (let i = 0; i < polygon.length; i += 2) {
      const p = polygon[i];
      const r = rng.range(1.5, 4);
      ctx.fillStyle = `rgba(8,8,10,${rng.range(0.32, 0.7)})`;
      ctx.beginPath();
      ctx.arc(p.x + rng.range(-2, 2), p.y + rng.range(-2, 2), r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Engine state expose for harness ─────────────────────────────────────
  const images = {};
  window.__engineState = {
    get phase() { return state.phase; },
    get turnIndex() { return state.turnIndex; },
    get playerHp() { return state.playerHp; },
    get enemyHp()  { return state.enemyHp; },
    get projectiles() { return state.projectiles.length; },
    get inputs() { return state.inputs; },
    get ctaVisible() { return state.ctaVisible; },
    get combo() { return state.combo; },
    get bestCombo() { return state.bestCombo; },
    snapshot: () => makeSnapshot(),
  };
  function makeSnapshot() {
    state.snapshot = {
      phase: state.phase, turnIndex: state.turnIndex,
      playerHp: state.playerHp, enemyHp: state.enemyHp,
      projectiles: state.projectiles.length, inputs: state.inputs,
      ctaVisible: state.ctaVisible, result: state.result,
      combo: state.combo, bestCombo: state.bestCombo,
    };
    return state.snapshot;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }
  async function getManifest() {
    if (window.CC_ASSETS) return window.CC_ASSETS;
    const res = await fetch(window.CC_ASSET_MANIFEST_URL || "./assets.json");
    return res.json();
  }
  async function boot() {
    try {
      const manifest = await getManifest();
      // Only load the keys we actually need (skip the now-unused destruction PNGs).
      // Pre-rendered destruction PNGs are obsolete (live destructible system).
      // castleInside is loaded — it powers the X-ray reveal circle.
      const skip = new Set([
        "castlePlayer_impact","castlePlayer_break","castlePlayer_destroyed",
        "castleEnemy_impact","castleEnemy_break","castleEnemy_destroyed",
      ]);
      await Promise.all(
        Object.entries(manifest)
          .filter(([k]) => !skip.has(k))
          .map(async ([k, src]) => { images[k] = await loadImage(src); })
      );
      try { if (document.fonts) await document.fonts.load("32px 'Lilita One'"); } catch (e) {}

      // Tighten castleBoxes to the opaque silhouette of each PNG so the visible
      // sprite IS the hitbox (no more dead-zone hits in transparent corners).
      tightenBoxToOpaque(castleBoxes.player, images.castlePlayer);
      tightenBoxToOpaque(castleBoxes.enemy,  images.castleEnemy);

      // Build live destructible Castles
      const rngP = makeRng(12), rngE = makeRng(231);
      state.castles.player = new Castle(images.castlePlayer, "player", castleBoxes.player, rngP);
      state.castles.enemy  = new Castle(images.castleEnemy,  "enemy",  castleBoxes.enemy,  rngE);
      // Fixed visual tuning for castle lean and inside alignment.
      state.tuning = {
        tiltBlueDeg: -9.5,          // player castle, leaning left
        tiltRedDeg:  -9.0,          // enemy castle, leaning left
        insideScale: 0.86,          // inside PNG width relative to outside box
        insideTopRel: 0.02,         // inside PNG top offset (×box.h, +down/-up)
        insideLeftRel: 0.02,        // inside PNG x offset (×box.w, +right/-left)
      };
      state.castles.player.tiltRad = (state.tuning.tiltBlueDeg * Math.PI) / 180;
      state.castles.enemy.tiltRad  = (state.tuning.tiltRedDeg  * Math.PI) / 180;

      // Wire the live tuning sliders now that castles + state.tuning exist.
      bindTuningPanel();

      state.phase = "aiming";
      showTutorialHandIfNeeded();
      requestAnimationFrame(loop);
    } catch (e) {
      console.error(e);
      state.phase = "error";
      requestAnimationFrame(loop);
    }
  }

  // ── Tutorial hand ──────────────────────────────────────────────────────
  function showTutorialHandIfNeeded() {
    if (state.tutorialDismissed || state.tutorialHandle) return;
    if (typeof TutorialHand === "undefined") return;
    if (state.currentSide !== "player" || state.phase !== "aiming") return;
    const slot = activeSlot();
    const camX = 165, camY = 330, camZoom = 1.28;
    const slotScreenX = (slot.x - camX) * camZoom + W / 2;
    const slotScreenY = (slot.y - camY) * camZoom + H / 2;
    const onScreenStart = { x: slotScreenX,        y: slotScreenY - 6 };
    const onScreenEnd   = { x: slotScreenX - 78,   y: slotScreenY + 78 };
    state.tutorialHandle = TutorialHand.show({
      container: "#stage",
      coordinateSize: { width: W, height: H },
      fit: "contain",
      mode: "swipe",
      from: onScreenStart, to: onScreenEnd,
      handSrc: HAND_CURSOR_SRC,
      handSize: 88,
      duration: 1450,
      repeat: true,
    });
  }
  function dismissTutorialHand() {
    if (state.tutorialDismissed) return;
    state.tutorialDismissed = true;
    if (state.tutorialHandle) {
      state.tutorialHandle.remove();
      state.tutorialHandle = null;
    }
  }

  // ── Turn helpers ───────────────────────────────────────────────────────
  function activeTurn() { return { side: state.currentSide, slot: state.teamSlot[state.currentSide] }; }
  function activeSlot() { const t = activeTurn(); return unitSlots[t.side][t.slot]; }

  function getCanvasViewport() {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / W, rect.height / H);
    return {
      left: rect.left + (rect.width - W * scale) / 2,
      top:  rect.top  + (rect.height - H * scale) / 2,
      width: W * scale, height: H * scale,
    };
  }
  function pointerToWorld(event) {
    const v = getCanvasViewport();
    const sx = ((event.clientX - v.left) / v.width)  * W;
    const sy = ((event.clientY - v.top)  / v.height) * H;
    return {
      x: (sx - W / 2) / camera.zoom + camera.x,
      y: (sy - H / 2) / camera.zoom + camera.y,
      sx, sy,
    };
  }
  function isPointInCta(b, x, y) { if (!b) return false; return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }

  function onPointerDown(event) {
    startMusic();
    haptic("tap");
    if (state.ctaVisible && performance.now() >= state.endStaticAt) {
      const r = canvas.getBoundingClientRect();
      const sx = ((event.clientX - r.left) / r.width)  * W;
      const sy = ((event.clientY - r.top)  / r.height) * H;
      const fn = state.result === "victory" ? drawGameWon : drawGameLost;
      if (isPointInCta(fn.lastCtaBounds, sx, sy)) {
        playSfx("ui");
        haptic("ui");
        openStore(STORE_URL);
      }
      return;
    }
    if (state.phase !== "aiming" || activeTurn().side !== "player") return;
    const pos = pointerToWorld(event);
    const slot = activeSlot();
    if (Math.hypot(pos.x - slot.x, pos.y - slot.y) > 95) return;
    canvas.setPointerCapture(event.pointerId);
    state.inputs += 1;
    state.drag = { startX: slot.x, startY: slot.y - 20, x: pos.x, y: pos.y };
    dismissTutorialHand();
  }
  function onPointerMove(event) {
    if (!state.drag) return;
    const pos = pointerToWorld(event);
    state.drag.x = pos.x; state.drag.y = pos.y;
  }
  function onPointerUp() {
    if (!state.drag) return;
    const drag = state.drag;
    state.drag = null;
    state.inputs += 1;
    const pullX = Math.max(26, Math.min(135, drag.startX - drag.x));
    const pullY = Math.max(-85, Math.min(105, drag.startY - drag.y));
    const vx = 0.24 + pullX * 0.0038;
    const vy = -0.27 + pullY * 0.0027;
    fireProjectile("player", activeTurn().slot, vx, vy);
  }

  function queueEnemy(now) {
    if (state.phase !== "enemy_wait") return;
    if (!state.enemyQueuedAt) state.enemyQueuedAt = now;
    if (now - state.enemyQueuedAt < 650) return;
    const turn = activeTurn();
    const from = unitSlots.enemy[turn.slot];
    const target = hitbox("player");
    const aimNoise = 0.22;
    const aimX = target.x + target.w * (0.42 + Math.sin(state.timer * 2.1 + turn.slot) * aimNoise);
    const aimY = target.y + target.h * (0.44 + Math.cos(state.timer * 1.7 + turn.slot) * aimNoise);
    const flight = 930;
    const gravity = 0.00078;
    const vx = (aimX - from.x) / flight;
    const vy = (aimY - (from.y - 20) - 0.5 * gravity * flight * flight) / flight;
    fireProjectile("enemy", turn.slot, vx, vy);
    state.enemyQueuedAt = 0;
  }

  function fireProjectile(side, slot, vx, vy) {
    const from = unitSlots[side][slot];
    const type = unitTypes[slot];
    const isPlayerShot = side === "player";
    let isCrit = false;
    if (isPlayerShot) {
      state.playerShotsFired += 1;
      isCrit = (state.playerShotsFired % PLAYER_CRIT_INTERVAL) === 0;
    }
    const projectile = {
      side, slot, type,
      x: from.x, y: from.y - 20,
      vx, vy, gravity: 0.00078, age: 0,
      rotation: side === "player" ? 0 : Math.PI,
      isCrit,
    };
    state.phase = "projectile";
    state.activeProjectile = projectile;
    state.projectiles.push(projectile);
    recoil(side, slot, isCrit);
  }
  function recoil(side, slot, isCrit) {
    const p = unitSlots[side][slot];
    const count = isCrit ? 14 : 8;
    burst(state.particles, p.x, p.y - 8, "rgba(255,255,255,0.7)", count, 0.06);
    smoke(state.particles, p.x, p.y - 4, isCrit ? 9 : 5);
    playSfx("shoot");
    if (side === "player") haptic("tap");
    if (isCrit) { flash("#fff8d4", 90); shake.trigger(4); }
  }

  function flash(color, durationMs) {
    state.flashUntil = performance.now() + durationMs;
    state.flashColor = color;
  }

  function update(dtMsRaw, now) {
    if (now < state.hitStopUntil) return;
    const dtMs = now < state.slowMoUntil ? dtMsRaw * SLOWMO_TIME_SCALE : dtMsRaw;
    const dtSec = dtMs / 1000;
    if (state.phase !== "loading" && state.phase !== "error" && !state.ctaVisible) {
      state.timer += dtSec;
    }
    updateCamera(dtMs);
    queueEnemy(now);

    // Projectiles (still in ms units for compatibility with v1 ballistics)
    for (let i = state.projectiles.length - 1; i >= 0; i -= 1) {
      const p = state.projectiles[i];
      p.age += dtMs;
      p.vy += p.gravity * dtMs;
      p.x += p.vx * dtMs;
      p.y += p.vy * dtMs;
      p.rotation = Math.atan2(p.vy, p.vx);
      const trailCount = p.isCrit ? 2 : 1;
      const trailColor = p.isCrit ? "#ffd24a" : p.type.color;
      spawnTrail(state.particles, p.x - Math.sign(p.vx) * 6, p.y, trailColor, trailCount, p.isCrit ? 7 : 5);
      const targetSide = p.side === "player" ? "enemy" : "player";
      const box = hitbox(targetSide);
      const inAabb = p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
      const targetCastle = state.castles[targetSide];
      // Per-pixel: hit only registers if the projectile is inside the visible
      // (non-destroyed) silhouette. Falls back to AABB if alpha cache missing.
      const didHit = inAabb && (targetCastle && targetCastle.renderAlpha
        ? targetCastle.contains({ x: p.x, y: p.y })
        : true);
      if (didHit) {
        applyHit(targetSide, p);
        state.projectiles.splice(i, 1);
        state.activeProjectile = null;
        window.setTimeout(advanceTurn, 360);
      } else if (p.x < -80 || p.x > WORLD_W + 80 || p.y > 690 || p.age > 2900) {
        if (p.y < 690) smoke(state.particles, p.x, Math.min(p.y, 685), 8);
        if (p.side === "player") state.combo = 0;
        state.projectiles.splice(i, 1);
        state.activeProjectile = null;
        window.setTimeout(advanceTurn, 260);
      }
    }

    updateParticles(state.particles, dtMs);
    updateFloats(state.floats, dtMs);
    shake.update(dtMs);

    // V2 destructible system — runs in dtSec.
    for (let i = state.explosions.length - 1; i >= 0; i--) {
      state.explosions[i].update(dtSec);
      if (!state.explosions[i].alive) state.explosions.splice(i, 1);
    }
    for (let i = state.debris.length - 1; i >= 0; i--) {
      state.debris[i].update(dtSec, state.explosions);
      const d = state.debris[i];
      if (!d.alive || d.position.x < -120 || d.position.x > WORLD_W + 120) state.debris.splice(i, 1);
    }

    if (state.endEffect) state.endEffect.update(dtMs);
    updateReveal(dtMs);
    makeSnapshot();
  }

  // Reveal circle around the active unit during aiming/enemy_wait.
  // Smoothly grows to a target radius; we use it to mask in `castleInside`
  // so the player can see who's hiding inside the active unit's tower.
  function updateReveal(dtMs) {
    const active = !state.ctaVisible && (state.phase === "aiming" || state.phase === "enemy_wait");
    const target = active ? 110 : 0;
    const t = Math.min(1, dtMs / 280);
    state.revealRadius += (target - state.revealRadius) * t;
  }
  function revealForSide(side) {
    if (state.revealRadius < 1 || state.ctaVisible) return null;
    if (state.phase !== "aiming" && state.phase !== "enemy_wait") return null;
    if (state.currentSide !== side) return null;
    const slot = activeSlot();
    return { cx: slot.x, cy: slot.y - 30, r: state.revealRadius };
  }

  function updateCamera(dt) {
    let targetX = 170, targetZoom = 1.34;
    if (state.phase === "projectile" && state.activeProjectile) {
      targetX = state.activeProjectile.x;
      targetZoom = state.activeProjectile.isCrit ? 0.74 : 0.82;
    } else if (state.phase === "projectile" && state.impactSide) {
      targetX = state.impactSide === "player" ? 165 : 570;
      targetZoom = 1.2;
    } else if (state.ctaVisible) {
      targetX = state.result === "victory" ? 590 : 150;
      targetZoom = 0.92;
    } else if (state.phase === "enemy_wait") {
      targetX = 570; targetZoom = 1.34;
    } else if (state.phase === "aiming") {
      targetX = activeTurn().side === "player" ? 165 : 570;
      targetZoom = 1.28;
    }
    targetX = Math.max(150, Math.min(WORLD_W - 150, targetX));
    const t = Math.min(1, dt / 260);
    camera.x += (targetX - camera.x) * t;
    camera.zoom += (targetZoom - camera.zoom) * t;
    camera.y += (330 - camera.y) * t;
  }

  function comboTier(combo) {
    let tier = COMBO_TIERS[0];
    for (const t of COMBO_TIERS) if (combo >= t.min) tier = t;
    return tier;
  }

  function applyHit(side, projectile) {
    const isPlayerShot = projectile.side === "player";
    let damage;
    if (isPlayerShot) {
      damage = projectile.isCrit ? PLAYER_DAMAGE_CRIT : PLAYER_DAMAGE_NORMAL;
    } else {
      damage = Math.random() < ENEMY_GLANCE_RATE ? 0 : ENEMY_DAMAGE;
    }

    const prevHp = side === "player" ? state.playerHp : state.enemyHp;
    const newHp = Math.max(0, prevHp - damage);
    if (side === "player") state.playerHp = newHp; else state.enemyHp = newHp;
    state.impactSide = side;

    if (isPlayerShot && damage > 0) {
      state.combo += 1;
      if (state.combo > state.bestCombo) state.bestCombo = state.combo;
    } else if (isPlayerShot) {
      state.combo = 0;
    }

    // Live destructible explosion + debris
    const castle = state.castles[side];
    if (damage > 0 && castle) {
      const power = (isPlayerShot && projectile.isCrit ? DESTRUCT.impactPower * DESTRUCT.critPowerMul : DESTRUCT.impactPower)
        * (damage / 33.4);  // scale with damage
      const fragments = castle.applyExplosion({ x: projectile.x, y: projectile.y }, power);
      state.debris.push(...fragments);
      const seedRng = makeRng(((state.turnIndex + 1) * 7919 + Math.floor(projectile.x)) >>> 0);
      state.explosions.push(new Explosion({ x: projectile.x, y: projectile.y }, power, seedRng));
    }

    // Floats / VFX
    if (damage === 0) {
      smoke(state.particles, projectile.x, projectile.y, 6);
      spawnFloat(state.floats, projectile.x, projectile.y - 18, "MISS", "#bcd0ff", 700);
      playSfx("ui");
    } else {
      const isCrit = isPlayerShot && projectile.isCrit;
      const tier = isPlayerShot ? comboTier(state.combo) : COMBO_TIERS[0];
      const dmgLabel = isCrit
        ? "CRIT!"
        : `-${Math.round(damage * 10) / 10}%`;
      const dmgColor = isCrit ? "#ffd24a" : tier.color;
      const burstCount = isCrit ? 56 : 28;
      const burstSpeed = isCrit ? 0.30 : 0.18;
      const shakeAmp = isCrit ? 22 : 10;
      const stopMs = isCrit ? HIT_STOP_CRIT_MS : HIT_STOP_MS;
      shake.trigger(shakeAmp);
      burst(state.particles, projectile.x, projectile.y, projectile.type.color, burstCount, burstSpeed);
      if (isCrit) burst(state.particles, projectile.x, projectile.y, "#ffd24a", 32, 0.22);
      spawnFloat(state.floats, projectile.x, projectile.y - 24, dmgLabel, dmgColor, isCrit ? 1100 : 850);
      if (isPlayerShot && state.combo >= 2) {
        spawnFloat(state.floats, projectile.x, projectile.y - 60, `x${state.combo} COMBO`, tier.color, 900);
      }
      playSfx("hit");
      playSfx("destroy");
      state.hitStopUntil = performance.now() + stopMs;
      if (isCrit) flash("#ffffff", 120);
      if (isPlayerShot) haptic(isCrit ? "crit" : "hit");
      else              haptic("hit");
    }
  }

  function advanceTurn() {
    if (state.ctaVisible) return;
    if (state.enemyHp <= 0 || state.playerHp <= 0) {
      endGame(state.enemyHp <= 0 ? "victory" : "defeat");
      return;
    }
    state.impactSide = null;
    const out = state.currentSide;
    state.teamSlot[out] = (state.teamSlot[out] + 1) % 3;
    state.currentSide = out === "player" ? "enemy" : "player";
    state.teamSlot[state.currentSide] = state.teamSlot[state.currentSide] % 3;
    state.turnIndex += 1;
    state.phase = state.currentSide === "player" ? "aiming" : "enemy_wait";
  }

  function endGame(result) {
    state.result = result;
    state.phase = "ended";
    state.ctaVisible = true;
    state.slowMoUntil = performance.now() + SLOWMO_DURATION_MS;
    const targetBox = result === "victory" ? castleBoxes.enemy : castleBoxes.player;
    const cx = targetBox.x + targetBox.w / 2;
    const cy = targetBox.y + targetBox.h * 0.6;
    burst(state.particles, cx, cy, "#ffbf31", 96, 0.32);
    smoke(state.particles, cx, cy, 36);
    if (result === "victory") {
      playSfx("win"); haptic("win");
      state.endEffect = createWinEffect({ W, H, headline: "VICTORY!", subhead: "BATTLE WON", duration: 2.0 });
      state.endStaticAt = performance.now() + 2000;
    } else {
      playSfx("lose"); haptic("lose");
      state.endEffect = createGameOverEffect({ W, H, headline: "DEFEAT", subhead: "TAP TO RETRY", duration: 1.6 });
      state.endStaticAt = performance.now() + 1600;
    }
  }

  function hitbox(side) {
    const hp = side === "player" ? state.playerHp : state.enemyHp;
    if (hp <= 0) return { x: 0, y: 0, w: 0, h: 0 };
    const c = castleBoxes[side];
    // Broad-phase AABB == the trimmed opaque rect of the castle PNG. Final
    // collision is per-pixel against Castle.renderAlpha so transparent gaps
    // and destroyed sections don't register hits.
    return { x: c.x, y: c.y, w: c.w, h: c.h };
  }

  // ── Draw ───────────────────────────────────────────────────────────────
  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    const o = shake.offset();
    ctx.save();
    ctx.translate(o.x, o.y);
    applyCamera();
    drawWorld();
    ctx.restore();

    drawTopHud();
    drawComboHud();
    if (state.phase !== "projectile" && !state.ctaVisible) drawInstruction();
    if (state.phase === "error") drawError();

    if (now < state.flashUntil && state.flashColor) {
      const remaining = (state.flashUntil - now) / 120;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(0.7, remaining * 0.7));
      ctx.fillStyle = state.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    if (state.endEffect && !state.endEffect.done) {
      state.endEffect.draw(ctx);
    } else if (state.ctaVisible) {
      drawStaticEndScreen();
    }

    syncOverlays();
  }
  function drawStaticEndScreen() {
    if (state.result === "victory") {
      drawGameWon(ctx, W, H, {
        primary: "BATTLE", secondary: "WON", cta: "PLAY NOW",
        rewards: [{ label: "+22", color: "#f5c842", kind: "trophy" },
                  { label: "180", color: "#f5c842", kind: "coin" },
                  { label: "26",  color: "#a06d3a", kind: "wood" }],
      });
    } else {
      drawGameLost(ctx, W, H, {
        primary: "BATTLE", secondary: "FAILED", cta: "TRY AGAIN",
        rewards: [{ label: "-12.40", color: "#f5c842", kind: "trophy" },
                  { label: "45",     color: "#f5c842", kind: "coin" },
                  { label: "8",      color: "#a06d3a", kind: "wood" }],
      });
    }
  }
  function applyCamera() {
    ctx.translate(W / 2, H / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);
  }
  function drawWorld() {
    drawBackground();
    drawCastleInside("player");
    drawCastleInside("enemy");
    drawUnits("player");
    drawUnits("enemy");
    drawCastleOutside("player");
    drawCastleOutside("enemy");
    drawTrajectory();
    drawProjectiles();
    drawDebrisV2();
    drawParticles(ctx, state.particles);
    drawExplosions();
    drawFloats(ctx, state.floats);
  }
  function drawBackground() {
    ctx.fillStyle = "#9fb978";
    ctx.fillRect(-80, -20, WORLD_W + 160, H + 60);
    if (images.background) drawCover(images.background, -75, 0, WORLD_W + 150, H);
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(-80, 0, WORLD_W + 160, H);
  }
  function drawCastleInside(side) {
    const castle = state.castles[side];
    const c = castleBoxes[side];
    const hp = side === "player" ? state.playerHp : state.enemyHp;
    if (hp > 0) drawShadow(c.x + 20, c.y + c.h - 35, c.w - 40, 32);
    if (!castle) return;

    const reveal = revealForSide(side);
    const inside = images.castleInside;

    if (reveal && hp > 0 && inside) {
      // The inside PNG stays UPRIGHT (no tilt). Same width as outside, anchored
      // by its top to the outside top + a tunable vertical offset.
      const t = state.tuning || { insideScale: 1, insideTopRel: 0, insideLeftRel: 0 };
      const insideW = c.w * t.insideScale;
      const insideH = insideW * (inside.naturalHeight / inside.naturalWidth);
      const insideX = c.x + (c.w - insideW) * 0.5 + c.w * (t.insideLeftRel || 0);
      const insideY = c.y + c.h * t.insideTopRel;

      // 1) Inside layer (no tilt), clipped to the reveal circle.
      ctx.save();
      ctx.beginPath();
      ctx.arc(reveal.cx, reveal.cy, reveal.r, 0, TAU);
      ctx.clip();
      ctx.drawImage(inside, insideX, insideY, insideW, insideH);
      ctx.restore();
    }
  }
  function drawCastleOutside(side) {
    const castle = state.castles[side];
    const c = castleBoxes[side];
    const hp = side === "player" ? state.playerHp : state.enemyHp;
    if (!castle) return;

    const reveal = revealForSide(side);
    const inside = images.castleInside;

    if (reveal && hp > 0 && inside) {
      // Draw the outside with the reveal circle punched out so heroes can sit
      // between the inside art and the castle facade.
      ctx.save();
      ctx.beginPath();
      ctx.rect(c.x - 40, c.y - 40, c.w + 80, c.h + 80);
      ctx.arc(reveal.cx, reveal.cy, reveal.r, 0, TAU);
      ctx.clip("evenodd");
      castle.draw(ctx);
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(reveal.cx, reveal.cy, reveal.r, 0, TAU);
      ctx.stroke();
      ctx.restore();
    } else {
      castle.draw(ctx);
    }
  }
  function drawDebrisV2() {
    for (const d of state.debris) d.draw(ctx);
  }
  function drawExplosions() {
    for (const e of state.explosions) e.draw(ctx);
  }
  function drawUnits(side) {
    const hp = side === "player" ? state.playerHp : state.enemyHp;
    if (hp <= 0) return;
    // All 3 slots are always playable (turn cycles through them); draw them all.
    const slots = unitSlots[side];
    for (let i = 0; i < slots.length; i += 1) drawPlank(slots[i].x, slots[i].y);
    for (let i = 0; i < slots.length; i += 1) drawUnit(side, i);
  }
  function drawPlank(x, y) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(x, y + 7, 28, 4.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#5a3414"; ctx.fillRect(x - 30, y, 60, 8);
    ctx.fillStyle = "#a06d3a"; ctx.fillRect(x - 30, y - 3, 60, 4);
    ctx.fillStyle = "#c4904f"; ctx.fillRect(x - 30, y - 3, 60, 1);
    ctx.strokeStyle = "#3a2008"; ctx.lineWidth = 1.2;
    ctx.strokeRect(x - 30, y - 3, 60, 11);
    ctx.restore();
  }
  function drawUnit(side, slot) {
    const pos = unitSlots[side][slot];
    const type = unitTypes[slot];
    const isActive = !state.ctaVisible && activeTurn().side === side && activeTurn().slot === slot;
    const img = images[type.unit];
    ctx.save();
    ctx.translate(pos.x, pos.y);
    if (side === "enemy") ctx.scale(-1, 1);
    if (isActive) {
      ctx.fillStyle = type.color;
      ctx.globalAlpha = 0.26;
      ctx.beginPath(); ctx.arc(0, -22, 34, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (img) drawContain(img, -25, -67, 50, 64);
    ctx.restore();
  }
  function drawTrajectory() {
    if (!state.drag) return;
    const d = state.drag;
    const pullX = Math.max(26, Math.min(135, d.startX - d.x));
    const pullY = Math.max(-85, Math.min(105, d.startY - d.y));
    let x = d.startX, y = d.startY;
    let vx = 0.24 + pullX * 0.0038;
    let vy = -0.27 + pullY * 0.0027;
    const critNext = ((state.playerShotsFired + 1) % PLAYER_CRIT_INTERVAL) === 0;
    const FILL = critNext ? "rgba(255,210,74,0.85)" : "rgba(255,255,255,0.85)";
    const STROKE = critNext ? "rgba(120,80,0,0.95)" : "rgba(28,38,56,0.92)";
    ctx.save();
    const STEP = 96;
    const COUNT = 9;
    const RADIUS = critNext ? 9.5 : 8.5;
    for (let i = 0; i < COUNT; i += 1) {
      x += vx * STEP; y += vy * STEP; vy += 0.00078 * STEP;
      const alpha = Math.max(0.22, 1 - i * 0.10);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = STROKE;
      ctx.beginPath(); ctx.arc(x, y, RADIUS + 1.5, 0, TAU); ctx.fill();
      ctx.fillStyle = FILL;
      ctx.beginPath(); ctx.arc(x, y, RADIUS, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath(); ctx.arc(x - RADIUS * 0.32, y - RADIUS * 0.32, RADIUS * 0.45, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  function drawProjectiles() {
    for (const p of state.projectiles) {
      const img = images[p.type.projectile];
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rotation);
      ctx.shadowColor = p.isCrit ? "#ffd24a" : p.type.color;
      ctx.shadowBlur = p.isCrit ? 28 : 16;
      if (img) drawContain(img, -18, -18, 36, 36);
      ctx.restore();
    }
  }
  function drawTopHud() {
    const Wt = 360;
    const playerHpPct = Math.round(state.playerHp);
    const enemyHpPct  = Math.round(state.enemyHp);
    const playerColor = "#08aeea";
    const enemyColor  = "#e80e16";
    ctx.save();
    drawHudTrapezoid(8,   8, 132, 28, playerColor, true);
    drawHudTrapezoid(220, 8, 132, 28, enemyColor,  false);
    ctx.font = "900 53px Arial";
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#111";
    ctx.strokeText("Vs", Wt / 2, 55);
    ctx.fillStyle = "#fff";
    ctx.fillText("Vs", Wt / 2, 52);
    const iconW = 84, iconH = 84, iconY = 48;
    const leftIconX = 10, rightIconX = Wt - 10 - iconW;
    const tiltBlue = -11 * Math.PI / 180;
    const tiltRed  =  -9 * Math.PI / 180;
    drawHudIcon(images.iconCastleBlue, leftIconX  + iconW / 2, iconY + iconH / 2, iconW, iconH, tiltBlue);
    drawHudIcon(images.iconCastleRed,  rightIconX + iconW / 2, iconY + iconH / 2, iconW, iconH, tiltRed);
    drawHudPct(playerHpPct + "%", leftIconX  + iconW / 2, iconY + iconH + 22, 26);
    drawHudPct(enemyHpPct  + "%", rightIconX + iconW / 2, iconY + iconH + 22, 26);
    ctx.restore();
  }
  function drawHudTrapezoid(x, y, w, h, color, leftFacing) {
    ctx.save();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.moveTo(x - 1, y - 1);
    ctx.lineTo(x + w + 1, y - 1);
    ctx.lineTo(x + w - (leftFacing ? 5 : 0), y + h + 5);
    ctx.lineTo(x + (leftFacing ? 0 : 5), y + h + 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w - (leftFacing ? 8 : 0), y + h);
    ctx.lineTo(x + (leftFacing ? 0 : 8), y + h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function drawHudIcon(img, cx, cy, w, h, angleRad) {
    if (!img) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angleRad);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  function drawHudPct(text, x, y, size) {
    ctx.save();
    ctx.font = "900 " + size + "px 'Lilita One', 'Arial Black', Arial";
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(4, size * 0.22);
    ctx.strokeStyle = "#111";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  function drawComboHud() {
    if (state.combo < 2 || state.ctaVisible) return;
    const tier = comboTier(state.combo);
    const text = `x${state.combo} COMBO`;
    const fontSize = 22 * tier.scale;
    ctx.save();
    ctx.font = `900 ${fontSize}px 'Lilita One', Arial`;
    ctx.textAlign = "center"; ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(4, fontSize * 0.18);
    ctx.strokeStyle = "#111"; ctx.strokeText(text, W / 2, 110);
    ctx.fillStyle = tier.color; ctx.fillText(text, W / 2, 110);
    ctx.restore();
  }
  function drawInstruction() {
    // Player "PULL BACK TO SHOOT" is rendered by the DOM #pull-hint overlay
    // (centered, big Lilita One pulse). On enemy turn we still draw a small
    // "ENEMY AIMING" caption near the canvas top so the player knows to wait.
    if (activeTurn().side === "player") return;
    ctx.save();
    ctx.font = "900 16px Arial";
    ctx.textAlign = "center"; ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, 16 * 0.18);
    ctx.strokeStyle = "#111"; ctx.strokeText("ENEMY AIMING", 180, 102);
    ctx.fillStyle = "#fff"; ctx.fillText("ENEMY AIMING", 180, 102);
    ctx.restore();
  }
  function drawError() {
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.font = "900 18px Arial";
    ctx.textAlign = "center"; ctx.lineJoin = "round";
    ctx.lineWidth = 4; ctx.strokeStyle = "#111";
    ctx.strokeText("ASSET LOAD ERROR", 180, 320);
    ctx.fillStyle = "#fff"; ctx.fillText("ASSET LOAD ERROR", 180, 320);
    ctx.restore();
  }
  function drawShadow(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawCover(image, x, y, w, h) {
    const scale = Math.max(w / image.width, h / image.height);
    const sw = w / scale, sh = h / scale;
    const sx = (image.width - sw) / 2, sy = (image.height - sh) / 2;
    ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
  }
  function drawContain(image, x, y, w, h) {
    const scale = Math.min(w / image.width, h / image.height);
    const dw = image.width * scale, dh = image.height * scale;
    ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function loop(now) {
    const dt = state.lastTime ? Math.min(34, now - state.lastTime) : 16;
    state.lastTime = now;
    update(dt, now);
    draw(now);
    requestAnimationFrame(loop);
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  boot();
})();
