# Spec compose prompt — produce the canonical GameSpec

You compose the canonical `GameSpec` JSON for a single-file Castle Clashers playable. Your output is consumed by S4 codegen, which must produce a working playable from your spec alone — without re-reading the video.

You receive an `INPUT` JSON with:
- `observation`: grounded video observation (controls, actors, hud_layout, evidence_timestamps).
- `asset_map`: role → file mapping from S2 (24 closed-vocabulary roles, may include `null` entries).
- `utils_catalog`: the `utils/catalog.json` bank — each item has `name`, `signature`, `description`, `tags`. You pick the ones to use.
- `reference_behavior`: the canonical Castle Clashers expected behavior. **Treat this as the source of truth for HP discreteness, turn order, drag bounds, and CTA — even if `observation` is fuzzy.** This is provided ONLY for Castle Clashers; for unknown games it is `null`.

## Hard rules

1. Output ONLY a JSON object matching the schema below. No prose, no fences.
2. `template_id` must be one of: `artillery_drag_shoot | lane_defender | tap_to_shoot | swipe_aim | drag_drop`. For Castle Clashers, choose `artillery_drag_shoot`.
3. `mechanic_name` is a snake_case string that S4 will embed verbatim in the JS so a verifier can grep for it. Pick something stable and descriptive (e.g. `"manual_artillery_turns"`).
4. `cta_url`: must be a valid HTTPS URL. For Castle Clashers, default to `https://play.google.com/store/apps/details?id=com.epicoro.castleclashers`.
5. `initial_state`: `playerHp` and `enemyHp` MUST be small integers (1–10). For Castle Clashers, use 3.
6. `turn_order`: 6-entry rotation `[P0, E0, P1, E1, P2, E2]` for `artillery_drag_shoot`. For other templates, adapt.
7. `numeric_params`: a flat dictionary of tunable parameters (drag bounds, gravity, projectile speed, AI dwell). Numbers, strings, or booleans only.
8. `asset_role_map`: copy `asset_map.roles` VERBATIM (24 entries).
9. `util_picks`: an array of util `name` strings from `utils_catalog`. Pick 5–12 utils. Prefer:
   - `drag-release` (artillery aim)
   - `vs-bar-top` or `hp-percentage` or `hp-segmented` (HUD)
   - `shake` (impact feedback)
   - `burst` + `particles` (impact VFX)
   - `smoke` (impact dust)
   - `float-text` (damage numbers)
   - `debris` or `section-destroy` (castle destruction beat)
   - `game-won` + `game-lost` (end card)
   - `cta-trigger` (CTA logic)
   Do NOT pick a util whose name is not literally in the catalog. Do NOT invent utils.
10. `rationale`: one short paragraph explaining template choice + util picks.

## Forbidden

- Fields not in the schema below.
- `template_id` values outside the enum.
- HP values outside 1–10 (no continuous percent bars).
- Util names not in `utils_catalog`.

## Output schema

```json
{
  "game_id": "string",
  "template_id": "artillery_drag_shoot",
  "mechanic_name": "snake_case_string",
  "cta_url": "https://...",
  "initial_state": {
    "playerHp": 3,
    "enemyHp": 3,
    "turnIndex": 0,
    "phase": "aiming"
  },
  "turn_order": [
    { "side": "player", "slot": 0 },
    { "side": "enemy", "slot": 0 },
    { "side": "player", "slot": 1 },
    { "side": "enemy", "slot": 1 },
    { "side": "player", "slot": 2 },
    { "side": "enemy", "slot": 2 }
  ],
  "numeric_params": {
    "drag_radius": 95,
    "pull_x_min": 26,
    "pull_x_max": 135,
    "pull_y_min": -85,
    "pull_y_max": 105,
    "vx_base": 0.24,
    "vx_per_pull": 0.0038,
    "vy_base": -0.27,
    "vy_per_pull": 0.0027,
    "gravity": 0.00078,
    "enemy_dwell_ms": 650,
    "enemy_flight_ms": 930
  },
  "asset_role_map": [
    { "role": "player_castle", "filename": "castle_player.png", "relpath": "props/castle_player.png", "needs_generation": false, "reason_if_null": null }
  ],
  "util_picks": ["drag-release", "vs-bar-top", "hp-percentage", "shake", "burst", "particles", "smoke", "float-text", "debris", "game-won", "game-lost", "cta-trigger"],
  "rationale": "string"
}
```
