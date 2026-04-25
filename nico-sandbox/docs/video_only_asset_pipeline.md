# Video-Only Asset Recreation Pipeline

## Goal

Build a reusable tool that takes only a gameplay/ad video and outputs every graphic asset needed to recreate a polished browser playable ad.

The tool should not rely on provided game source assets. If source PNG/PSB files exist, they are only evaluation material. The production path is video-only.

## Success Criteria

- Detect every reusable visual asset visible in the video.
- Recover exact timestamps and screen locations for each asset candidate.
- Extract backgrounds and scene plates, not only foreground sprites.
- Convert weak video crops into clean, production-looking playable assets.
- Package outputs in browser-friendly formats: PNG, SVG where useful, texture atlas, JSON metadata, and rig data.
- Keep the output small enough for playable-ad constraints.

## Asset Coverage

The manifest should include these classes whenever they appear:

- Backgrounds: gameplay background, end-card background, sky/land/ground layers, parallax candidates.
- Structures and props: castles, towers, walls, carts, terrain props, obstacles.
- Characters and units: full cutouts, alternate poses, damage/death states, weapons attached to units.
- Character rig parts: body, head, arms, legs, held weapon, shadow, attachment points.
- Weapons and projectiles: cannons, rockets, bombs, shots, trails, aiming indicators.
- VFX: explosions, smoke, impact bursts, flashes, particles, glow, hit markers.
- UI/HUD: top bars, health bars, unit cards, counters, badges, selection states.
- Tutorial and input UI: hand cursor, drag arrow, aim line, tap indicators.
- End-card and CTA: logo, play button, fail/success banners, store-style CTA panels.
- Text treatments: important rendered words that need recreating as images or styled text.

## Pipeline

### One-Command Runner

The production entrypoint is:

```bash
.venv/bin/python nico-sandbox/scripts/run_full_asset_pipeline.py "<video_path>" --out nico-sandbox/runs/<video_id>
```

It runs:

```text
Gemini video inventory
-> local ffmpeg frame extraction
-> Gemini image box refinement
-> crop/debug/contact-sheet generation
-> per-asset factory routing
-> Scenario/Gemini recreation
-> final-assets/ package and manifests
```

Useful resume/debug flags:

```bash
--skip-video-gemini      reuse manifests/01_gemini_video_manifest.json
--skip-extraction        reuse manifests/03_extracted_assets_manifest.json
--dry-run-scenario       write the asset factory plan without spending Scenario credits
--asset-id <id>          run only one asset, can be passed multiple times
--limit <n>              process only the first n selected assets
--force                  regenerate assets even if a completed result exists
--stop-on-error          abort instead of checkpointing an asset error and continuing
```

The runner checkpoints after every asset in:

```text
runs/<video_id>/manifests/05_scenario_automation_manifest.json
```

### Proven Missile Flow

The B11 missile test showed the best default lane for small, compressed gameplay sprites:

1. Ask Gemini video analysis to find the moment where the target is most isolated, most zoomed-in, least blurred, and highest contrast. For projectiles, explicitly ask it to exclude smoke trails, launch puffs, hands, walls, impact VFX, and anything not physically part of the projectile.
2. Extract that exact frame locally with ffmpeg.
3. Ask Gemini image analysis for a tight box around only the target asset.
4. Crop the reference locally.
5. Upload the crop to Scenario.
6. Use `model_google-gemini-3-1-flash` with a reference-guided recreation prompt to generate clean sprite candidates.
7. Use `model_photoroom-background-removal` on the selected sprite candidate to get real alpha.
8. Use `model_scenario-padding-remover` to trim transparent padding.
9. Save the result under `final-assets/<category>/<asset_id>.png` and write Scenario job/asset IDs to the manifest.

This worked better than direct background removal from the video crop because the crop still contained brick-wall pixels. The strong version is: use the video crop as evidence, not necessarily as the final pixels.

### 1. Video Ingest

Input:

```text
source_video.mp4
```

Actions:

- Read resolution, duration, frame rate, and orientation.
- Create `runs/<video_id>/`.
- Upload video to Gemini.
- Ask Gemini for a structured inventory of all visible assets.

Gemini output should include:

- `asset_id`
- `category`
- `visual_description`
- `gameplay_role`
- `best_timestamp_s`
- `fallback_timestamps_s`
- `approx_box_2d` as `[ymin, xmin, ymax, xmax]` normalized to `0-1000`
- `recreation_strategy`
- `scenario_pipeline`
- `animation_notes`
- `background_plate_notes`
- `priority`

### 2. Exact Frame And Box Refinement

Actions:

- Extract frames locally at Gemini timestamps.
- Run Gemini image analysis on each frame for tighter boxes.
- Save debug overlays for human QA.

Outputs:

```text
runs/<video_id>/extracted/frames/
runs/<video_id>/extracted/crops/
runs/<video_id>/qa/debug-overlays/
runs/<video_id>/manifests/03_extracted_assets_manifest.json
```

Why local extraction matters:

Gemini is good at semantic video understanding, but deterministic local extraction is better for exact frame and crop reproducibility.

### 3. Background And Plate Recovery

Backgrounds should be treated as first-class assets.

For each scene:

- Capture the cleanest full-frame background plate.
- If characters or UI cover important regions, collect several nearby frames.
- Use segmentation or inpainting to remove foreground subjects when needed.
- Split layers when useful: sky, distant landscape, ground/platform, structures, foreground props.

Recommended outputs:

```text
backgrounds/gameplay_plate.png
backgrounds/endcard_plate.png
backgrounds/ground_layer.png
backgrounds/structure_layer.png
```

For playable ads, a faithful full plate is usually enough for speed. Layered backgrounds are useful when we want camera shake, parallax, or object reuse.

### B11 Background Learning

The B11 background smoke test worked well with the simple opaque-plate route:

```text
best background crop/frame -> Scenario Gemini 3.1 plate cleanup -> final opaque PNG
```

The successful output shape is:

```text
final-assets/backgrounds/bg_gameplay.png
```

Important details:

- Do not run alpha removal on backgrounds.
- Ask Gemini/Scenario to remove foreground characters, projectiles, UI, tutorial hands, and transient effects.
- Ask for a rectangular opaque gameplay plate, not a poster, not a logo scene, and not a transparent sprite.
- Keep background LoRA candidates available as A/B tests, but the default should remain the faithful `model_google-gemini-3-1-flash` plate cleanup until a LoRA clearly beats it.

### 4. Scenario Isolation And Enhancement

Use Scenario as the asset cleanup/recreation layer.

Model mapping:

| Need | Scenario model | Notes |
| --- | --- | --- |
| Reference-guided sprite recreation | `model_google-gemini-3-1-flash` | Default first pass for weak crops; generate 4 candidates for important assets. |
| Transparent cutout | `model_photoroom-background-removal` | Best current default after sprite recreation. |
| Transparent cutout alternate | `model_pixa-background-removal` | Fast backup for difficult edges. |
| Transparent padding trim | `model_scenario-padding-remover` | Final cleanup after alpha output. |
| Faithful upscaling | `model_upscale-v3` | Use `style: cartoon`, `preset: precise`, low `strength`. |
| Creative cleanup | `model_google-gemini-3-1-flash` | Use when video crop is too compressed, small, or attached to background. |
| Segmentation masks | `model_meta-sam-3-1-image` | Use text or boxes to split objects/parts. |
| Layer decomposition | `model_qwen-image-layered` | Candidate for character/object layer packs. |
| Vector output | `model_visioncortex-vtracer` | Best for simple UI, projectiles, icons, silhouettes. |

Default sprite recreation prompt:

```text
Using the reference crop, recreate ONLY this asset as a clean 2D mobile game sprite.
Preserve the source asset's silhouette, color family, proportions, camera angle, readable details, and casual mobile-game rendering style.
Improve video compression artifacts and make the asset crisp and production-quality.
Center the asset with comfortable transparent padding.
Remove everything that is not the asset: no background, wall, character, hand cursor, UI, smoke/trail/impact particles unless explicitly part of the target.
Use a transparent background PNG when supported. If transparency is not preserved, use a plain simple background that can be removed cleanly.
Do not add new objects or change the gameplay read.
```

Default background plate prompt:

```text
Using the reference frame/crop, recreate a clean gameplay background plate for the playable ad.
Preserve the original scene composition, camera angle, palette, lighting, and casual mobile-game art style.
Remove foreground characters, projectiles, UI, tutorial hands, and transient VFX when they cover the background.
Reconstruct hidden background details plausibly and keep the result seamless enough to sit behind gameplay.
Return an opaque rectangular background plate, not a transparent sprite.
```

Default sprite chain:

```text
crop -> Scenario upload -> Gemini 3.1 reference edit -> Photoroom background removal -> padding remover -> final PNG
```

Default background chain:

```text
full frame or plate crop -> Scenario upload -> Gemini 3.1 plate cleanup -> final opaque PNG
```

### 5. Character Animation Preparation

The runtime target should not depend on PSB.

Canonical runtime package:

```text
characters/<asset_id>/
  full.png
  parts/
    body.png
    head.png
    arm_front.png
    arm_back.png
    leg_front.png
    leg_back.png
    weapon.png
    shadow.png
  rig.json
```

`rig.json` should include:

- part file names
- anchor points
- pivot points
- draw order
- default transform
- suggested animations: idle, walk/bounce, shoot, hit, defeat

PSB can be exported later for artist editing, but the playable should use layered PNGs and JSON transforms because they are smaller and easier to animate in canvas.

### B11 Character Learning

The B11 skeleton test established the current best character route:

```text
best isolated character crop
-> Scenario Gemini 3.1 clean full-body seed
-> background removal with Photoroom, falling back to Pixa when needed
-> Scenario Gemini 3.1 generated 4x2 character parts sheet
-> local slicing into parts/*.png
-> emit rig.json
```

The successful package shape is:

```text
characters/<asset_id>/
  full.png
  parts_sheet.png
  parts/
    head.png
    body.png
    arm_front.png
    arm_back.png
    leg_front.png
    leg_back.png
    weapon.png
    shadow.png
  rig.json
  asset_manifest.json
```

This worked better than asking SAM to semantically extract body parts from the final character. `model_meta-sam-3-1-image` is useful for masks and broad object segmentation, but in this test it returned mask-like output and failed on most tiny semantic parts. The default should therefore be generated color parts from the clean seed, with SAM/Qwen kept as optional fallback/evidence tools.

Default character parts-sheet prompt:

```text
Using the clean full-body character reference, create a production-ready transparent character parts sheet for 2D playable animation.
Output one image with a 4-column by 2-row layout.
Slot order:
top row: head, body, arm_front, arm_back
bottom row: leg_front, leg_back, weapon, shadow
Preserve identity, palette, outline style, facing direction, weapon style, and proportions.
Draw usable color sprites, not white masks.
No labels, text, grid lines, scenery, UI, or full assembled character.
```

For animated objects, do not generate frames independently. Use one approved seed frame and ask Scenario Gemini for a complete strip in one edit request:

```text
Create a transparent sprite strip with N equal slots from this seed character.
Keep the same character, facing direction, silhouette, palette, outfit proportions, and weapon.
No scenery, labels, UI, or poster composition.
Use one consistent scale and anchor across all frames.
```

Then normalize the strip into fixed-size frames and emit `rig.json` or frame metadata. Character part extraction should use `model_meta-sam-3-1-image` or `model_qwen-image-layered` after the clean full-body seed exists.

### VFX Route

The default VFX route should be procedural instead of image-generation first:

```text
VFX crop -> Gemini visual/code analysis -> particle config JSON -> TypeScript helper -> browser preview
```

For the B11 explosion test, Gemini emitted a Phaser helper with generated smoke, debris, sparks, a crack decal, timing, and cleanup. This is preferable for playable ads because it avoids shipping extra sprite sheets and lets the gameplay code tune timing, position, scale, and blend modes.

Recommended output shape:

```text
vfx/<asset_id>/
  <asset_id>.json
  <asset_id>.ts
  preview.html
  asset_manifest.json
```

### 6. Asset Packaging

Once assets are clean:

- Trim transparent bounds.
- Normalize anchor points.
- Generate texture atlas when useful.
- Downscale to final display sizes.
- Convert simple UI/icons to SVG when it reduces file size.
- Emit a final manifest for the playable generator.

Recommended final structure:

```text
runs/<video_id>/final-assets/
  backgrounds/
  characters/
  projectiles/
  vfx/
  ui/
  atlas.png
  atlas.json
  asset_manifest.json
```

## Manifest Shape

```json
{
  "video_id": "B11",
  "source_video": "ressources/Video Example/B11.mp4",
  "assets": [
    {
      "asset_id": "character_unit_01",
      "category": "character",
      "role": "enemy unit",
      "source": {
        "timestamp_s": 5.4,
        "bbox_px": [850, 600, 1030, 880],
        "frame_path": "extracted/frames/character_unit_01_5.400s.png",
        "crop_path": "extracted/crops/character_unit_01.png"
      },
      "outputs": {
        "transparent_png": "scenario/transparent-png/character_unit_01.png",
        "enhanced_png": "final-assets/characters/character_unit_01/full.png",
        "rig": "final-assets/characters/character_unit_01/rig.json"
      },
      "recreation_strategy": "extract_cutout_then_upscale",
      "quality_notes": "Low source resolution; use precise cartoon upscale."
    }
  ]
}
```

## Quality Bar

Every accepted asset should pass these checks:

- Transparent sprites have clean alpha edges and no background blocks.
- Background plates cover the full playable viewport.
- UI text is legible on mobile.
- Recreated assets preserve the original game read: same silhouette, color family, and function.
- No asset is bigger than needed for its display size.
- Contact sheets make it easy to review the whole kit quickly.

## Open Implementation Work

- Add Gemini-based automatic variant QA so the tool can pick the best of 4 Scenario candidates without a human.
- Add SAM/Qwen-based character part segmentation.
- Add multi-frame background plate recovery and optional foreground removal/inpainting.
- Add final asset normalization and texture atlas export.
- Add a final `asset_manifest.json` consumed by the playable generator.

## Automation Notes

Scenario REST generation uses the unified custom generation endpoint:

```text
POST https://api.cloud.scenario.com/v1/generate/custom/{modelId}
GET  https://api.cloud.scenario.com/v1/jobs/{jobId}
GET  https://api.cloud.scenario.com/v1/assets/{assetId}
```

Images should be uploaded first to get a Scenario `assetId`. Small images use `/v1/assets`; larger files use `/v1/uploads`.

Required environment variables:

```text
GEMINI_API_KEY=
SCENARIO_API_KEY=
SCENARIO_API_SECRET=
SCENARIO_TEAM_ID=
SCENARIO_PROJECT_ID=
```

References:

- https://docs.scenario.com/docs/uploading-assets
- https://docs.scenario.com/docs/retrieve-asset-url-by-asset-id
- https://help.scenario.com/articles/3896230951-quick-start-universal-generation-video-audio-3d-image
