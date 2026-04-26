You are watching a short mobile gameplay video and writing a grounded, plain-English description of what actually happens on screen. This description anchors every later pipeline stage, so factual accuracy matters far more than vivid prose.

Output ONLY a JSON object matching the schema. No prose outside JSON, no markdown fences.

## Step 1 — anchor the screen

Before writing anything else, identify the player. Use these signals, in priority order:
1. Where does the on-screen tutorial hand / pointer appear and tap? That side is the player.
2. Which side fires first under guided motion (an arrow, a glow, a "TAP HERE" prompt)? That side is the player.
3. If neither hand nor prompt is visible, the player is whichever side controls a single character or unit (vs. a wave / structure on the other side).

Record this in `screen_layout.player_side` (`left | right | top | bottom | center | unknown`). The opposing side, if any, goes in `enemy_side`. Cite the timestamp and the visible cue in `evidence` — e.g. `"00:06.2 — orange hand drags up from the unit on the left"`.

If the game is single-player (no opposing actor), set `enemy_side: "none"` and explain why in `evidence`.

## Step 2 — anchor the HP bars

If health bars are visible, describe their on-screen positions in `hp_bar_layout`. Be explicit about which bar belongs to which side — derive ownership from the layout you anchored above, NOT from bar color. A red bar above the player castle is still the PLAYER's HP. Set `bars_visible: false` if no HP bars exist; in that case position fields can be `"none"`.

## Step 3 — write the narrative (200–400 words, plain English)

Describe what literally happens, in chronological order, as if explaining the clip to someone who cannot see the screen. Refer to the player and the enemy by their grounded sides ("the player castle on the left", "the enemy units on the right"). Refer to colors by what is visibly painted on the sprite ("blue conical roof", "red and white missile"), separating sprite color from UI color. Mention the tutorial hand whenever it is visible. State the outcome (win, loss, end card, app icon) at the end.

Forbidden in `narrative`:
- Inventing a character species, faction name, or storyline not visible on screen.
- Calling a castle "the blue castle" because the HP bar above it is blue. Describe the sprite's actual paint.
- Reporting an HP percentage you are not certain you read correctly. If unclear, say "the player HP bar drops to roughly half" instead of citing a number.

Required in `narrative`:
- The first action and who performs it.
- At least one concrete UI cue (tutorial hand, arrow, glow, button).
- The end state.

## Step 4 — list 4 to 8 key moments

`key_moments[*]` is a sparse beat sheet. Each entry has:
- `time_range`: `"MM:SS.mmm-MM:SS.mmm"` (or `"MM:SS-MM:SS"`).
- `actor`: who is acting (`player | enemy | both | neutral | ui`).
- `plain_action`: one short sentence in plain English.

Pick beats that mark phase transitions: first input, first hit, first damage, mid-game escalation, end-card, post-game CTA.

## Step 5 — color grounding (4–10 entries)

`color_grounding[*]` separates sprite paint from UI paint to prevent later passes from conflating them. For each visually salient subject (player castle roof, enemy castle roof, projectile bodies, HP bars, end card text, etc.), record:
- `subject`: short label.
- `color_observed`: plain-English color name (`"blue", "stone-grey with red trim", "off-white"`). No hex.
- `source`: one of `sprite | ui_bar | vfx | text | background | other`.

This is the cross-check downstream stages use whenever a later step says "the red castle" — it must trace to a `sprite` entry, not to `ui_bar`.

## Schema

```json
{
  "screen_layout": {
    "player_side": "left|right|top|bottom|center|unknown",
    "enemy_side": "left|right|top|bottom|center|none|unknown",
    "evidence": "string (timestamp + visible cue)"
  },
  "hp_bar_layout": {
    "player_bar_position": "string (e.g. 'top-left', 'none')",
    "enemy_bar_position": "string (e.g. 'top-right', 'none')",
    "bars_visible": "boolean"
  },
  "narrative": "string (200–400 words)",
  "key_moments": [
    { "time_range": "string", "actor": "player|enemy|both|neutral|ui", "plain_action": "string" }
  ],
  "color_grounding": [
    { "subject": "string", "color_observed": "string", "source": "sprite|ui_bar|vfx|text|background|other" }
  ]
}
```
