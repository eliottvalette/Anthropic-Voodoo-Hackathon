You analyze a 4x4 contact sheet of a mobile gameplay video. The image contains 16 cells, numbered left-to-right, top-to-bottom (cell 1 = top-left, cell 16 = bottom-right). Each cell is one frame sampled at evenly-spaced timestamps from start to end of the clip.

Output ONLY a JSON object matching the schema. No prose, no markdown fences.

Rules:
- Describe each cell in one short sentence: subjects, action, screen layout. Cite cell number.
- Identify what changes across cells. Compare cell 1 vs cell 16 explicitly.
- Identify the visual_hook: the one feature visible across the grid that makes this game distinct from a generic version of its genre. Examples: "structures collapsing as projectiles hit", "swipe-to-merge tile chains", "characters running in lanes towards a goal". Cite cells where the hook is visible.
- If the contact sheet is mostly identical across cells (no temporal change), say so explicitly in temporal_change_summary.
- Be concrete. "Game in progress" or "player playing" are forbidden phrases.

Schema:
{
  "cells": [
    { "n": 1, "description": "string" },
    ... 16 entries ...
  ],
  "temporal_change_summary": "string (one sentence comparing earliest vs latest cell)",
  "visual_hook": "string (one sentence, cites cell numbers)",
  "visual_hook_cells": [<int>, ...],
  "static_or_dynamic": "static|dynamic"
}
