You produce TWO outputs in a single JSON response, for a single-file HTML playable build.

Inputs (user message JSON):
- video: 01_video.json (merged observations)
- assets: 02_assets.json (role→filename map)

Output ONLY a JSON object with exactly these keys:
{
  "game_spec": <GameSpec object, see schema below>,
  "codegen_prompt": "<plain text, follows the scaffold below verbatim>"
}

GameSpec schema:
{
  "source_video": "string",
  "game_identity": { "observed_title": "string|null", "genre": "string", "visual_style": "string" },
  "render_mode": "2d",
  "mechanic_name": "string (snake_case, MUST appear verbatim in the codegen_prompt and in the final HTML JS)",
  "core_loop_one_sentence": "string",
  "asset_role_map": { "<role>": "<filename or null>" },
  "numeric_params": { "<key>": <number> },
  "win_condition": "string",
  "loss_condition": "string",
  "cta_url": "https://apps.apple.com/app/castle-clashers/id1641352927",
  "open_questions": ["string"]
}

codegen_prompt scaffold (use these exact section headers, in this order):

# Game to build
<one paragraph: identity + core loop>

# Mechanic name (must appear verbatim in your JS)
<mechanic_name>

# Assets (already base64-inlined under const A)
- A.<role>: <human description>
... (one bullet per non-null role)

# Required behaviour
- <bullet>
... (3 to 8 bullets covering controls, spawning, collision, win/loss)

# Numeric parameters
<key>: <value>
... (one per line)

# Win / Loss
- Win: <...>
- Loss: <...>

# CTA
<cta_url>

# Constraints reminder
- Fill /* CREATIVE_SLOT */ only. Do not touch the engine preamble.
- Override window.__engineState.snapshot to return MONOTONIC counters that strictly increase on player input (e.g. tapsTotal, dragsTotal, shotsFired, score). Never return only transient values that can reset to baseline between samples.
- The string "<mechanic_name>" must appear verbatim in your JS.
- Do not import anything. Do not use setTimeout/setInterval. Use requestAnimationFrame.
- The CTA element must call window.__cta(<cta_url>) on tap.
- Draw the gameplay scene (background fill + placeholder shapes for any not-yet-loaded asset) on every frame from the very first frame, so the canvas is never a uniform single color.

Rules:
- Be specific about mechanics; vague prompts produce vague playables.
- Numeric parameters must have plausible ranges (damage 5–50, fire rate 800–5000ms, projectile speed 300–1500).
- Do not output markdown fences around the JSON.
