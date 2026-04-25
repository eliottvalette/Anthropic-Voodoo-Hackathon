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
    shake: 0,
    enemyQueuedAt: 0,
    lastTime: 0,
    snapshot: {}
  };

  const camera = { x: WORLD_W / 2, y: 330, zoom: 0.72 };

  const turnOrder = [
    { side: "player", slot: 0 },
    { side: "enemy", slot: 0 },
    { side: "player", slot: 1 },
    { side: "enemy", slot: 1 },
    { side: "player", slot: 2 },
    { side: "enemy", slot: 2 }
  ];

  const unitTypes = [
    { unit: "unitPoison", projectile: "projPoison", color: "#73f03f", damageText: "-44", label: "POISON" },
    { unit: "unitFire", projectile: "projFire", color: "#ff8a27", damageText: "-72", label: "FIRE" },
    { unit: "unitMissile", projectile: "projMissile", color: "#ff4141", damageText: "-100", label: "ROCKET" }
  ];

  const castles = {
    player: { x: 34, y: 124, w: 235, h: 386, flip: false, color: "#11aef0" },
    enemy: { x: 472, y: 124, w: 235, h: 386, flip: false, color: "#ed2024" }
  };

  const unitSlots = {
    player: [
      { x: 131, y: 271, angle: -0.04 },
      { x: 187, y: 376, angle: 0.04 },
      { x: 102, y: 455, angle: -0.02 }
    ],
    enemy: [
      { x: 601, y: 271, angle: Math.PI + 0.04 },
      { x: 545, y: 376, angle: Math.PI - 0.04 },
      { x: 630, y: 455, angle: Math.PI + 0.02 }
    ]
  };

  // Castle split into 3 polygon sections (normalized 0-1 relative to castle rect).
  // Index 0 = bottom (survives longest), 2 = top (falls first).
  // Jagged seam lines simulate cracks rather than clean horizontal cuts.
  const SECTION_POLYS = [
    [ [0,0.66], [0.15,0.64], [0.38,0.68], [0.62,0.63], [0.84,0.67], [1,0.65], [1,1], [0,1] ],
    [ [0,0.31], [0.20,0.33], [0.44,0.28], [0.66,0.32], [0.88,0.30], [1,0.31],
      [1,0.65], [0.84,0.67], [0.62,0.63], [0.38,0.68], [0.15,0.64], [0,0.66] ],
    [ [0,0], [1,0], [1,0.31], [0.88,0.30], [0.66,0.32], [0.44,0.28], [0.20,0.33], [0,0.31] ],
  ];

  const images = {};

  window.__engineState = {
    get phase() {
      return state.phase;
    },
    get turnIndex() {
      return state.turnIndex;
    },
    get playerHp() {
      return state.playerHp;
    },
    get enemyHp() {
      return state.enemyHp;
    },
    get projectiles() {
      return state.projectiles.length;
    },
    get inputs() {
      return state.inputs;
    },
    get ctaVisible() {
      return state.ctaVisible;
    },
    snapshot: function () {
      return makeSnapshot();
    }
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
      state.phase = "aiming";
      requestAnimationFrame(loop);
    } catch (error) {
      console.error(error);
      state.phase = "error";
      requestAnimationFrame(loop);
    }
  }

  function activeTurn() {
    return turnOrder[state.turnIndex % turnOrder.length];
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
    if (state.ctaVisible) {
      openStore();
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

  function onPointerUp(event) {
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
    burst(p.x, p.y - 8, "rgba(255,255,255,0.7)", 8, 0.06);
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

      if (p.age % 45 < dt) {
        burst(p.x - Math.sign(p.vx) * 12, p.y, p.type.color, 2, 0.025);
      }

      const targetSide = p.side === "player" ? "enemy" : "player";
      const box = hitbox(targetSide);
      const didHit = p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;

      if (didHit) {
        applyHit(targetSide, p);
        state.projectiles.splice(i, 1);
        state.activeProjectile = null;
        window.setTimeout(advanceTurn, 360);
      } else if (p.x < -80 || p.x > WORLD_W + 80 || p.y > 690 || p.age > 2900) {
        state.projectiles.splice(i, 1);
        state.activeProjectile = null;
        window.setTimeout(advanceTurn, 260);
      }
    }

    updateParticles(dt);
    for (let i = state.dyingSections.length - 1; i >= 0; i--) {
      state.dyingSections[i].age += dt;
      if (state.dyingSections[i].age >= state.dyingSections[i].maxAge) {
        state.dyingSections.splice(i, 1);
      }
    }
    state.shake = Math.max(0, state.shake - dt * 0.045);
    makeSnapshot();
  }

  function updateCamera(dt) {
    let targetX = 170;
    let targetZoom = 1.34;
    if (state.phase === "enemy_wait") {
      targetX = 570;
      targetZoom = 1.34;
    } else if (state.phase === "projectile" && state.activeProjectile) {
      targetX = state.activeProjectile.x;
      targetZoom = 0.82;
    } else if (state.ctaVisible) {
      targetX = state.result === "victory" ? 590 : 150;
      targetZoom = 0.92;
    } else if (state.phase === "aiming" && activeTurn().side === "player") {
      targetX = 165;
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

    const sectionIndex = prevHp - 1;
    const c = castles[side];
    const poly = SECTION_POLYS[sectionIndex];
    const cx = c.x + poly.reduce((s, p) => s + p[0], 0) / poly.length * c.w;
    const cy = c.y + poly.reduce((s, p) => s + p[1], 0) / poly.length * c.h;

    state.dyingSections.push({
      side,
      sectionIndex,
      age: 0,
      maxAge: 520,
      vx: side === "player" ? -0.045 : 0.045,
    });
    smoke(cx, cy, 18);

    state.shake = 10;
    burst(projectile.x, projectile.y, projectile.type.color, 28, 0.18);
    makeDebris(projectile.x, projectile.y, side, 16);
    state.floats.push({
      x: projectile.x,
      y: projectile.y - 24,
      text: projectile.type.damageText,
      color: "#ffffff",
      life: 850
    });
  }

  function advanceTurn() {
    if (state.ctaVisible) return;
    if (state.enemyHp <= 0 || state.playerHp <= 0) {
      endGame(state.enemyHp <= 0 ? "victory" : "defeat");
      return;
    }
    state.turnIndex = (state.turnIndex + 1) % turnOrder.length;
    state.phase = activeTurn().side === "player" ? "aiming" : "enemy_wait";
  }

  function endGame(result) {
    state.result = result;
    state.phase = "ended";
    state.ctaVisible = true;
    const target = result === "victory" ? castles.enemy : castles.player;
    burst(target.x + target.w / 2, target.y + target.h * 0.58, "#ffbf31", 64, 0.28);
  }

  function hitbox(side) {
    const hp = side === "player" ? state.playerHp : state.enemyHp;
    const c = castles[side];
    const ratio = Math.max(0, hp / 3);
    const visibleW = c.w * ratio;
    if (side === "player") {
      return { x: c.x + 28, y: c.y + 80, w: Math.max(0, visibleW - 44), h: c.h - 125 };
    }
    return { x: c.x + c.w - visibleW + 18, y: c.y + 80, w: Math.max(0, visibleW - 44), h: c.h - 125 };
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.00055 * dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.debris.length - 1; i >= 0; i -= 1) {
      const d = state.debris[i];
      d.life -= dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 0.00075 * dt;
      d.r += d.spin * dt;
      if (d.life <= 0) state.debris.splice(i, 1);
    }
    for (let i = state.floats.length - 1; i >= 0; i -= 1) {
      const f = state.floats[i];
      f.life -= dt;
      f.y -= dt * 0.05;
      if (f.life <= 0) state.floats.splice(i, 1);
    }
  }

  function burst(x, y, color, count, power) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.03 + Math.random() * power);
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.05,
        radius: 2 + Math.random() * 5,
        color,
        life: 360 + Math.random() * 600
      });
    }
  }

  function smoke(x, y, count) {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const speed = 0.02 + Math.random() * 0.055;
      const g = 145 + Math.floor(Math.random() * 85);
      state.particles.push({
        x: x + (Math.random() - 0.5) * 55,
        y: y + (Math.random() - 0.5) * 30,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 11 + Math.random() * 19,
        color: "rgb(" + g + "," + g + "," + g + ")",
        life: 750 + Math.random() * 700,
      });
    }
  }

  function makeDebris(x, y, side, count) {
    const dir = side === "player" ? 1 : -1;
    for (let i = 0; i < count; i += 1) {
      state.debris.push({
        x,
        y,
        vx: dir * (0.04 + Math.random() * 0.13),
        vy: -0.15 + Math.random() * 0.18,
        size: 5 + Math.random() * 10,
        r: Math.random() * 6,
        spin: -0.006 + Math.random() * 0.012,
        life: 750 + Math.random() * 550
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const shakeX = (Math.random() - 0.5) * state.shake;
    const shakeY = (Math.random() - 0.5) * state.shake;

    ctx.save();
    ctx.translate(shakeX, shakeY);
    applyCamera();
    drawWorld();
    ctx.restore();

    drawFixedUi();
    if (state.phase === "error") drawError();
    if (state.ctaVisible) drawEndCard();
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
    drawDebris();
    drawParticles();
    drawFloats();
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
    for (let i = 0; i < hp; i++) drawCastleSection(img, c, i);
    for (const d of state.dyingSections) {
      if (d.side === side) drawDyingSection(img, c, d);
    }
    ctx.restore();
  }

  function drawCastleSection(img, c, idx) {
    if (!img) return;
    const poly = SECTION_POLYS[idx];
    ctx.save();
    ctx.beginPath();
    poly.forEach(([nx, ny], i) => {
      const px = c.x + nx * c.w;
      const py = c.y + ny * c.h;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.clip();
    drawContain(img, c.x, c.y, c.w, c.h);
    ctx.restore();
  }

  function drawDyingSection(img, c, d) {
    if (!img) return;
    const t = d.age / d.maxAge;
    const fallY = 0.5 * 0.0010 * d.age * d.age;
    const driftX = d.vx * d.age;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t * t);
    ctx.translate(driftX, fallY);
    const poly = SECTION_POLYS[d.sectionIndex];
    ctx.beginPath();
    poly.forEach(([nx, ny], i) => {
      const px = c.x + nx * c.w;
      const py = c.y + ny * c.h;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.clip();
    drawContain(img, c.x, c.y, c.w, c.h);
    ctx.restore();
  }

  function drawUnits(side) {
    for (let i = 0; i < 3; i += 1) {
      drawUnit(side, i);
    }
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
    if (img) {
      ctx.shadowColor = "rgba(0,0,0,0.32)";
      ctx.shadowBlur = 10;
      drawContain(img, -30, -82, 60, 74);
      ctx.shadowBlur = 0;
    }
    ctx.rotate(side === "player" ? 0 : Math.PI);
    ctx.fillStyle = "#25282f";
    roundRect(0, -35, 36, 14, 7);
    ctx.fill();
    ctx.fillStyle = type.color;
    roundRect(6, -32, 24, 8, 4);
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

  function drawParticles() {
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 550));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawDebris() {
    ctx.fillStyle = "#7b7770";
    ctx.strokeStyle = "#34312d";
    ctx.lineWidth = 1.5;
    for (const d of state.debris) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.r);
      ctx.globalAlpha = Math.max(0, Math.min(1, d.life / 650));
      ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size * 0.65);
      ctx.strokeRect(-d.size / 2, -d.size / 2, d.size, d.size * 0.65);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    ctx.textAlign = "center";
    ctx.font = "900 26px Arial";
    for (const f of state.floats) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 650));
      ctx.lineWidth = 7;
      ctx.strokeStyle = "#111111";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawFixedUi() {
    const playerPct = Math.max(0, Math.round((state.playerHp / 3) * 100));
    const enemyPct = Math.max(0, Math.round((state.enemyHp / 3) * 100));
    const playerBarCenterX = 8 + 132 / 2;
    const enemyBarCenterX = 220 + 132 / 2;
    ctx.save();
    drawTrapezoid(8, 8, 132, 28, "#08aeea", true);
    drawTrapezoid(220, 8, 132, 28, "#e80e16", false);
    drawOutlinedText(playerPct + "%", playerBarCenterX, 31, 20, "center");
    drawOutlinedText(enemyPct + "%", enemyBarCenterX, 31, 20, "center");
    ctx.fillStyle = "#111";
    ctx.font = "900 53px Arial";
    ctx.textAlign = "center";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 8;
    ctx.strokeText("Vs", 180, 55);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Vs", 180, 52);

    drawCastleIcon(30, 56, "#1aaeea");
    drawCastleIcon(296, 56, "#ef252a");
    drawOutlinedText(playerPct + "%", 13, 111, 30, "left");
    drawOutlinedText(enemyPct + "%", 347, 111, 30, "right");

    if (!state.ctaVisible && state.phase !== "projectile") {
      const text = activeTurn().side === "player" ? "PULL BACK TO SHOOT" : "ENEMY AIMING";
      drawOutlinedText(text, 180, 594, 18, "center");
    }
    ctx.restore();
  }

  function drawTrapezoid(x, y, w, h, color, left) {
    ctx.save();
    ctx.fillStyle = "#111111";
    ctx.beginPath();
    ctx.moveTo(x - 1, y - 1);
    ctx.lineTo(x + w + 1, y - 1);
    ctx.lineTo(x + w - (left ? 5 : 0), y + h + 5);
    ctx.lineTo(x + (left ? 0 : 5), y + h + 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w - (left ? 8 : 0), y + h);
    ctx.lineTo(x + (left ? 0 : 8), y + h);
    ctx.closePath();
    ctx.fill();
  }

  function drawCastleIcon(x, y, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#d9d6c8";
    ctx.strokeStyle = "#3a3a35";
    ctx.lineWidth = 2;
    ctx.fillRect(0, 18, 34, 28);
    ctx.strokeRect(0, 18, 34, 28);
    ctx.beginPath();
    ctx.moveTo(4, 18);
    ctx.lineTo(17, 0);
    ctx.lineTo(30, 18);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#2b2924";
    roundRect(12, 29, 10, 17, 5);
    ctx.fill();
    ctx.restore();
  }

  function drawEndCard() {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, H);
    if (images.endOverlay) {
      ctx.globalAlpha = state.result === "defeat" ? 0.92 : 0.55;
      drawCover(images.endOverlay, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    const title = state.result === "victory" ? "UNITS DESTROYED!" : "BATTLE FAILED";
    drawOutlinedText(title, 180, 223, state.result === "victory" ? 27 : 31, "center");
    ctx.fillStyle = "#44e537";
    ctx.strokeStyle = "#0f7318";
    ctx.lineWidth = 5;
    roundRect(72, 312, 216, 68, 14);
    ctx.fill();
    ctx.stroke();
    drawOutlinedText("PLAY NOW", 180, 354, 28, "center");
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "800 13px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Tap to open the store", 180, 404);
    ctx.restore();
  }

  function drawError() {
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, W, H);
    drawOutlinedText("ASSET LOAD ERROR", 180, 320, 18, "center");
  }

  function openStore() {
    try {
      if (window.mraid && typeof window.mraid.open === "function") {
        window.mraid.open(STORE_URL);
        return;
      }
    } catch (error) {
      console.warn(error);
    }
    window.open(STORE_URL, "_blank", "noopener,noreferrer");
  }

  function drawOutlinedText(text, x, y, size, align) {
    ctx.save();
    ctx.font = "900 " + size + "px Arial";
    ctx.textAlign = align;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = Math.max(4, size * 0.18);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, x, y);
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
