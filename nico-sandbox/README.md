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

```bash
.venv/bin/python nico-sandbox/scripts/asset_pipeline.py --video "ressources/Video Example/B11.mp4" --out nico-sandbox/runs/B11
```

To reuse an existing Gemini video manifest and only redo frames/crops/refinement:

```bash
.venv/bin/python nico-sandbox/scripts/asset_pipeline.py --skip-video-gemini --video "ressources/Video Example/B11.mp4" --out nico-sandbox/runs/B11
```

## Validate

```bash
.venv/bin/python -m unittest discover -s nico-sandbox/tests -p "test_*.py"
.venv/bin/python -m py_compile nico-sandbox/scripts/asset_pipeline.py nico-sandbox/tests/test_asset_pipeline.py
```
