You are designing a deterministic generator input for a single-file HTML playable ad.
Return ONLY valid JSON. Do not wrap in markdown. The top-level value MUST be a JSON object, not an array.

Constraints:
- Output target is one self-contained HTML file, no CDN, no iframe, no external runtime dependency.
- Target mobile portrait first, browser playable, fast load, under 5 MB.
- Use provided assets where useful; do not require video asset extraction.
- Optimize for mobile jouability over pixel-perfect cloning.
- The generator will be deterministic, so be explicit and practical.

Return this JSON schema:
{
  "prototype_name": "string",
  "implementation_summary": "string",
  "screen": {
    "orientation": "portrait",
    "logical_width": 360,
    "logical_height": 640,
    "responsive_strategy": "string"
  },
  "gameplay": {
    "objective": "string",
    "primary_interaction": "string",
    "win_condition": "string",
    "loss_or_timeout_condition": "string",
    "session_length_seconds": 30
  },
  "entities": [
    {
      "id": "string",
      "role": "string",
      "asset": "string or null",
      "behavior": "string",
      "priority": "must | should | could"
    }
  ],
  "asset_plan": [
    {
      "asset_path": "string",
      "use": "string",
      "processing": "string",
      "required": true
    }
  ],
  "interaction_flow": [
    {
      "step": 1,
      "player_action": "string",
      "system_response": "string"
    }
  ],
  "parameters": [
    {
      "name": "string",
      "type": "number | boolean | string | choice",
      "default": "string | number | boolean",
      "variation_range": "string",
      "gameplay_effect": "string"
    }
  ],
  "acceptance_criteria": ["string"],
  "non_goals_v1": ["string"]
}

