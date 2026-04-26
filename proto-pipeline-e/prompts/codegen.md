# Codegen prompt — single-file Castle Clashers playable

You generate a self-contained HTML5 playable ad for the game **Castle Clashers**. Your output must be a single HTML file with all JS, CSS, and assets inlined. No external dependencies, no CDN, no iframe. Max 5 MB.

You will receive a JSON `INPUT` with three sections:
- `behavior`: the canonical expected_behavior (HP=3, six-slot turn order, drag-release controls, win/loss states, CTA).
- `observation`: a grounded video observation (controls, actors, hud_layout, evidence_timestamps).
- `assets`: the available role → filename map. Reference only assets that exist.

## Output schema

You MUST return ONLY a JSON object matching this exact shape (no prose, no fences):

```json
{
  "html": "<!doctype html>...full self-contained HTML string...",
  "rationale": "string (one short paragraph explaining your design choices)"
}
```

## Hard requirements (failure modes to AVOID)

1. **`window.__engineState` MUST exist** with these getters: `phase`, `turnIndex`, `playerHp`, `enemyHp`, `projectiles` (count), `inputs`, `ctaVisible`, and a `snapshot()` function returning `{phase, turnIndex, playerHp, enemyHp, projectiles, inputs, ctaVisible, result}`. Every field must be writable from internal state.
2. **HP is DISCRETE**: `playerHp = 3, enemyHp = 3` initially. Each hit decrements by 1. Do NOT use percentage bars.
3. **Six-slot turn rotation**: `turnOrder = [P0, E0, P1, E1, P2, E2]`. `turnIndex` cycles 0..5 mod 6. `phase` enum is `aiming | projectile | enemy_wait | ended`. The phase string `aiming` and `projectile` MUST appear at runtime so a downstream verifier can observe them.
4. **Player input**: drag from a player unit (within ~95px of the active slot) BACKWARD; release fires one projectile with ballistic velocity. Pull bounds: `pullX ∈ [26, 135]`, `pullY ∈ [-85, 105]`. Velocity: `vx = 0.24 + pullX*0.0038, vy = -0.27 + pullY*0.0027`.
5. **Enemy AI fires automatically** on enemy turns after a 600–700 ms dwell, aiming at the player castle with bounded random error. Implement this — never leave enemy turns idle.
6. **Win = enemy_hp == 0, Loss = player_hp == 0**. On end, set `state.ctaVisible = true`. CTA tap calls `window.mraid.open(STORE_URL)` with `window.open(STORE_URL)` fallback. STORE_URL = `https://play.google.com/store/apps/details?id=com.epicoro.castleclashers`.
7. **Canvas 360x640 portrait**, scaled to fit viewport without scrollbars. Use `requestAnimationFrame` for the loop.
8. **MRAID 2.0 shim** is required. Wrap the playable so `mraid.ready` event fires and `mraid.open` is callable; provide a noop fallback for browsers without MRAID.

## Forbidden tokens

- The words `treads`, `tilt`, `crumble`, `tank`, `pivot`, `physics-based destruction` MUST NOT appear in your output. Castle Clashers does NOT have these. Substitute: a hit just decrements HP and the castle sprite shakes briefly.
- The field `tutorial_loss_at_seconds` is forbidden. Match end is determined by HP == 0, never by a timer.

## Assets

Use only the `assets` map provided. Render assets that are not provided as colored rectangles with the role name in centered text — never reference a filename that is not in the map.

## Style

- Vanilla Canvas 2D. No frameworks.
- Inline simple CSS. Center the canvas, dark background.
- Self-contained: no `<script src=...>`, no `<link href=...>` to external resources.
- Keep generated HTML under ~80 KB if no real assets are inlined. Prioritize behavioral correctness over visual polish.

Return ONLY the JSON object. The `html` field is a string, the entire HTML file from `<!doctype html>` to `</html>`.
