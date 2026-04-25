from __future__ import annotations

import json
from typing import Any


VIDEO_BREAKDOWN_PROMPT = """
You analyze mobile gameplay videos for playable ad generation.
Return ONLY valid JSON. Do not wrap in markdown. The top-level value MUST be a JSON object, not an array.

Task:
Break down the attached gameplay video into a practical implementation brief for a lightweight mobile playable ad.
Prioritize the smallest playable interaction that would feel fun on a phone.

JSON schema:
{
  "game_identity": {
    "observed_title": string | null,
    "genre": string,
    "camera_and_orientation": string,
    "visual_style": string
  },
  "core_loop": {
    "one_sentence": string,
    "player_goal": string,
    "failure_or_pressure": string,
    "why_it_is_fun": string
  },
  "player_controls": [
    {
      "gesture": string,
      "target": string,
      "result": string,
      "confidence": "low" | "medium" | "high"
    }
  ],
  "visible_ui": [
    {
      "element": string,
      "location": string,
      "purpose": string
    }
  ],
  "timeline_beats": [
    {
      "time_range": string,
      "event": string,
      "gameplay_meaning": string,
      "playable_relevance": string
    }
  ],
  "mechanics": [
    {
      "name": string,
      "description": string,
      "implementation_priority": "must" | "should" | "could"
    }
  ],
  "feedback_and_juice": [
    {
      "trigger": string,
      "visual_or_audio_feedback": string,
      "importance": "must" | "should" | "could"
    }
  ],
  "playable_minimum": {
    "must_include": string[],
    "can_simplify": string[],
    "should_avoid": string[]
  },
  "variation_hooks": [
    {
      "parameter": string,
      "effect": string,
      "safe_range_or_values": string
    }
  ],
  "open_questions_or_assumptions": string[]
}
""".strip()


def feature_spec_prompt(video_breakdown: dict[str, Any], asset_inventory: dict[str, Any]) -> str:
    return f"""
You are designing a deterministic generator input for a single-file HTML playable ad.
Return ONLY valid JSON. Do not wrap in markdown. The top-level value MUST be a JSON object, not an array.

Constraints:
- Output target is one self-contained HTML file, no CDN, no iframe, no external runtime dependency.
- Target mobile portrait first, browser playable, fast load, under 5 MB.
- Use provided assets where useful; do not require video asset extraction.
- Optimize for mobile jouability over pixel-perfect cloning.
- The generator will be deterministic, so be explicit and practical.

Video breakdown JSON:
{json.dumps(video_breakdown, ensure_ascii=False, indent=2)}

Asset inventory JSON:
{json.dumps(asset_inventory, ensure_ascii=False, indent=2)}

Return this JSON schema:
{{
  "prototype_name": string,
  "implementation_summary": string,
  "screen": {{
    "orientation": "portrait",
    "logical_width": number,
    "logical_height": number,
    "responsive_strategy": string
  }},
  "gameplay": {{
    "objective": string,
    "primary_interaction": string,
    "win_condition": string,
    "loss_or_timeout_condition": string,
    "session_length_seconds": number
  }},
  "entities": [
    {{
      "id": string,
      "role": string,
      "asset": string | null,
      "behavior": string,
      "priority": "must" | "should" | "could"
    }}
  ],
  "asset_plan": [
    {{
      "asset_path": string,
      "use": string,
      "processing": string,
      "required": boolean
    }}
  ],
  "interaction_flow": [
    {{
      "step": number,
      "player_action": string,
      "system_response": string
    }}
  ],
  "parameters": [
    {{
      "name": string,
      "type": "number" | "boolean" | "string" | "choice",
      "default": string | number | boolean,
      "variation_range": string,
      "gameplay_effect": string
    }}
  ],
  "acceptance_criteria": string[],
  "non_goals_v1": string[]
}}
""".strip()
