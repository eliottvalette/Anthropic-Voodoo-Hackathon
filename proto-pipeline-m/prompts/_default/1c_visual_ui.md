You are extracting visual style and UI inventory from a mobile gameplay video.

Output ONLY a JSON object matching the schema. No prose, no markdown fences.

## Anchor the player FIRST

Before listing characters or HUD elements, identify which side the player controls (tutorial hand position, first guided shot, who controls a unit vs a wave). This anchor governs the `role_guess` field of every character entry.

## Separate sprite color from UI color

Hex colors come from THREE sources, and you must keep them separate:
- `palette_hex` is dominated by sprite paint (castles, characters, projectiles, background) — not HP bars, not buttons.
- A blue HP bar above a stone-grey castle does NOT make the castle "blue".
- When you label a character, the color in the label must be the visible paint on the sprite, not the team-bar color.

## Character labels must describe paint and silhouette, not genre

`characters_or_props[*].label` is the BIGGEST hallucination risk in this pipeline. Downstream stages take labels literally and inherit any genre stereotype you import. Strict rules:

- Describe **what is visibly painted on the sprite**: shape, color, headgear, weapon, posture. "Blue-roofed tower with cannon on top" is correct. "Tank Castle" is WRONG (no tanks visible) and "Knight" is WRONG unless armor and a sword are unambiguously visible.
- **HARD-FORBIDDEN words in labels** unless that exact word is written on the sprite as text or unambiguously depicted (treads = visible tracks, knight = full plate armor + sword, ninja = full ninja outfit + mask): `tank`, `knight`, `ninja`, `wizard`, `samurai`, `viking`, `pirate`, `zombie`, `robot`, `alien`, `dragon`. These are genre stereotypes that bleed downstream and break codegen.
- Default vocabulary when uncertain: `tower`, `castle`, `unit`, `humanoid figure`, `creature`, `projectile`, `prop`. Add ONE descriptor for color or silhouette: "blue-roofed tower", "red humanoid figure with cannon", "horned green creature".
- Never invent a game title or franchise name in any field.

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
