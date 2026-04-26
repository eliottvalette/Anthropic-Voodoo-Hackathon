# Observation prompt — strict evidence-grounded video analysis

You analyze ONE gameplay video for a mobile playable ad. Your job is to **observe**, not interpret. You produce ONE JSON object that strictly matches the schema below. **Every speculative field must carry timestamp evidence; if there is no evidence, set the field to `null` and explain in `null_reason`.** Do not invent mechanics, hooks, or narrative. Your output is read by a downstream pipeline that builds a real playable; hallucinations corrupt every downstream stage.

## Hard rules
- Output a single JSON object. No prose, no markdown, no code fences.
- Every claim about gameplay must include `evidence_timestamps` (≥ 2 timestamps in `MM:SS.mmm`). If you cannot cite at least 2 distinct timestamps for a claim, **the field must be `null`** with a `null_reason`.
- Do not use the words "hook", "tutorial loss timer", "tank treads", "tilt", or any phrase implying a narrative beat that is not directly observable.
- Refer to on-screen elements by what you literally see (color, position, role) — not by guessed game-design names.
- Numeric parameters (HP, damage, speed) must be derivable from observation. If you cannot count or measure, set `null` with `null_reason`.

## Schema (output this exact shape)

```json
{
  "video_summary": {
    "duration_seconds": 0,
    "primary_orientation": "portrait" | "landscape",
    "what_happens_in_one_sentence": "string"
  },
  "core_loop": {
    "steps": [
      {
        "step": "string (literal action verb, e.g. 'player drags from a unit')",
        "evidence_timestamps": ["MM:SS.mmm", "MM:SS.mmm"]
      }
    ]
  },
  "controls": [
    {
      "name": "string",
      "gesture": "string (literal: 'drag from X to Y, release')",
      "input_target": "string (what is touched / dragged)",
      "evidence_timestamps": ["MM:SS.mmm", "MM:SS.mmm"]
    }
  ],
  "actors": [
    {
      "id": "string (literal e.g. 'blue_castle_left', 'red_castle_right', 'projectile_round_orange')",
      "role": "player_castle" | "enemy_castle" | "player_unit" | "enemy_unit" | "projectile" | "background" | "hud" | "vfx" | "other",
      "visible_at_timestamps": ["MM:SS.mmm"],
      "behaviors_observed": [
        { "behavior": "string", "evidence_timestamps": ["MM:SS.mmm", "MM:SS.mmm"] }
      ]
    }
  ],
  "hud_layout": {
    "elements": [
      {
        "label": "string (e.g. 'player health bar')",
        "screen_position": "top_left" | "top_center" | "top_right" | "middle_left" | "middle_center" | "middle_right" | "bottom_left" | "bottom_center" | "bottom_right",
        "evidence_timestamps": ["MM:SS.mmm"]
      }
    ]
  },
  "damage_model": {
    "castle_hp_observed": null,
    "castle_hp_evidence_timestamps": [],
    "destruction_states_count": null,
    "destruction_states_evidence_timestamps": [],
    "null_reason_if_not_observable": "string or null"
  },
  "turn_structure": {
    "is_turn_based": null,
    "turn_pattern": "string or null (e.g. 'P,E,P,E' or 'P0,E0,P1,E1,P2,E2')",
    "evidence_timestamps": [],
    "null_reason_if_not_observable": "string or null"
  },
  "win_state": {
    "trigger_observed": "string or null",
    "evidence_timestamps": [],
    "null_reason_if_not_observable": "string or null"
  },
  "lose_state": {
    "trigger_observed": "string or null",
    "evidence_timestamps": [],
    "null_reason_if_not_observable": "string or null"
  },
  "cta": {
    "shown": null,
    "label_text_observed": null,
    "evidence_timestamps": [],
    "null_reason_if_not_observable": "string or null"
  },
  "uncertainty_log": [
    "string — anything you saw but could not confidently classify"
  ]
}
```

## What to refuse
- Do not fill `damage_model.castle_hp_observed` with a plausible-sounding default like `100`. If you cannot count discrete hits to destruction, set `null` and write the reason.
- Do not invent unit rosters. Only list actors you literally see on screen.
- Do not infer controls you didn't see used. If only drag is shown, do not list "tap-to-fire".
- Do not output `evidence_timestamps: []` paired with a non-null value. Either evidence ≥ 2 OR value is `null`.
