(function () {
  "use strict";

  const W = 360;
  const H = 640;
  const WORLD_W = 740;
  const STORE_URL = "https://play.google.com/store/apps/details?id=com.epicoro.castleclashers";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const state = {
    phase: "loading",
    turnIndex: 0,
    playerHp: 3,
    enemyHp: 3,
    timer: 0,
    inputs: 0,
    drag: null,
    activeProjectile: null,
    projectiles: [],
    particles: [],
    floats: [],
    debris: [],
    dyingSections: [],
    ctaVisible: false,
    result: null,
    enemyQueuedAt: 0,
    lastTime: 0,
    snapshot: {},
    impactSide: null,
    revealRadius: 0,
    currentSide: "player",
    teamSlot: { player: 0, enemy: 0 }
  };

  // Utilities from the bank.
  const shake = createShake(0.045);
  const SECTION_POLYS = makeSectionPolys(3);

  const camera = { x: WORLD_W / 2, y: 330, zoom: 0.72 };

  // Each team has its own cursor through [0, 1, 2]. Sides alternate strictly:
  // a dead slot on one team advances only that team's cursor, never burns a
  // turn on the opposite team.

  const unitTypes = [
    { unit: "unitPoison", projectile: "projPoison", color: "#73f03f", damageText: "-44", label: "POISON" },
    { unit: "unitFire", projectile: "projFire", color: "#ff8a27", damageText: "-72", label: "FIRE" },
    { unit: "unitMissile", projectile: "projMissile", color: "#ff4141", damageText: "-100", label: "ROCKET" }
  ];

  const castles = {
    player: { x: 34, y: 124, w: 235, h: 386, color: "#11aef0" },
    enemy: { x: 472, y: 124, w: 235, h: 386, color: "#ed2024" }
  };

  const unitSlots = {
    player: [
      { x: 131, y: 271 },
      { x: 187, y: 376 },
      { x: 102, y: 455 }
    ],
    enemy: [
      { x: 601, y: 271 },
      { x: 545, y: 376 },
      { x: 630, y: 455 }
    ]
  };

  const images = {};

  window.__engineState = {
    get phase() { return state.phase; },
    get turnIndex() { return state.turnIndex; },
    get playerHp() { return state.playerHp; },
    get enemyHp() { return state.enemyHp; },
    get projectiles() { return state.projectiles.length; },
    get inputs() { return state.inputs; },
    get ctaVisible() { return state.ctaVisible; },
    snapshot: function () { return makeSnapshot(); }
  };

  function makeSnapshot() {
    state.snapshot = {
      phase: state.phase,
      turnIndex: state.turnIndex,
      playerHp: state.playerHp,
      enemyHp: state.enemyHp,
      projectiles: state.projectiles.length,
      inputs: state.inputs,
      ctaVisible: state.ctaVisible,
      result: state.result,
      camera: { x: Math.round(camera.x), zoom: Number(camera.zoom.toFixed(2)) }
    };
    return state.snapshot;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  async function getManifest() {
    if (window.CC_ASSETS) return window.CC_ASSETS;
    const response = await fetch(window.CC_ASSET_MANIFEST_URL || "./assets.json");
    return response.json();
  }

  async function boot() {
    try {
      const manifest = await getManifest();
      await Promise.all(
        Object.entries(manifest).map(async ([key, src]) => {
          images[key] = await loadImage(src);
        })
      );
      // Wait for the display font; fall back gracefully if it fails.
      try { if (document.fonts) await document.fonts.load("32px 'Lilita One'"); } catch (e) {}
      state.phase = "aiming";
      requestAnimationFrame(loop);
    } catch (error) {
      console.error(error);
      state.phase = "error";
      requestAnimationFrame(loop);
    }
  }

  function activeTurn() {
    return { side: state.currentSide, slot: state.teamSlot[state.currentSide] };
  }

  function activeSlot() {
    const turn = activeTurn();
    return unitSlots[turn.side][turn.slot];
  }

  function getCanvasViewport() {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / W, rect.height / H);
    const width = W * scale;
    const height = H * scale;
    return {
      left: rect.left + (rect.width - width) / 2,
      top: rect.top + (rect.height - height) / 2,
      width,
      height
    };
  }

  function pointerToWorld(event) {
    const viewport = getCanvasViewport();
    const sx = ((event.clientX - viewport.left) / viewport.width) * W;
    const sy = ((event.clientY - viewport.top) / viewport.height) * H;
    return {
      x: (sx - W / 2) / camera.zoom + camera.x,
      y: (sy - H / 2) / camera.zoom + camera.y,
      sx,
      sy
    };
  }

  function onPointerDown(event) {
    // Unlock audio on first user interaction (browser autoplay rules)
    startMusic();
    if (state.ctaVisible) {
      const r = canvas.getBoundingClientRect();
      const sx = ((event.clientX - r.left) / r.width) * W;
      const sy = ((event.clientY - r.top) / r.height) * H;
      const fn = state.result === "victory" ? drawGameWon : drawGameLost;
      if (isPointInCta(fn.lastCtaBounds, sx, sy)) {
        playSfx("ui");
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
  }

  function onPointerMove(event) {
    if (!state.drag) return;
    const pos = pointerToWorld(event);
    state.drag.x = pos.x;
    state.drag.y = pos.y;
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
    const aimX = target.x + target.w * (0.42 + Math.sin(state.timer * 2.1 + turn.slot) * 0.16);
    const aimY = target.y + target.h * (0.44 + Math.cos(state.timer * 1.7 + turn.slot) * 0.14);
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
    const projectile = {
      side,
      slot,
      type,
      x: from.x,
      y: from.y - 20,
      vx,
      vy,
      gravity: 0.00078,
      age: 0,
      rotation: side === "player" ? 0 : Math.PI
    };
    state.phase = "projectile";
    state.activeProjectile = projectile;
    state.projectiles.push(projectile);
    recoil(side, slot);
  }

  function recoil(side, slot) {
    const p = unitSlots[side][slot];
    burst(state.particles, p.x, p.y - 8, "rgba(255,255,255,0.7)", 8, 0.06);
    smoke(state.particles, p.x, p.y - 4, 5);
    playSfx("shoot");
  }

  function update(dt, now) {
    if (state.phase !== "loading" && state.phase !== "error" && !state.ctaVisible) {
      state.timer += dt / 1000;
    }

    updateCamera(dt);
    queueEnemy(now);

    for (let i = state.projectiles.length - 1; i >= 0; i -= 1) {
      const p = state.projectiles[i];
      p.age += dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation = Math.atan2(p.vy, p.vx);

      // Trail behind projectile (uses util)
      spawnTrail(state.particles, p.x - Math.sign(p.vx) * 6, p.y, p.type.color, 1, 5);

      const targetSide = p.side === "player" ? "enemy" : "player";
      const box = hitbox(targetSide);
      const didHit = p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;

      if (didHit) {
        applyHit(targetSide, p);
        state.projectiles.splice(i, 1);
        state.activeProjectile = null;
        window.setTimeout(advanceTurn, 360);
      } else if (p.x < -80 || p.x > WORLD_W + 80 || p.y > 690 || p.age > 2900) {
        // Smoke puff at projectile death (off-screen / timed-out)
        if (p.y < 690) smoke(state.particles, p.x, Math.min(p.y, 685), 8);
        state.projectiles.splice(i, 1);
        state.activeProjectile = null;
        window.setTimeout(advanceTurn, 260);
      }
    }

    updateParticles(state.particles, dt);
    updateDebris(state.debris, dt);
    updateFloats(state.floats, dt);
    updateDyingSections(state.dyingSections, dt);
    shake.update(dt);
    updateReveal(dt);

    makeSnapshot();
  }

  function updateReveal(dt) {
    const revealActive =
      !state.ctaVisible &&
      (state.phase === "aiming" || state.phase === "enemy_wait");
    const target = revealActive ? 177 : 0;
    const t = Math.min(1, dt / 280);
    state.revealRadius += (target - state.revealRadius) * t;
  }

  function updateCamera(dt) {
    let targetX = 170;
    let targetZoom = 1.34;
    if (state.phase === "projectile" && state.activeProjectile) {
      targetX = state.activeProjectile.x;
      targetZoom = 0.82;
    } else if (state.phase === "projectile" && state.impactSide) {
      // Post-impact window: focus the camera on the side that was just hit
      // so the flow reads ally → projectile → enemy without snapping back.
      targetX = state.impactSide === "player" ? 165 : 570;
      targetZoom = 1.2;
    } else if (state.ctaVisible) {
      targetX = state.result === "victory" ? 590 : 150;
      targetZoom = 0.92;
    } else if (state.phase === "enemy_wait") {
      targetX = 570;
      targetZoom = 1.34;
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

  function applyHit(side, projectile) {
    const prevHp = side === "player" ? state.playerHp : state.enemyHp;
    if (side === "player") state.playerHp = Math.max(0, state.playerHp - 1);
    else state.enemyHp = Math.max(0, state.enemyHp - 1);
    state.impactSide = side;

    const sectionIndex = prevHp - 1;
    const c = castles[side];
    const poly = SECTION_POLYS[sectionIndex];
    const cx = c.x + poly.reduce((s, p) => s + p[0], 0) / poly.length * c.w;
    const cy = c.y + poly.reduce((s, p) => s + p[1], 0) / poly.length * c.h;

    state.dyingSections.push(makeDyingSection(sectionIndex, side === "player" ? "left" : "right", 520));
    smoke(state.particles, cx, cy, 22);

    shake.trigger(10);
    burst(state.particles, projectile.x, projectile.y, projectile.type.color, 28, 0.18);
    spawnDebris(state.debris, projectile.x, projectile.y, side === "player" ? "left" : "right", 16);
    spawnFloat(state.floats, projectile.x, projectile.y - 24, projectile.type.damageText, "#ffffff", 850);
    playSfx("hit");
    playSfx("destroy");
  }

  function advanceTurn() {
    if (state.ctaVisible) return;
    if (state.enemyHp <= 0 || state.playerHp <= 0) {
      endGame(state.enemyHp <= 0 ? "victory" : "defeat");
      return;
    }
    state.impactSide = null;

    // Move the outgoing team's cursor one step so its next turn starts on a
    // fresh slot, then flip sides — exactly one step, every time.
    const out = state.currentSide;
    state.teamSlot[out] = (state.teamSlot[out] + 1) % 3;
    state.currentSide = out === "player" ? "enemy" : "player";

    // On the new side, advance only this team's cursor past dead slots.
    const inHp = state.currentSide === "player" ? state.playerHp : state.enemyHp;
    for (let i = 0; i < 3; i += 1) {
      if (inHp >= 3 - state.teamSlot[state.currentSide]) break;
      state.teamSlot[state.currentSide] =
        (state.teamSlot[state.currentSide] + 1) % 3;
    }

    state.turnIndex += 1;
    state.phase = state.currentSide === "player" ? "aiming" : "enemy_wait";
  }

  function endGame(result) {
    state.result = result;
    state.phase = "ended";
    state.ctaVisible = true;
    const target = result === "victory" ? castles.enemy : castles.player;
    burst(state.particles, target.x + target.w / 2, target.y + target.h * 0.58, "#ffbf31", 64, 0.28);
    smoke(state.particles, target.x + target.w / 2, target.y + target.h * 0.6, 30);
    playSfx(result === "victory" ? "win" : "lose");
  }

  function hitbox(side) {
    const hp = side === "player" ? state.playerHp : state.enemyHp;
    const c = castles[side];
    if (hp <= 0) return { x: 0, y: 0, w: 0, h: 0 };
    // With section-based destruction, the castle shrinks vertically (top sections
    // fall first). Hitbox covers full castle width and the visible vertical band.
    const visibleH = c.h * (hp / 3);
    return {
      x: c.x + 12,
      y: c.y + (c.h - visibleH) + 24,
      w: c.w - 24,
      h: Math.max(30, visibleH - 48)
    };
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const o = shake.offset();

    ctx.save();
    ctx.translate(o.x, o.y);
    applyCamera();
    drawWorld();
    ctx.restore();

    drawTopHud();
    if (state.phase !== "projectile" && !state.ctaVisible) drawInstruction();

    if (state.phase === "error") drawError();

    // End screens via the bank — no more endOverlay image, no overlap.
    if (state.ctaVisible) {
      const playerPct = (state.playerHp / 3) * 100;
      const enemyPct = (state.enemyHp / 3) * 100;
      if (state.result === "victory") {
        drawGameWon(ctx, W, H, {
          primary: "BATTLE",
          secondary: "WON",
          cta: "PLAY NOW",
          rewards: [
            { label: "+22", color: "#f5c842", kind: "trophy" },
            { label: "180", color: "#f5c842", kind: "coin" },
            { label: "26", color: "#a06d3a", kind: "wood" }
          ]
        });
      } else {
        drawGameLost(ctx, W, H, {
          primary: "BATTLE",
          secondary: "FAILED",
          cta: "TRY AGAIN",
          rewards: [
            { label: "-12.40", color: "#f5c842", kind: "trophy" },
            { label: "45", color: "#f5c842", kind: "coin" },
            { label: "8", color: "#a06d3a", kind: "wood" }
          ]
        });
      }
    }
  }

  function applyCamera() {
    ctx.translate(W / 2, H / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);
  }

  function drawWorld() {
    drawBackground();
    drawCastle("player");
    drawCastle("enemy");
    drawUnits("player");
    drawUnits("enemy");
    drawTrajectory();
    drawProjectiles();
    drawDebris(ctx, state.debris);
    drawParticles(ctx, state.particles);
    drawFloats(ctx, state.floats);
  }

  function drawBackground() {
    ctx.fillStyle = "#9fb978";
    ctx.fillRect(-80, -20, WORLD_W + 160, H + 60);
    if (images.background) drawCover(images.background, -75, 0, WORLD_W + 150, H);
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(-80, 0, WORLD_W + 160, H);
  }

  function drawCastle(side) {
    const c = castles[side];
    const hp = side === "player" ? state.playerHp : state.enemyHp;
    const img = side === "player" ? images.castlePlayer : images.castleEnemy;

    ctx.save();
    if (hp > 0) drawShadow(c.x + 20, c.y + c.h - 35, c.w - 40, 32);

    const reveal = revealForSide(side);

    if (reveal && hp > 0) {
      // Behind layer: a darkened duplicate of the same castle PNG, drawn
      // in place. Becomes visible only through the cut-out in the front layer.
      ctx.save();
      ctx.filter =
        "brightness(0.34) sepia(0.85) saturate(1.5) hue-rotate(-10deg)";
      for (let i = 0; i < hp; i += 1) drawSection(ctx, img, c, SECTION_POLYS[i]);
      ctx.filter = "none";
      ctx.restore();

      // Front layer: same PNG, with an even-odd clip so the circle is a
      // real hole — no overlay disc, the darkened layer shows through.
      ctx.save();
      ctx.beginPath();
      ctx.rect(c.x - 40, c.y - 40, c.w + 80, c.h + 80);
      ctx.arc(reveal.cx, reveal.cy, reveal.r, 0, Math.PI * 2);
      ctx.clip("evenodd");
      for (let i = 0; i < hp; i += 1) drawSection(ctx, img, c, SECTION_POLYS[i]);
      for (const d of state.dyingSections) {
        if (d.side === side) drawDyingSection(ctx, img, c, d, SECTION_POLYS);
      }
      ctx.restore();
    } else {
      for (let i = 0; i < hp; i += 1) drawSection(ctx, img, c, SECTION_POLYS[i]);
      for (const d of state.dyingSections) {
        if (d.side === side) drawDyingSection(ctx, img, c, d, SECTION_POLYS);
      }
    }

    ctx.restore();
  }

  function revealForSide(side) {
    if (state.revealRadius < 1 || state.ctaVisible) return null;
    if (state.phase !== "aiming" && state.phase !== "enemy_wait") return null;
    const turn = activeTurn();
    if (turn.side !== side) return null;
    const slot = unitSlots[side][turn.slot];
    return { cx: slot.x, cy: slot.y - 30, r: state.revealRadius };
  }

  function drawUnits(side) {
    const castleHp = side === "player" ? state.playerHp : state.enemyHp;
    // Unit at slot i corresponds to section (2-i): slot 0 = top section,
    // slot 2 = bottom section. Top falls first, bottom survives longest.
    for (let i = 0; i < 3; i += 1) {
      if (castleHp < 3 - i) continue;
      const pos = unitSlots[side][i];
      drawPlank(pos.x, pos.y);
    }
    for (let i = 0; i < 3; i += 1) {
      if (castleHp < 3 - i) continue;
      drawUnit(side, i);
    }
  }

  function drawPlank(x, y) {
    ctx.save();
    // Ground shadow under the plank.
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(x, y + 7, 28, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Plank front face.
    ctx.fillStyle = "#5a3414";
    ctx.fillRect(x - 30, y, 60, 8);
    // Top surface (lit).
    ctx.fillStyle = "#a06d3a";
    ctx.fillRect(x - 30, y - 3, 60, 4);
    // Highlight strip.
    ctx.fillStyle = "#c4904f";
    ctx.fillRect(x - 30, y - 3, 60, 1);
    // Wood grain.
    ctx.strokeStyle = "rgba(50, 26, 8, 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 26, y);
    ctx.lineTo(x + 26, y);
    ctx.moveTo(x - 20, y + 4);
    ctx.lineTo(x + 20, y + 4);
    ctx.stroke();
    // Plank divisions.
    ctx.strokeStyle = "rgba(28, 14, 4, 0.65)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 10, y - 3);
    ctx.lineTo(x - 10, y + 8);
    ctx.moveTo(x + 10, y - 3);
    ctx.lineTo(x + 10, y + 8);
    ctx.stroke();
    // Outline.
    ctx.strokeStyle = "#3a2008";
    ctx.lineWidth = 1.2;
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
      ctx.beginPath();
      ctx.arc(0, -22, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (img) drawContain(img, -25, -67, 50, 64);
    ctx.rotate(side === "player" ? 0 : Math.PI);
    // Per-unit HP bar — fills from left, colored by unit type.
    ctx.fillStyle = "#25282f";
    roundRect(0, -35, 36, 14, 7);
    ctx.fill();
    ctx.fillStyle = type.color;
    roundRect(3, -32, 30, 8, 4);
    ctx.fill();
    ctx.restore();
  }

  function drawTrajectory() {
    if (!state.drag) return;
    const d = state.drag;
    const pullX = Math.max(26, Math.min(135, d.startX - d.x));
    const pullY = Math.max(-85, Math.min(105, d.startY - d.y));
    let x = d.startX;
    let y = d.startY;
    let vx = 0.24 + pullX * 0.0038;
    let vy = -0.27 + pullY * 0.0027;

    ctx.save();
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 20; i += 1) {
      x += vx * 78;
      y += vy * 78;
      vy += 0.00078 * 78;
      ctx.globalAlpha = Math.max(0.15, 0.95 - i * 0.04);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.62)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(d.startX, d.startY);
    ctx.lineTo(d.x, d.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawProjectiles() {
    for (const p of state.projectiles) {
      const img = images[p.type.projectile];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.shadowColor = p.type.color;
      ctx.shadowBlur = 16;
      if (img) drawContain(img, -18, -18, 36, 36);
      ctx.restore();
    }
  }

  // ── Top HUD via the bank's vs-bar-top ──
  function drawTopHud() {
    const playerPct = Math.max(0, Math.round((state.playerHp / 3) * 100));
    const enemyPct = Math.max(0, Math.round((state.enemyHp / 3) * 100));
    drawVsBarTop(ctx, {
      playerHpPct: playerPct,
      enemyHpPct: enemyPct,
      playerColor: "#08aeea",
      enemyColor: "#e80e16"
    });
  }

  function drawInstruction() {
    const text = activeTurn().side === "player" ? "PULL BACK TO SHOOT" : "ENEMY AIMING";
    ctx.save();
    ctx.font = "900 18px Arial";
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(4, 18 * 0.18);
    ctx.strokeStyle = "#111111";
    ctx.strokeText(text, 180, 594);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, 180, 594);
    ctx.restore();
  }

  function drawError() {
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.font = "900 18px Arial";
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#111";
    ctx.strokeText("ASSET LOAD ERROR", 180, 320);
    ctx.fillStyle = "#fff";
    ctx.fillText("ASSET LOAD ERROR", 180, 320);
    ctx.restore();
  }

  function drawShadow(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCover(image, x, y, w, h) {
    const scale = Math.max(w / image.width, h / image.height);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (image.width - sw) / 2;
    const sy = (image.height - sh) / 2;
    ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
  }

  function drawContain(image, x, y, w, h) {
    const scale = Math.min(w / image.width, h / image.height);
    const dw = image.width * scale;
    const dh = image.height * scale;
    ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function loop(now) {
    const dt = state.lastTime ? Math.min(34, now - state.lastTime) : 16;
    state.lastTime = now;
    update(dt, now);
    draw();
    requestAnimationFrame(loop);
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  boot();
})();
