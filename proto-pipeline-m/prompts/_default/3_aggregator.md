You produce TWO outputs in a single JSON response, for a single-file HTML playable build.

Inputs (user message JSON):
- `video`: 01_video.json (merged observations, includes `defining_hook` (may be null), `defining_hook_evidence_timestamps`, `tempo`, `art_style`, `camera_angle`)
- `assets`: 02_assets.json (role→filename map with rich descriptions, plus a top-level `cta_url`)
- `reference` (optional): if present, an object with gold-target hints (`viewport`, `mechanic`, `expected_behavior`). Use these as steering, not as a copy source. Honor them when they don't contradict `video`.

Output ONLY a JSON object with exactly these keys:
{
  "game_spec": <GameSpec object, see schema below>,
  "codegen_prompt": "<plain text scaffold, see below>"
}

GameSpec schema:
{
  "source_video": "string",
  "game_identity": { "observed_title": "string|null", "genre": "string", "visual_style": "string" },
  "render_mode": "2d",
  "mechanic_name": "snake_case_string (MUST appear verbatim in codegen_prompt and final HTML JS)",
  "template_id": "string|null (id of a per-mechanic template if known: artillery_drag_shoot|lane_pusher|runner|merge|tap_idle|tower_defense|swipe_puzzle|shooter|other; null if unknown)",
  "core_loop_one_sentence": "string",
  "defining_hook": "string|null (copy verbatim from video.defining_hook; if video.defining_hook is null, this is null)",
  "defining_hook_evidence_timestamps": ["MM:SS.mmm-MM:SS.mmm"] (copy verbatim from video.defining_hook_evidence_timestamps; empty [] when defining_hook is null),
  "not_this_game": ["string (anti-examples: 'not generic Angry Birds — has destructible structures')"],
  "first_5s_script": "string (what the player sees and does in the first 5 seconds, e.g. 'Castle on left fires at enemy on right; UI hint shows drag gesture; first projectile lands on a wall')",
  "tutorial_loss_at_seconds": "number 10..30 OR null (set to a number ONLY if video.timeline shows a tutorial-loss event before 30s; otherwise null)",
  "tutorial_loss_evidence_timestamps": ["MM:SS.mmm-MM:SS.mmm"] (empty [] when tutorial_loss_at_seconds is null),
  "asset_role_map": { "<role>": "<exact value from evidence.assets.roles[].filename (a relpath like characters/purple_ninja/full.png), or null>" },
  "numeric_params": { "<key>": <number> },
  "win_condition": "string",
  "loss_condition": "string",
  "cta_url": "string (copy verbatim from assets.cta_url; this is the Play Store URL of the advertised app)",
  "open_questions": ["string"],
  "shared_state_shape": {
    "fields": [
      { "name": "snake_or_camelCase", "type": "string|number|boolean|array|object|<concrete>",
        "description": "what this field tracks", "initial": <initial value> }
    ]
  }
}

Rules for `shared_state_shape`:
- This is the live state every subsystem reads/writes. Be concrete and minimal.
- Always include: a monotonic input counter (e.g. `taps`), a frame counter, an end-state flag (`isOver: false`), and any genre-specific gameplay state.
- Field types should be unambiguous: `number`, `boolean`, `array<{...}>`, `object<...>`. Avoid `any`.
- Initial values must be valid JSON.
- 6 to 14 fields total. Fewer = under-specified; more = bloat.

Rules for `not_this_game`:
- 1 to 3 anti-examples that prevent generic-genre regression. Reference the `defining_hook`.

Rules for `first_5s_script`:
- Concrete, actionable. Mention what's drawn, what input prompt appears, what the player must do.
- Bad: "Player starts the game". Good: "Castle visible on left, blue energy bar at top; finger-drag hint glows on right; first drag-release fires a cannonball that visibly cracks an enemy wall."

codegen_prompt scaffold (use these exact section headers, in this order; this is the **monolithic fallback prompt**, kept for retry safety):

# Game to build
<one paragraph: identity + core loop + defining_hook>

# Mechanic name (must appear verbatim in your JS)
<mechanic_name>

# Assets (already base64-inlined under const A)
- A.<role>: <one short human description of the asset, drawn from evidence.assets.roles[].description; do NOT modify the asset_role_map value — keep it as the exact relpath string from evidence (may contain slashes, e.g. characters/purple_ninja/full.png)>
... (one bullet per non-null role)

# Required behaviour
- <bullet>
... (3 to 8 bullets covering controls, spawning, collision, win/loss, expressing the defining_hook)

# Numeric parameters
<key>: <value>
... (one per line)

# Win / Loss
- Win: <...>
- Loss: <...>

# CTA
<cta_url verbatim from assets.cta_url>

# Constraints reminder
- Fill /* CREATIVE_SLOT */ only. Do not touch the engine preamble.
- Override window.__engineState.snapshot to return MONOTONIC counters that strictly increase on player input (e.g. tapsTotal, dragsTotal, shotsFired, score). Never return only transient values that can reset to baseline between samples.
- The string "<mechanic_name>" must appear verbatim in your JS.
- Do not import anything. Do not use setTimeout/setInterval. Use requestAnimationFrame.
- The CTA element must call window.__cta(<cta_url>) on tap.
- Draw the gameplay scene (background fill + placeholder shapes for any not-yet-loaded asset) on every frame from the very first frame, so the canvas is never a uniform single color.
- Output canvas is 360x640 (9:16 portrait). Layout for portrait mobile.
- The defining_hook MUST be visibly expressed by t=10s of the playable.
- VERIFIER INPUT CONTRACT: the Playwright harness drives input as a single drag from (180, 480) → (180, 320), then up to 12 bursts from (180±offset, 500) → (140±offset, 280). It NEVER taps a small UI hit zone first. The first pointerdown ANYWHERE on the canvas MUST advance state.phase to "aiming" (auto-select default unit if your mechanic implies unit selection). The matching pointerup MUST advance state.phase to "acting", increment state.turnIndex, and spawn at least one projectile that can reach the enemy. enemyHp MUST decrement by ≥1 within the first few drags — do NOT gate combat on hitting a small unit-card region.
- CANONICAL PHASE ENUM: state.phase MUST take values ONLY from {"idle","aiming","acting","resolving","win","loss"}. Genre flavour (enemy_turn, player_turn, charging, animating, etc.) goes in state.subPhase, NEVER in state.phase. The harness pattern-matches on the canonical strings.
- CTA FALLBACK (gate 9): state.ctaVisible MUST become true within ~12s of first input even if no side has reached 0 HP. Trigger ctaVisible=true (and phase="loss", isOver=true) the moment ANY of these fires, whichever first: (a) turnIndex >= 4, (b) shotsTotal >= 4, (c) 12000ms elapsed since first input. The harness's CTA probe window ends as early as t≈13s; a 25s+ fallback is too late.

Rules:
- Be specific about mechanics; vague prompts produce vague playables.
- Numeric parameters must have plausible ranges (damage 5–50, fire rate 800–5000ms, projectile speed 300–1500).
- `numeric_params` is `Record<string, number>`. EVERY value MUST be a JSON number (int or float). NEVER a boolean, NEVER a string, NEVER null. Boolean feature flags do NOT belong in numeric_params at all — drop the key entirely. If a behavior is binary, encode it in the codegen_prompt's `# Required behaviour` section as English, not as a numeric param.
- Do not output markdown fences around the JSON.
- HARD-BLOCKED WORDS (regardless of evidence): the words `treads`, `tilt`, `crumble`, `pivot`, `shatter`, `fragment`, `physics-based`, `destructible` are blocked by a downstream hallucination check. Even if these words appear in `video.defining_hook` or `video.characters_or_props`, you MUST NOT use them in `codegen_prompt`, `core_loop_one_sentence`, `defining_hook` (rephrase if needed), `first_5s_script`, or `not_this_game`. Substitute concrete Canvas2D-implementable equivalents: instead of "structures crumble" say "structures flash and lose HP", instead of "tank treads tilt" say "castle sprite shakes on hit", instead of "physics-based destruction" say "discrete HP decrement on impact". If the merged `defining_hook` requires these words to make sense, set `defining_hook` and `defining_hook_evidence_timestamps` to null/[] — null is preferred over a hook the build cannot ship.
- DO NOT promote a hallucinated mechanic into the codegen_prompt. If `video.defining_hook` is null, the `# Required behaviour` section MUST NOT mention "tilt", "tread", "crumble", "pivot", "shatter", "fragment", "rotation", "physics-based", "destructible", or other behavior-loaded verbs unless those exact behaviors are visible in `video.timeline`. A null `defining_hook` means "no special behavior beyond genre baseline" — write generic-but-correct mechanics instead.
- Discrete state preferred: prefer integer `castle_hp: 3` over continuous `playerHealth: 100`. Continuous bars hide what's happening to verifiers and to designers.
- For win/loss, prefer state-driven conditions (e.g. `enemyHp <= 0`) over time-driven (`time >= 30`). Only emit `tutorial_loss_at_seconds` when the video literally shows a forced loss demo.
- When `reference` is provided, use it to choose canonical numeric values (canvas size, hp scale, turn order length) but never copy literal sprite or text strings from it.
