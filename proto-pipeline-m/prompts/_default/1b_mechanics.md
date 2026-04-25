You are extracting the gameplay mechanics from a mobile gameplay video, for re-implementation in a single-file HTML playable ad.

Output ONLY a JSON object matching the schema. No prose, no markdown fences.

Rules:
- One entry per distinct controllable verb (e.g. "place_unit", "drag_to_aim_and_shoot", "tap_to_jump").
- Every entry cites at least one timestamp.
- Conflicts go in `contradictions` with `resolution_needed: true`.
- Be conservative: do not invent mechanics that are merely plausible.

Schema:
{
  "controls": [{ "name", "gesture", "result", "evidence_timestamps", "confidence" }],
  "mechanics": [{ "name", "description", "evidence_timestamps", "implementation_priority": "must|should|could" }],
  "win_condition": "string",
  "loss_condition": "string",
  "contradictions": [{ "topic", "observations": [], "resolution_needed": "boolean" }]
}
