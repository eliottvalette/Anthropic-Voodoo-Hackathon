"""
Re-run Gemini video analysis for specific missing assets the user flagged.

Usage:
  python reanalyze_for_missing_assets.py --run <run_dir> --hint "..." [--video <path>]

This script:
  1. Uploads (or re-uploads) the source video to Gemini.
  2. Asks Gemini to find ONLY the assets the user describes — same schema as the full
     analysis so the new entries merge cleanly into 01_gemini_video_manifest.json.
  3. Appends new assets (skipping duplicate asset_ids) and re-runs extraction so
     03_extracted_assets_manifest.json gains the new crops.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from google.genai import types

import asset_pipeline


REANALYZE_PROMPT_TEMPLATE = """
You analyzed this gameplay video before and produced an asset inventory. The user reports that
some assets were MISSED during the first pass. Your job now is to scan the video again and find
ONLY the assets described below — return them as new entries using the SAME schema as the full
inventory, so they can be appended to the existing manifest.

USER HINT (assets the analyzer missed):
{hint}

Already-known asset_ids (do NOT return entries for these — they are already covered):
{known_ids}

Rules:
- Return ONLY new assets that match the user hint and are clearly visible somewhere in the video.
- Use unique snake_case asset_ids that do not collide with the known list above.
- Apply the same STYLE LOCK already established for this game: every visual_description must
  match the global art style of the video. Do not introduce off-style assets.
- Use the same fields and rules as the original full inventory:
  best_timestamp_s, fallback_timestamps_s, approx_box_2d ([ymin,xmin,ymax,xmax] 0-1000),
  category, recreation_strategy, scenario_pipeline, animation_notes, animated_parts,
  background_plate_notes, priority, isolate_with_background_removal.
- If the user describes something you cannot find, return zero entries rather than hallucinate.
""".strip()


REANALYZE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "assets": asset_pipeline.MANIFEST_SCHEMA["properties"]["assets"],
    },
    "required": ["assets"],
}


def find_video_path(run_dir: Path, override: Path | None) -> Path:
    if override:
        return override.resolve()
    candidates = [run_dir / "source.mp4", run_dir / "source.mov", run_dir / "source.webm"]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"No source video found in {run_dir}; pass --video.")


def run_gemini(video_path: Path, hint: str, known_ids: list[str]) -> dict[str, Any]:
    asset_pipeline.load_dotenv(asset_pipeline.ROOT / ".env")
    client = asset_pipeline.gemini_client()
    uploaded = client.files.upload(
        file=str(video_path),
        config=types.UploadFileConfig(mimeType="video/mp4", displayName=video_path.name),
    )
    uploaded = asset_pipeline.wait_for_file(client, uploaded.name)
    part = types.Part(
        fileData=types.FileData(fileUri=uploaded.uri, mimeType=uploaded.mime_type or "video/mp4"),
        videoMetadata=types.VideoMetadata(fps=5.0),
    )
    config = types.GenerateContentConfig(
        responseMimeType="application/json",
        responseJsonSchema=REANALYZE_SCHEMA,
        mediaResolution=types.MediaResolution.MEDIA_RESOLUTION_HIGH,
        temperature=0.2,
        maxOutputTokens=8000,
    )
    prompt = REANALYZE_PROMPT_TEMPLATE.format(
        hint=hint.strip() or "(none)",
        known_ids=", ".join(known_ids) or "(none)",
    )
    _model, response = asset_pipeline.call_model_with_fallback(
        client,
        asset_pipeline.VIDEO_MODELS,
        contents=[part, prompt],
        config=config,
    )
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, dict):
        return parsed
    return json.loads(asset_pipeline.extract_json_payload(response.text or "{}"))


def merge_into_manifest(run_dir: Path, new_assets: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    manifest_path = run_dir / "manifests" / "01_gemini_video_manifest.json"
    payload = asset_pipeline.read_json(manifest_path)
    existing = list(payload.get("assets", []))
    known_ids = {str(asset.get("asset_id")) for asset in existing}
    appended: list[dict[str, Any]] = []
    for asset in new_assets:
        asset_id = str(asset.get("asset_id", "")).strip()
        if not asset_id or asset_id in known_ids:
            continue
        existing.append(asset)
        known_ids.add(asset_id)
        appended.append(asset)
    payload["assets"] = existing
    asset_pipeline.write_json(manifest_path, payload)
    return payload, appended


def re_extract_for_new_assets(run_dir: Path, full_manifest: dict[str, Any], new_assets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not new_assets:
        return []
    video_path = find_video_path(run_dir, None)
    targeted = dict(full_manifest)
    targeted["assets"] = new_assets
    new_extracted = asset_pipeline.extract_candidates(targeted, video_path, run_dir, refine=True)

    extracted_path = run_dir / "manifests" / "03_extracted_assets_manifest.json"
    if extracted_path.exists():
        prior = asset_pipeline.read_json(extracted_path)
        prior_assets = list(prior.get("assets", []))
        prior_ids = {str(asset.get("asset_id")) for asset in prior_assets}
        merged = prior_assets + [asset for asset in new_extracted if str(asset.get("asset_id")) not in prior_ids]
        prior["assets"] = merged
        asset_pipeline.write_json(extracted_path, prior)
    return new_extracted


def main() -> None:
    parser = argparse.ArgumentParser(description="Targeted Gemini re-analysis for missed assets.")
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--hint", type=str, required=True, help="User-provided description of missing assets.")
    parser.add_argument("--video", type=Path, default=None, help="Override the source video path.")
    args = parser.parse_args()

    run_dir = args.run.resolve()
    video_path = find_video_path(run_dir, args.video)
    manifest_path = run_dir / "manifests" / "01_gemini_video_manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Cannot reanalyze without a base manifest at {manifest_path}")

    base = asset_pipeline.read_json(manifest_path)
    known_ids = [str(asset.get("asset_id")) for asset in base.get("assets", []) if asset.get("asset_id")]

    response = run_gemini(video_path, args.hint, known_ids)
    new_assets = list(response.get("assets", []))
    print(f"[reanalyze] Gemini returned {len(new_assets)} new asset entr{'y' if len(new_assets) == 1 else 'ies'}")

    full_manifest, appended = merge_into_manifest(run_dir, new_assets)
    print(f"[reanalyze] Appended {len(appended)} new asset(s) to manifest")
    extracted = re_extract_for_new_assets(run_dir, full_manifest, appended)
    print(json.dumps({"appended": [asset.get("asset_id") for asset in appended], "extracted": len(extracted)}))


if __name__ == "__main__":
    main()
