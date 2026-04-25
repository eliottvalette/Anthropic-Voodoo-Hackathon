# Progress

## 2026-04-25

- Confirmed the user wants a video-only asset recreation pipeline.
- Inspected current `nico-sandbox` layout.
- Started reorganizing around durable docs, source scripts, tests, and repeatable run outputs.
- Moved code to `scripts/` and tests to `tests/`.
- Moved B11 outputs to `runs/B11/` with `manifests/`, `extracted/`, `scenario/`, `previews/`, and `qa/`.
- Archived the provided-assets comparison sheet outside the main run path.
- Added pipeline documentation in `docs/video_only_asset_pipeline.md`.
- Validation passed with `unittest` and `py_compile`.
- Ran the focused B11 missile test. Gemini selected `9.25s`; direct Scenario background removal was not enough because it kept wall pixels.
- Found the stronger missile chain: local crop -> Scenario Gemini 3.1 reference recreation -> Photoroom background removal -> Scenario padding remover.
- Saved the final missile asset to `runs/B11_missile_focus/final/missile.png` and its manifest to `runs/B11_missile_focus/manifests/04_missile_scenario_manifest.json`.
- Updated the pipeline docs and Gemini prompts to prefer isolation/zoom/low-blur selection and the reference-recreation-first Scenario lane for small sprites.
- Added `scripts/scenario_automation.py` as the first headless Scenario REST automation pass for extracted crops.
- Added Scenario API configuration placeholders to `.env.example` and configured the Project E220 Scenario IDs in `.env`.
- Added `scripts/asset_factories.py` to route extracted assets into static sprites, character rigs, procedural VFX, background plates, and UI assets.
- Validated B11 smoke routes for `char_skeleton`, `vfx_explosion`, and `bg_gameplay`.
- Confirmed the best character route is clean full-body seed -> generated 4x2 parts sheet -> local slicing -> `parts/*.png` plus `rig.json`; direct SAM semantic part extraction was unreliable for the tiny skeleton.
- Confirmed the background route should produce an opaque cleaned gameplay plate with no alpha removal.
- Confirmed VFX can be emitted as procedural Phaser TypeScript plus JSON config; added a local preview HTML for the B11 explosion.
- Added Pixa background removal as fallback when Photoroom quota is exhausted.
- Added `scripts/run_full_asset_pipeline.py`, the one-command video path entrypoint that runs Gemini inventory/extraction and all per-asset Scenario/Gemini factory routes with checkpointed manifests.
