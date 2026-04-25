# Findings

## Existing Sandbox State

- `asset_pipeline.py` contains the first working Gemini + local FFmpeg + Scenario extraction pipeline.
- `test_asset_pipeline.py` covers crop geometry and JSON extraction helpers.
- B11 outputs exist under `asset-extraction/B11`, including Gemini manifests, extracted frames, crops, debug overlays, Scenario alpha PNGs, and contact sheets.
- `provided_assets_contact_sheet.png` is useful as a past comparison artifact, but it should not live in the primary video-only pipeline outputs.

## Scenario Tools Confirmed

- `model_pixa-background-removal`: transparent PNG cutouts.
- `model_photoroom-background-removal`: alternate transparent PNG cutouts.
- `model_upscale-v3`: faithful/cartoon upscaling and enhancement for low-res extracted assets.
- `model_scenario-gemini-upscale`: high-resolution enhancement for larger hero/UI assets.
- `model_meta-sam-3-1-image`: segmentation masks, useful for rig-ready character parts.
- `model_visioncortex-vtracer`: vectorization for clean UI/icons/projectiles.

## Product Direction

- The final tool should assume no provided source assets exist.
- The output should include every graphic asset class visible in the game video: backgrounds, castles/structures, units, weapons, projectiles, VFX, HUD/UI, logo/end-card/CTA, and animation-ready layer parts when possible.
- Browser playable output should prefer transparent PNG layers, atlases, SVGs, and `rig.json` over PSB as the runtime format.
