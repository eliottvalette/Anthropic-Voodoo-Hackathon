# S4 codegen prompt — write the game-code that drives a fixed shell

A self-contained shell, the utils bank, and the assets are already wired by the pipeline. **Your job is ONLY to write the game-code JavaScript that drives them.** You do NOT write the HTML, the viewport meta, the canvas tag, the CSS, the asset injection, or the util definitions — those already exist.

The pipeline assembles your output into:

```html
<!doctype html>
<html>… (playable-shell.html boilerplate, fixed)
  <canvas id="game" width="360" height="640"></canvas>
  <script>window.__ASSETS = { /* role: dataURI */ };</script>
  <script>window.STORE_URL = "https://…";</script>
  <script>/* utils inlined VERBATIM: drag-release, vs-bar-top, … */</script>
  <script>/* YOUR OUTPUT GOES HERE */</script>
</html>
```

You receive an `INPUT` JSON with:
- `spec`: the canonical `GameSpec` (template_id, mechanic_name, cta_url, initial_state, turn_order, numeric_params, asset_role_map, util_picks, rationale).
- `utils_signatures`: dict `{util_name: {signature, description}}` — the utils available at runtime. They are already inlined; you call them. Do NOT redefine them.
- `assets_available`: array of role names that exist in `window.__ASSETS` as data URIs. For roles NOT in this list, draw a colored rectangle labelled with the role.

## Output schema

Return ONLY a JSON object (no prose, no fences):

```json
{
  "game_js": "(function(){ \"use strict\"; /* full game logic */ })();",
  "rationale": "string (one short paragraph)"
}
```

The `game_js` field is plain JavaScript (NOT wrapped in `<script>` tags) that runs as-is when appended after the utils.

## Hard requirements

1. **`window.__engineState`** MUST be assigned with these getters and a `snapshot()` method exposing: `phase`, `turnIndex`, `playerHp`, `enemyHp`, `projectiles` (count), `inputs`, `ctaVisible`, `result`. The phase enum is `aiming | projectile | enemy_wait | ended`. The strings `"aiming"` and `"projectile"` MUST appear as literals in your code.

2. **Asset loading**: synchronously create `Image` objects from `window.__ASSETS`:
   ```js
   const IMG = {};
   for (const r of Object.keys(window.__ASSETS || {})) {
     const im = new Image(); im.src = window.__ASSETS[r]; IMG[r] = im;
   }
   ```
   Then, when drawing, `IMG.player_castle && IMG.player_castle.complete && ctx.drawImage(IMG.player_castle, ...)`. For roles NOT in `assets_available`, fallback `ctx.fillStyle="#…"; ctx.fillRect(...);`.

3. **Use the utils by their documented signature**. They are already defined in the global scope. Examples (only if in `utils_signatures`):
   - `createDragRelease(canvas, opts)` for player aim/release.
   - `drawHpSegmented(ctx, x, y, opts)` for **discrete HP** (3 chunks). Do NOT use `hp-percentage` for discrete HP — it shows continuous bars and contradicts the spec.
   - `drawVsBarTop(ctx, opts)` for the top "Vs" header — only call ONCE per frame at the top of draw.
   - `createShake(decay)` for impact feedback.
   - `burst(particles, x, y, color, count, power)` (requires `particles.js`, also inlined).
   - `spawnFloat(floats, x, y, text, color)` for damage numbers.
   - `spawnDebris(debris, x, y, side, count)` for castle break.
   - `makeSectionPolys(n)` + `makeDyingSection` + `updateDyingSections` for the 3-state castle destruction (poly clipping).
   - `drawGameWon(ctx, W, H, opts)` / `drawGameLost(ctx, W, H, opts)` for end card.
   - `openStore(url)` for CTA (handles MRAID + window.open fallback).

4. **HP is DISCRETE** integers. Initial values from `spec.initial_state`. Each hit decrements by 1. Use `drawHpSegmented` if available, NOT a percentage bar.

5. **Six-slot turn rotation** per `spec.turn_order`. Active player aims via drag, active enemy fires after `numeric_params.enemy_dwell_ms`.

6. **Drag-release semantics** (artillery_drag_shoot): drag must originate within `numeric_params.drag_radius` units of the active player slot. Pull bounds + velocity formulas from `numeric_params`. Apply gravity per ms.

7. **Enemy AI** solves `vx, vy` to land projectile in player castle hitbox, with bounded sin/cos noise on aim.

8. **Win = enemy_hp == 0, Loss = player_hp == 0**. On end → `state.ctaVisible = true`, draw end card, CTA tap calls `openStore(window.STORE_URL || spec.cta_url)`.

9. **Embed `mechanic_name`** verbatim as a const so a verifier can grep: `const MECHANIC = "manual_artillery_turns";`

10. **Use `requestAnimationFrame`** for the loop. Canvas is `360x640` (`document.getElementById("game")`).

## Layout (for artillery_drag_shoot — Castle Clashers)

The canvas is 360×640 portrait. Use a world larger than the canvas with a camera (use `createCamera` if available in `utils_signatures`).

Suggested geometry (you may adjust):
- **World**: 740×640 (zoomed via `camera.zoom = 0.72`).
- **Player castle**: `{ x: 34, y: 124, w: 235, h: 386 }` (left side, blue).
- **Enemy castle**: `{ x: 472, y: 124, w: 235, h: 386 }` (right side, red).
- **Player slots** (where drag originates): `[(131,271), (187,376), (102,455)]`.
- **Enemy slots**: `[(601,271), (545,376), (630,455)]`.
- **HUD**: `drawVsBarTop` at the top, occupying the top 90px in screen space.
- **Background**: render `IMG.background_gameplay` covering the world.

Draw order per frame: clear → background → castles → units → projectiles → VFX (burst/smoke/debris/floats) → HUD top-bar → end card if `ctaVisible`.

## Forbidden

- The words `treads`, `tilt`, `crumble`, `tank`, `pivot`, `physics-based destruction` MUST NOT appear in your `game_js`.
- `tutorial_loss_at_seconds` or any timer-based loss. Match ends only on HP == 0.
- Re-implementing the HTML/CSS/canvas tag.
- Continuous HP bars when `drawHpSegmented` is in `utils_signatures`.
- Hardcoded `console.error` paths (use try/catch around image loading if needed, but no fatal errors during normal play).
- Referencing roles not in `assets_available` without a fallback.

## NEVER REDEFINE THESE FUNCTIONS — they are already global

Anything in `utils_signatures` is already callable. **You MUST NOT write `function NAME(...)` for any of these names**: `updateParticles`, `drawParticles`, `updateFloats`, `drawFloats`, `updateDebris`, `drawDebris`, `updateDyingSections`, `drawSection`, `drawVsBarTop`, `drawHpSegmented`, `drawHpPercentage`, `createDragRelease`, `createCamera`, `createShake`, `drawGameWon`, `drawGameLost`, `drawTryAgain`, `createWinEffect`, `createGameOverEffect`, `openStore`, `isPointInCta`, `spawnFloat`, `spawnDebris`, `spawnTrail`, `spawnFlash`, `spawnShockwave`, `burst`, `smoke`, `makeSectionPolys`, `makeDyingSection`. Use them as-is. If you need a different particle update loop, name it `updateGameParticles`, never `updateParticles`.

## Sanity check before emitting

Before returning, mentally run through the output:
1. Does `game_js` parse as valid JavaScript? Match every `{` with `}`, every `(` with `)`.
2. Does it assign `window.__engineState`?
3. Does the literal `"aiming"` appear? `"projectile"`?
4. Does the `mechanic_name` literal appear?
5. No util functions redefined?

## Style

- One IIFE: `(function(){ "use strict"; … })();`
- No comments unless non-obvious.
- Vanilla Canvas 2D. No frameworks.
