# CLAUDE.md — proto-pipeline-m

This file is loaded into context for every Claude session in this folder. Read it before doing anything.

## Mission

Build a generic video → single-HTML playable pipeline. Inspired by `eliott-pipeline/proto-pipeline/` but a clean rewrite, not a fork. Goal: **benchmark prompt and spec-design variants for the hybrid codegen strategy**, on Castle Clashers gameplay videos. Assets are pre-given (no Scenario MCP in V1). Gemini for video AND codegen.

The full plan is in `PLAN.md`. This file is rules; `PLAN.md` is reasoning + phase breakdown.

## Locked decisions (do not re-debate)

- **Gemini for video AND codegen.** Sonnet 4.6 stays last-resort fallback only. Do not propose flipping to Claude primary; that decision is closed.
- **Hybrid codegen only**: fixed engine layer + per-genre template + LLM-authored creative slot. Not template-only, not free-gen.
- **MRAID 2.0 shim is non-negotiable** in every output. Engine layer owns it. Verify asserts it. Never a benchmark variable.
- **Multi-pass Gemini** for video extraction: 3 parallel calls (timeline, mechanics, visual_ui) + 1 merge. Not single-shot.
- **Bun runtime**, native TypeScript, native test runner.
- **Castle Clashers V1 corpus only**: `ressources/Video Example/B01.mp4` + `B11.mp4`, assets in `ressources/Castle Clashers Assets/`. No Scenario, no other games yet.
- **Verify loop is mandatory** after every codegen: 6 binary asserts via Playwright headless, up to 2 retries.
- **2D + 3D stays in scope** at architecture level, but 3D path is implemented only after 2D benchmark is green.
- **Phase-by-phase development.** No one-shot implementation. User reviews each phase before the next starts.

## Three-layer architecture

- **Engine layer** (`src/engine/`): generic, shared, hand-written. MRAID shim, Canvas2D bootstrap, input handler, asset loader, scaler. Never LLM-generated.
- **Template layer** (`src/templates/`): overfit-OK, one file per `template_id`. Each exports `assetSlots` (roles), `paramSchema` (typed), `render(spec, assets, params, creativeSlot): string`. Registry grows per game shipped.
- **Spec layer** (LLM-driven): Gemini multi-pass produces a typed `GameSpec` JSON. Spec contains `template_id`, `asset_role_map`, `params`, `creative_slot_prompt`. Validated against Zod schemas before being consumed downstream.

## Working rules

### Always

- Inject MRAID 2.0 shim into every HTML output.
- Use `assetSlots` by role (`hero`, `enemy_castle`, `projectile_player`); never hardcode filenames in template code.
- Validate every Gemini response against a Zod schema before passing it to the next stage.
- Keep system prompts in `prompts/*.md`, one file per call. The user reviews and tailors them before any first run.
- Run `bun run bench` after any pipeline-touching change; commit the resulting `outputs/<run>/scores.csv`.
- Phase-by-phase: complete one phase, run its checkpoint, commit, then propose the next phase. Update the phase tracker in `PLAN.md`.
- Reference Eliott's branch (`eliott-pipeline/proto-pipeline/`) for inspiration on structure and prompt shape, but rewrite cleanly here.

### Never

- Do not modify `eliott-pipeline/`. It is the stable Castle Clashers showcase branch.
- Do not add npm runtime deps to the generated HTML. Output must be self-contained, no CDN, no iframe, ≤5 MB.
- Do not pre-commit to a fixed template count. Add a template only when a new game requires it.
- Do not invent prompt edits silently. Diff the change in chat; user reviews; then write to disk.
- Do not skip the verify loop "to save time." Verify failure is a hard block; fix the pipeline, not the assertion.
- Do not include markdown wrappers in Gemini JSON responses; enforce `responseMimeType: application/json` and validate.
- Do not write multiple phases in one go. One phase per turn, with a checkpoint that user can run.

## Out of scope (V1)

Scenario MCP integration, audio generation, Next.js demo UI, 3D Three.js path, unseen-game corpus. All deferred until 2D + Castle Clashers benchmark batch is green.

## Commands

```sh
# Single end-to-end run
bun run pipeline --run <id> --video <path> --assets <dir> --variant <prompt-id>

# Verify a built HTML
bun run verify <html-path>

# Benchmark batch (V1: 3 prompt variants × 1–2 videos)
bun run bench --variants v1,v2,v3 --videos b01,b11

# List Gemini models
bun run pipeline --list-models
```

Exact CLI flag shapes are defined in `PLAN.md` Phase 0; if they drift, update `PLAN.md` first.

## Directory layout

```
proto-pipeline-m/
  src/
    engine/        MRAID shim, Canvas2D bootstrap, input, scaler
    templates/     towerDefense2d.ts (first), one file per template_id
    pipeline/      stages 0–6 (probe, sampling, gemini, spec, assets, codegen, verify)
    bench/         batch runner, scorer, harness
    schemas/       Zod schemas: GameSpec, gemini outputs, verify report
  prompts/         *.md, one per Gemini call; reviewed before use
  corpus/          symlinks/refs into ressources/ for videos and assets
  outputs/<run>/   per-run artifacts: spec.json, playable.html, scores.csv
  PLAN.md
  CLAUDE.md
```

## Style

- TypeScript ESM, strict mode, no `any` unless explicitly justified.
- No comments unless the WHY is non-obvious.
- No emojis in code, prompts, or generated output.
- French and English both fine in chat; code/identifiers in English.
- Imports use explicit `.ts` extensions (Bun-native).
- Prompts in Markdown, with a strict JSON schema block at the bottom.

## Quick links

- Architecture rationale and decision sheet: `~/.claude/projects/.../memory/project_architecture.md` (or ask user for a copy).
- Eliott's working pipeline (reference only): `eliott-pipeline/proto-pipeline/`.
- Test corpus: `ressources/Video Example/B01.mp4`, `B11.mp4`. Assets: `ressources/Castle Clashers Assets/`.
- Full plan and phase tracker: `PLAN.md` in this folder.
