import type { TemplateModule } from "../schemas/template.ts";

const template: TemplateModule = {
  id: "artillery_drag_shoot",
  description:
    "Side-view artillery duel: player drags from a fixed cannon to set angle/power, releases to launch a projectile under gravity at an enemy structure. Real-time, single-screen, 9:16 portrait.",
  subsystem_hints: {
    input:
      "Drag from anywhere on the canvas to define a 2D launch vector relative to dragStart. On pointerup, write `state.lastDrag = {x: dx, y: dy}` and set `state.fireRequested = true` once. Reset transient drag vars on pointerup. Increment `state.drags` (monotonic) on each successful release-after-drag. Clamp the drag magnitude to ~300 px before exporting (visually clamp the aim line too).",
    physics:
      "Projectiles use gravity ~800 px/s^2 and integrate as `x += vx*dt; y += vy*dt; vy += g*dt`. On consume of `state.fireRequested`, push a projectile with vx = -lastDrag.x * power and vy = -lastDrag.y * power (inverted, slingshot-style), where power is a constant ~3. Cull projectiles that leave the 360x640 canvas (off-screen splice). Resolve collisions vs. the enemy structure as a simple AABB on the structure's bounding rect; subtract `state.numericParams.projectile_damage` from `state.enemyHealth` and remove the projectile.",
    render:
      "Canvas is 360x640. Always fill a sky background on every frame (e.g. linear vertical gradient or solid sky color) BEFORE drawing entities. Draw the player cannon at lower-left (~ x=60, y=540) using the player asset; draw the enemy fortress at upper-right (~ x=240, y=180) using the enemy asset. While `state.lastDrag` is set during a drag, draw a translucent aim line from the cannon along the inverted drag vector. Draw all projectiles as small filled circles or the projectile asset. Draw HP bars above each structure using `state.enemyHealth` and `state.playerHealth` against `numericParams.enemy_max_health` and `numericParams.player_max_health`.",
    state:
      "Initialize `state.enemyHealth` and `state.playerHealth` from `numericParams.enemy_max_health` / `player_max_health` (default 100 each). `state.projectiles` starts as an empty array. Consume `state.fireRequested` exactly once per release: spawn the projectile in the physics-readable list, then set `state.fireRequested = false`. Latch `state.phase = 'win'` when `state.enemyHealth <= 0` and `'loss'` when `state.playerHealth <= 0`. Honor `tutorial_loss_at_seconds`: if `state.t >= tutorial_loss_at_seconds` while still `'play'`, set phase to `'loss'` so the CTA can surface.",
    winloss:
      "Overlay tap target ONLY appears when `state.phase !== 'play'`. The pointerup listener calls `window.__cta(CTA_URL)` exactly once per overlay tap. Use the `cta_url` from game_spec verbatim as the CTA_URL constant near the top of the IIFE. Tutorial-loss enforcement mirrors the state subsystem: if `state.phase === 'play' && state.t >= tutorial_loss_at_seconds`, force `state.phase = 'loss'` (defensive double-check).",
  },
};

export default template;
