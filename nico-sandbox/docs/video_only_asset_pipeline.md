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

### 4. Scenario Isolation And Enhancement

Use Scenario as the asset cleanup/recreation layer.

Model mapping:

| Need | Scenario model | Notes |
| --- | --- | --- |
| Transparent cutout | `model_pixa-background-removal` | Fast RGBA output. |
| Transparent cutout alternate | `model_photoroom-background-removal` | Good backup for difficult edges. |
| Faithful upscaling | `model_upscale-v3` | Use `style: cartoon`, `preset: precise`, low `strength`. |
| Creative cleanup | `model_google-gemini-3-1-flash` or `model_p-image-editing` | Use when video crop is too compressed or small. |
| Segmentation masks | `model_meta-sam-3-1-image` | Use text or boxes to split objects/parts. |
| Vector output | `model_visioncortex-vtracer` | Best for simple UI, projectiles, icons, silhouettes. |

Default quality settings:

```json
{
  "model_id": "model_upscale-v3",
  "parameters": {
    "style": "cartoon",
    "upscaleFactor": 2,
    "preset": "precise",
    "strength": 0.1,
    "fractality": 0,
    "controlnetConditioningScale": 0.9,
    "prompt": "Clean mobile game asset, crisp black outline, preserve original silhouette and colors, remove video compression artifacts."
  }
}
```

Use a more creative pass only if extraction quality is too low:

```text
Recreate this cropped gameplay asset as a clean 2D mobile game sprite.
Preserve the pose, silhouette, colors, proportions, and camera angle.
Use crisp outlines, flat-shaded cartoon rendering, transparent background.
Do not add new objects.
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

- Add a Scenario enhancement batch step after initial crops.
- Add SAM-based character part segmentation.
- Add background plate recovery and optional foreground removal/inpainting.
- Add final asset normalization and texture atlas export.
- Add a final `asset_manifest.json` consumed by the playable generator.
