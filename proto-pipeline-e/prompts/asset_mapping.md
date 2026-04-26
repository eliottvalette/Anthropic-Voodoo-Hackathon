# Asset mapping prompt — strict role vocabulary

You map game assets to a fixed role vocabulary. You receive a JSON `INPUT` with:
- `assets`: array of files in the bank (filename, relpath, kind, width, height).
- `observation`: the grounded video observation (actors, hud_layout).

You assign each role to exactly one file from `assets`, OR mark it `null` with `needs_generation: true`. Your output is consumed by the codegen stage; references to nonexistent files corrupt the playable.

## Role vocabulary (closed enum, do not invent roles)

```
player_castle, enemy_castle,
background_gameplay, background_endcard,
unit_player_0, unit_player_1, unit_player_2,
unit_enemy_0, unit_enemy_1, unit_enemy_2,
projectile_player_0, projectile_player_1, projectile_player_2,
projectile_enemy_0,
hud_top_bar, hud_unit_panel,
ui_play_button, ui_battle_failed, ui_battle_won, ui_logo,
sfx_hit, sfx_fire, sfx_ui, bgm_loop
```

## Hard rules

1. Output ONLY a JSON object matching the schema below. No prose, no markdown fences.
2. The `roles` array MUST contain exactly one entry per role above (24 entries). Skip none. Do NOT add roles that are not in the vocabulary.
3. Each `filename` and `relpath` MUST come VERBATIM from the `assets` input. No paraphrasing, no path tweaking.
4. If no asset matches a role, set `filename: null`, `relpath: null`, `needs_generation: true`, and write a short `reason_if_null`. Do NOT pick a poor match — `null` is preferred over a wrong asset.
5. The same file MAY map to multiple roles (e.g. a single ninja sprite for all enemy units), but flag it in `notes`.
6. `unmapped_assets` lists assets in the bank that you did not assign to any role. Required field.

## Output schema

```json
{
  "roles": [
    {
      "role": "player_castle",
      "filename": "castle_player.png",
      "relpath": "props/castle_player.png",
      "needs_generation": false,
      "reason_if_null": null
    }
  ],
  "unmapped_assets": ["relpath/of/file.png"],
  "notes": ["string"]
}
```

## Tips

- Castle files are often named `castle_player.png` / `castle_enemy.png` or `Blue Castle.png` / `Red Castle.png`.
- Background files: gameplay vs endcard distinction matters.
- Characters with `rig.json` are the canonical units; prefer their `full.png` over loose sprites.
- HP bar UI elements live in `ui/` or `hud/` folders — match by name (`ui_top_bar`, `ui_unit_panel`).
- Sound categories: bgm = looping background music, sfx_hit = impact, sfx_fire = projectile launch, sfx_ui = button.
