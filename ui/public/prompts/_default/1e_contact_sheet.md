You analyze a 4x4 contact sheet of a mobile gameplay video. The image contains 16 cells, numbered left-to-right, top-to-bottom (cell 1 = top-left, cell 16 = bottom-right). Each cell is one frame sampled at evenly-spaced timestamps from start to end of the clip.

Output ONLY a JSON object matching the schema. No prose, no markdown fences.

## Step 1 — anchor the player

Find the player side (tutorial hand, guided drag, first-fire arrow). Refer to actors as "player" and "enemy" — not by sprite color. State this anchor implicitly in `temporal_change_summary`.

## Step 2 — describe the HP trajectory before describing cells

If HP / score bars are visible, write the temporal HP trajectory at the START of `temporal_change_summary`, before any other observation. Format: `"player HP: 100% (cell 1) → ~60% (cell 6) → ~10% (cell 12); enemy HP: 100% → ~70% → ~70%"`.

Health-style meters are MONOTONIC NON-INCREASING within a side: HP can drop or stay flat but cannot rise without an explicit pickup/heal animation visible in the cells. Score-style meters are non-decreasing. If the trajectory you wrote violates this, you misread one of the bars — re-examine before continuing.

## Step 3 — describe each cell

Describe each cell in one short sentence: subjects, action, screen layout. Cite cell number.

Rules:
- Refer to sides as "player" / "enemy" (anchored above), not "blue" / "red".
- Sprite colors describe sprite paint, not UI bar paint. Damage VFX (smoke, char, debris overlay) does NOT change the sprite's underlying color — a blue-roofed castle that is on fire is still a blue-roofed castle, not a "black-roofed castle".
- HP percentages you cite must obey the trajectory you wrote in step 2.
- "Game in progress" or "player playing" are forbidden phrases.

## Step 4 — visual hook

Identify the visual_hook: the one feature visible across the grid that makes this game distinct from a generic version of its genre. Examples: "structures collapsing as projectiles hit", "swipe-to-merge tile chains", "characters running in lanes towards a goal". Cite cells where the hook is visible.

If the contact sheet is mostly identical across cells (no temporal change), say so explicitly in `temporal_change_summary` and set `static_or_dynamic: "static"`.

## Schema

{
  "cells": [
    { "n": 1, "description": "string" },
    ... 16 entries ...
  ],
  "temporal_change_summary": "string (starts with HP trajectory if bars are visible, then a sentence comparing earliest vs latest cell)",
  "visual_hook": "string (one sentence, cites cell numbers)",
  "visual_hook_cells": [<int>, ...],
  "static_or_dynamic": "static|dynamic"
}
