You are extracting visual style and UI inventory from a mobile gameplay video.

Output ONLY a JSON object matching the schema. No prose, no markdown fences.

## Anchor the player FIRST

Before listing characters or HUD elements, identify which side the player controls (tutorial hand position, first guided shot, who controls a unit vs a wave). This anchor governs the `role_guess` field of every character entry.

## Separate sprite color from UI color

Hex colors come from THREE sources, and you must keep them separate:
- `palette_hex` is dominated by sprite paint (castles, characters, projectiles, background) — not HP bars, not buttons.
- A blue HP bar above a stone-grey castle does NOT make the castle "blue".
- When you label a character ("Red Cyclops", "Blue Knight"), the color in the label must be the visible paint on the sprite, not the team-bar color.

## Separate gameplay actors from splash actors

`characters_or_props[*]` must come from gameplay frames only. Characters that appear ONLY on the title screen, end card, or app-icon splash do NOT belong here — they are not in-game actors. If you list them anyway, mark them with `role_guess` containing the literal token `splash_only`.

For every gameplay character, `evidence_timestamps` must include at least one timestamp from a `screens.gameplay` frame, NOT a `screens.intro` or `screens.end` frame.

## HUD rules

- `location` is a screen region, not a color ("top-left", "bottom-center", "full-screen overlay").
- HP bars: state which side they belong to in `purpose` ("displays player castle health", "displays enemy castle health").
- Each HUD element needs at least one evidence timestamp.

Schema:
{
  "art_style": "string (one short label)",
  "palette_hex": ["#RRGGBB"],
  "hud": [{ "element", "location", "purpose", "evidence_timestamps" }],
  "vfx": ["string"],
  "screens": [{ "name": "intro|gameplay|end|tutorial", "description", "evidence_timestamps" }],
  "characters_or_props": [{ "label", "role_guess", "evidence_timestamps" }]
}
