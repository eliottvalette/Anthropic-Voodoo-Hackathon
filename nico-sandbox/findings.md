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
- `model_qwen-image-layered`: possible RGBA layer decomposition for structured character/object assets.
- `model_visioncortex-vtracer`: vectorization for clean UI/icons/projectiles.

## Missile Test Learning

- The B11 missile result was best when the video crop was used as reference evidence, not as final pixels.
- Direct Scenario background removal on the missile crop left visible wall/background contamination.
- The stronger chain is: Scenario Gemini 3.1 reference-guided sprite recreation, then Photoroom background removal, then Scenario padding trim.
- Gemini video selection should optimize for isolation, zoom, low blur, full visibility, and high contrast, not merely "first visible frame."
- For animation, use one approved seed frame and generate a whole strip at once; frame-by-frame generation risks identity and scale drift.
- Scenario REST docs indicate generation uses `/v1/generate/custom/{modelId}`, job polling uses `/v1/jobs/{jobId}`, and generated asset URLs come from `/v1/assets/{assetId}`.

## Product Direction

- The final tool should assume no provided source assets exist.
- The output should include every graphic asset class visible in the game video: backgrounds, castles/structures, units, weapons, projectiles, VFX, HUD/UI, logo/end-card/CTA, and animation-ready layer parts when possible.
- Browser playable output should prefer transparent PNG layers, atlases, SVGs, and `rig.json` over PSB as the runtime format.
