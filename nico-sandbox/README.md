# Nico Sandbox

Workspace for the video-only playable-ad asset pipeline.

The core assumption is strict: the tool receives only a gameplay/ad video and must recreate the graphic asset kit from that video. Provided source assets may be used for evaluation during development, but they are not part of the production pipeline.

## Folder Layout

```text
nico-sandbox/
  docs/                         Pipeline and product documentation
  scripts/                      Reusable extraction/recreation scripts
  tests/                        Unit tests for pipeline helpers
  runs/<video_id>/              Outputs for one source video
    manifests/                  Gemini, Scenario, and final asset manifests
    extracted/
      frames/                   Timestamped source frames
      crops/                    Local crops before Scenario enhancement
    scenario/
      transparent-png/          Scenario-generated alpha PNGs
      gemini-sprite/            Scenario Gemini recreated sprite candidates
      gemini-sprite-transparent/ Final alpha candidates before trim
    final-assets/               Fully recreated assets for playable generation
    previews/                   Contact sheets and visual QA summaries
    qa/
      debug-overlays/           Bounding box review images
  archive/                      Non-pipeline references and old scratch artifacts
```

## Current Run

`runs/B11` contains the first end-to-end extraction from:

```text
ressources/Video Example/B11.mp4
```

Key files:

- `runs/B11/manifests/01_gemini_video_manifest.json`
- `runs/B11/manifests/03_extracted_assets_manifest.json`
- `runs/B11/manifests/04_scenario_manifest.json`
- `runs/B11/previews/extracted_assets_contact_sheet.png`
- `runs/B11/previews/scenario_transparent_png_contact_sheet.png`

## Run The Extractor

From the repository root:

Run the full video-to-asset-kit pipeline:

```bash
.venv/bin/python nico-sandbox/scripts/run_full_asset_pipeline.py "ressources/Video Example/B11.mp4" --out nico-sandbox/runs/B11_full
```

For a long full-quality run, use `--resolution 1K --num-outputs 4`. The script checkpoints after every processed asset in `manifests/05_scenario_automation_manifest.json`, so it can be resumed. Use `--force` only when you want to regenerate completed assets.

Dry-run the Scenario/Gemini asset factory plan from existing B11 crops:

```bash
.venv/bin/python nico-sandbox/scripts/run_full_asset_pipeline.py "ressources/Video Example/B11.mp4" --out nico-sandbox/runs/B11 --skip-extraction --dry-run-scenario
```

Run only the extraction stage manually:

```bash
.venv/bin/python nico-sandbox/scripts/asset_pipeline.py --video "ressources/Video Example/B11.mp4" --out nico-sandbox/runs/B11
```

To reuse an existing Gemini video manifest and only redo frames/crops/refinement:

```bash
.venv/bin/python nico-sandbox/scripts/asset_pipeline.py --skip-video-gemini --video "ressources/Video Example/B11.mp4" --out nico-sandbox/runs/B11
```

Run the Scenario automation pass after crops exist:

```bash
.venv/bin/python nico-sandbox/scripts/scenario_automation.py --run nico-sandbox/runs/B11
```

Dry-run the Scenario plan without spending credits:

```bash
.venv/bin/python nico-sandbox/scripts/scenario_automation.py --run nico-sandbox/runs/B11 --dry-run
```

Target one extracted asset:

```bash
.venv/bin/python nico-sandbox/scripts/scenario_automation.py --run nico-sandbox/runs/B11 --asset-id proj_missile
```

The current default sprite lane is the B11 missile-proven chain:

```text
Gemini video selection -> local frame/crop -> Scenario Gemini reference recreation -> Photoroom/Pixa alpha -> padding trim
```

Backgrounds use an opaque plate-cleanup prompt instead of alpha removal.

Characters now use the B11 skeleton-proven route:

```text
clean full-body seed -> generated 4x2 parts sheet -> local part slicing -> rig.json
```

VFX use a procedural route by default:

```text
Gemini VFX analysis -> particle config JSON -> TypeScript helper -> preview.html
```

Open the current explosion preview at:

```text
runs/B11/final-assets/vfx/vfx_explosion/preview.html
```

## Validate

```bash
.venv/bin/python -m unittest discover -s nico-sandbox/tests -p "test_*.py"
.venv/bin/python -m py_compile nico-sandbox/scripts/asset_pipeline.py nico-sandbox/scripts/extract_target_asset.py nico-sandbox/scripts/asset_factories.py nico-sandbox/scripts/scenario_automation.py nico-sandbox/scripts/run_full_asset_pipeline.py nico-sandbox/tests/test_asset_pipeline.py nico-sandbox/tests/test_asset_factories.py
```
