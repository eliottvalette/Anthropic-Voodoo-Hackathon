# B11 Run

Video-only extraction run for:

```text
ressources/Video Example/B11.mp4
```

## What Is Here

```text
manifests/
  01_gemini_video_manifest.json        Gemini's video-level asset inventory
  02_gemini_frame_refinement/          Gemini image-level box refinement per asset
  03_extracted_assets_manifest.json    Local frame/crop/debug output manifest
  04_scenario_manifest.json            Scenario upload/job/output IDs

extracted/
  frames/                              Exact video frames at selected timestamps
  crops/                               Local asset crops before Scenario processing

scenario/
  transparent-png/                     Scenario background-removed sprites

previews/
  extracted_assets_contact_sheet.png   All local crop candidates
  scenario_transparent_png_contact_sheet.png
                                      Scenario alpha output preview

qa/
  debug-overlays/                      Bounding box overlays for QA
```

## Current Status

- Gemini found 20 graphic asset candidates.
- Local extraction produced frames, crops, and debug overlays.
- Scenario has produced transparent PNGs for 3 character candidates.
- Backgrounds and UI are present as crops, but still need the next enhancement/cleanup pass.

## Important

This run is now organized as video-only output. The old provided-asset comparison sheet was moved to:

```text
nico-sandbox/archive/provided-assets-comparison/
```
