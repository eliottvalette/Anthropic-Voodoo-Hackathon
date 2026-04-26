# Playable Utils Bank

Reusable Canvas-2D building blocks for playable ads. Mobile-first, 360×640, no framework, no dependency.

This bank exists so the generation pipeline (and humans) can:
- Pick a known-good piece instead of regenerating from scratch
- Compose pieces (smoke + burst + shake on impact)
- Stay consistent with what already works in target playables

Every util is a single self-contained `.js` file with a header documenting its purpose, signature, and dependencies. Every util has a standalone demo `.html` you can open in the dashboard library view.

---

## Index

`catalog.json` is the machine-readable index. Use it from the pipeline.

| Category | Items |
|---|---|
| **VFX** | smoke · burst · shake · float-text · debris · particles |
| **HUD** | vs-bar-top · hp-segmented · hp-percentage · timer |
| **End Screens** | game-lost · game-won · try-again · win-effect · game-over-effect |
| **Mechanics** | drag-release · camera-lerp · cta-trigger |

---

## VFX

### `smoke(particles, x, y, count?)` — `vfx/smoke.js`
Rising gray puffs. Pairs with `particles.js` (push to your engine's particle array, render with `drawParticles`).

### `burst(particles, x, y, color, count?, power?)` — `vfx/burst.js`
Radial color explosion. Hit feedback, pickups, impacts.

### `createShake(decay?)` — `vfx/shake.js`
Returns `{ trigger(amount), update(dt), offset() }`. Apply `offset()` via `ctx.translate` before drawing.

### `spawnFloat / updateFloats / drawFloats` — `vfx/float-text.js`
Floating damage numbers, score pops. Outlined text rises and fades.

### `spawnDebris / updateDebris / drawDebris` — `vfx/debris.js`
Physics chunks with gravity + spin. Castle break, prop destruction.

### `updateParticles / drawParticles` — `vfx/particles.js`
Generic particle loop. Compatible particle shape: `{ x, y, vx, vy, radius, color, life }`.

---

## HUD

### `drawVsBarTop(ctx, opts)` — `hud/vs-bar-top.js`
Two-player VS top header (trapezoid bars + center "Vs" + castle icons + HP%). 360px wide.

### `drawHpSegmented(ctx, x, y, opts)` — `hud/hp-segmented.js`
Discrete chunks (3 hearts, 5 chunks, 10 slim). For low max-HP characters.

### `drawHpPercentage(ctx, x, y, w, h, opts)` — `hud/hp-percentage.js`
Continuous fill bar with optional numeric label. For granular HP.

### `drawTimer(ctx, x, y, seconds, opts?)` — `hud/timer.js`
MM:SS with urgency color when low. Outlined for readability.

---

## End Screens

### `drawGameLost(ctx, W, H, opts)` — `end-screens/game-lost.js`
Diagonal split overlay. Left keeps the game, right is red. Replaceable `headline`, `cta`, `subText`. Reads `drawGameLost.lastCtaBounds` for hit-testing the CTA.

### `drawGameWon(ctx, W, H, opts)` — `end-screens/game-won.js`
Same shape, blue right panel + confetti dots.

### `drawTryAgain(ctx, W, H, opts)` — `end-screens/try-again.js`
Neutral "almost there" overlay with amber polka-dot panel.

### `createWinEffect(opts)` — `end-screens/win-effect.js`
Animated **win moment** played BEFORE the static end-screen — golden flash, rotating sun rays, pulsing glow, bouncy headline (overshoot scale-in), confetti rain + corner cannons, sparkle bursts. Returns `{ update(dt), draw(ctx), reset(), t, done }`. Self-contained, no deps.

### `createGameOverEffect(opts)` — `end-screens/game-over-effect.js`
Animated **lose moment** played BEFORE the static end-screen — red flash, screen-shake offset (caller-applied), grayscale desaturate via `globalCompositeOperation = "saturation"`, dark red vignette pulse, headline drops from above with bounce. Returns `{ update(dt), draw(ctx), reset(), t, done, shakeX, shakeY }`. Self-contained.

---

## Mechanics

### `createDragRelease(canvas, opts)` — `mechanics/drag-release.js`
Slingshot / artillery aim. Pointer Events with capture (works mouse + touch + pen).
Inject your camera transform via `pointerToWorld`. Inject your physics via `toVelocity`.
Returns `{ isDragging, drawTrajectory(ctx), destroy() }`.

### `createCamera(init)` — `mechanics/camera-lerp.js`
2D camera (x, y, zoom) with dt-based lerp. Provides `apply(ctx, W, H)` to wrap world drawing and `pointerToWorld(e, canvas, W, H)` for inverse transform.

### `openStore(url)` — `mechanics/cta-trigger.js`
Resolve store open across Voodoo VSDK → MRAID → parent postMessage → `window.open`. Wire from your end-screen CTA hit-test.

---

## Composition cheatsheet

**Hit a target**:
```js
shake.trigger(10);
burst(particles, x, y, "#ff4141", 28, 0.18);
spawnFloat(floats, x, y - 24, "-72", "#fff");
spawnDebris(debris, x, y, "left", 16);
smoke(particles, x, y, 12);
```

**End game (animated punctuation → static overlay)**:
```js
// On the moment the game resolves:
const fx = won
  ? createWinEffect({ W: 360, H: 640, headline: "VICTORY!", subhead: "YOU WIN" })
  : createGameOverEffect({ W: 360, H: 640, headline: "GAME OVER", subhead: "TAP TO RETRY" });

// In the loop:
fx.update(dt);
ctx.save();
ctx.translate(fx.shakeX || 0, fx.shakeY || 0);   // shake the world (lose only)
drawGame(ctx);
ctx.restore();
fx.draw(ctx);                                    // overlay the dramatic moment

if (fx.done) {
  // Hand off to the static end-screen (with optional fade-in)
  if (won) drawGameWon (ctx, 360, 640, { primary: "BATTLE", secondary: "WON",    cta: "PLAY NOW" });
  else     drawGameLost(ctx, 360, 640, { primary: "BATTLE", secondary: "FAILED", cta: "TRY AGAIN" });
}

canvas.addEventListener("pointerdown", e => {
  if (!fx.done) return;                          // don't grab taps during the effect
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) * 360 / r.width;
  const y = (e.clientY - r.top)  * 640 / r.height;
  const target = won ? drawGameWon : drawGameLost;
  if (isPointInCta(target.lastCtaBounds, x, y)) openStore(STORE_URL);
});
```

**Player turn loop (Castle Clashers shape)**:
```js
const cam = createCamera({ x: 370, y: 330, zoom: 0.72, smoothMs: 260 });
const dr  = createDragRelease(canvas, {
  getOrigin: () => activeUnit(),
  pointerToWorld: e => cam.pointerToWorld(e, canvas, 360, 640),
  toVelocity: ({ pullX, pullY }) => ({ vx: 0.24 + pullX*0.0038, vy: -0.27 + pullY*0.0027 }),
  onFire: v => fireProjectile(v),
});
```

---

## Conventions

- Pure Canvas 2D — no framework, no module system.
- Functions / factories on the global scope. Demos load utils via `<script src="…">`.
- World units default to 360×640 portrait. Adjust with explicit `W, H` params.
- Particle shape: `{ x, y, vx, vy, radius, color, life }` so utils interop without adapters.
- Each util has the same banner header so an LLM can grep for `UTIL:` to enumerate.

---

## How the pipeline should use this

1. Read `catalog.json` for the available pieces.
2. For each piece chosen, paste the file content into the generated playable's `<script>` block (or include via build step).
3. Always include `vfx/particles.js` if any of `smoke` / `burst` is used.
4. Always include `mechanics/cta-trigger.js` for the CTA — never hard-code `window.open` alone.
