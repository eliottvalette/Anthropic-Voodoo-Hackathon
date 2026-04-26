You are extracting the gameplay mechanics from a mobile gameplay video, for re-implementation in a single-file HTML playable ad.

Output ONLY a JSON object matching the schema. No prose, no markdown fences.

## Anchor the player FIRST

Before listing any mechanic, internally identify which side the player controls:
- The tutorial hand / pointer touches the player's side.
- The player's side fires first under guided motion (arrow, glow, prompt).
- The player controls a unit/character; the opponent (if any) is automated.

Refer to actors as "player" and "enemy" in `description` and `result` fields — not by sprite color. A "blue" castle operated by the tutorial hand is the player castle.

## Rules

- One entry per distinct controllable verb (e.g. "place_unit", "drag_to_aim_and_shoot", "tap_to_jump").
- Every entry cites at least one timestamp.
- Conflicts go in `contradictions` with `resolution_needed: true`.
- Be conservative: do not invent mechanics that are merely plausible.
- `controls` describes only the PLAYER's input. Enemy actions are not controls; they belong in `mechanics` if they're a rule of the game.
- A mechanic that says "X destroys Y's castle" must use player/enemy, not color names, so the rule survives a sprite swap.

Schema:
{
  "controls": [{ "name", "gesture", "result", "evidence_timestamps", "confidence" }],
  "mechanics": [{ "name", "description", "evidence_timestamps", "implementation_priority": "must|should|could" }],
  "win_condition": "string",
  "loss_condition": "string",
  "contradictions": [{ "topic", "observations": [], "resolution_needed": "boolean" }]
}
