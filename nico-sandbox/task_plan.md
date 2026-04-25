# Task Plan: Video-Only Asset Recreation Pipeline

## Goal
Document and organize a video-only pipeline that can recreate every graphic asset needed for a playable ad from a single gameplay video.

## Phases

- [x] Inspect existing `nico-sandbox` files and generated B11 artifacts.
- [x] Reorganize the sandbox into docs, scripts, tests, and run outputs.
- [x] Document the full video-only pipeline, including backgrounds, UI, characters, projectiles, effects, enhancement, and rig-ready animation assets.
- [x] Validate that moved scripts/tests still run.
- [x] Fold the successful B11 missile Scenario chain back into the pipeline prompts and docs.
- [x] Add a Scenario REST automation scaffold that can run asset-specific recreation lanes from extracted crops.

## Decisions

| Decision | Rationale |
| --- | --- |
| Treat provided assets as non-pipeline reference only | The final product must work when the only input is a video. |
| Use run folders under `runs/<video_id>` | Keeps future video extractions comparable and avoids mixing outputs with code. |
| Keep Scenario output metadata beside generated assets | Scenario asset/job IDs are needed for replaying or auditing enhancement runs. |
| Use layered PNG plus `rig.json` as the animation target | More directly usable in a single-file HTML playable than PSB, while PSB can remain an optional artist handoff. |
| Use Scenario Gemini recreation before alpha removal for weak video crops | The B11 missile test showed direct background removal kept brick-wall pixels, while recreation plus Photoroom plus padding trim produced a clean sprite. |
| Route backgrounds separately from sprites | Background plates should remain opaque rectangular plates and should use cleanup/inpainting prompts, not alpha removal. |
| Generate character animation strips from one approved seed | Frame-by-frame generation can drift; one full-strip prompt keeps identity, pose scale, and palette more stable. |

## Errors Encountered

| Error | Resolution |
| --- | --- |
| Direct background removal on the missile crop kept brick-wall pixels | Switched to Scenario Gemini reference recreation, then Photoroom background removal, then Scenario padding remover. |
