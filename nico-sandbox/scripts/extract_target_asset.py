from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from google.genai import types
from PIL import Image, ImageDraw

import asset_pipeline


TARGET_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "target": {"type": "string"},
        "selection_criteria": {"type": "string"},
        "candidates": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "asset_id": {"type": "string"},
                    "name": {"type": "string"},
                    "timestamp_s": {"type": "number"},
                    "approx_box_2d": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "minItems": 4,
                        "maxItems": 4,
                        "description": "[ymin, xmin, ymax, xmax] normalized to 0-1000.",
                    },
                    "isolation_score": {"type": "number", "minimum": 0, "maximum": 1},
                    "zoom_score": {"type": "number", "minimum": 0, "maximum": 1},
                    "visibility_score": {"type": "number", "minimum": 0, "maximum": 1},
                    "motion_blur_score": {"type": "number", "minimum": 0, "maximum": 1},
                    "background_removal_notes": {"type": "string"},
                    "why_this_moment": {"type": "string"},
                },
                "required": [
                    "asset_id",
                    "name",
                    "timestamp_s",
                    "approx_box_2d",
                    "isolation_score",
                    "zoom_score",
                    "visibility_score",
                    "motion_blur_score",
                    "background_removal_notes",
                    "why_this_moment",
                ],
            },
        },
        "selected_candidate_index": {"type": "integer"},
    },
    "required": ["target", "selection_criteria", "candidates", "selected_candidate_index"],
}

REFINE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "box_2d": {
            "type": "array",
            "items": {"type": "integer"},
            "minItems": 4,
            "maxItems": 4,
            "description": "[ymin, xmin, ymax, xmax] normalized to 0-1000.",
        },
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "include_trail": {"type": "boolean"},
        "notes": {"type": "string"},
    },
    "required": ["box_2d", "confidence", "include_trail", "notes"],
}


def find_target_candidates(video_path: Path, out_dir: Path, target: str, fps: float) -> dict[str, Any]:
    client = asset_pipeline.gemini_client()
    manifests_dir = out_dir / "manifests"
    manifests_dir.mkdir(parents=True, exist_ok=True)

    uploaded = client.files.upload(
        file=str(video_path),
        config=types.UploadFileConfig(mimeType="video/mp4", displayName=video_path.name),
    )
    uploaded = asset_pipeline.wait_for_file(client, uploaded.name)

    prompt = f"""
Analyze this vertical mobile gameplay ad video for one target asset only: {target}.

Find the best moments to recreate a clean standalone transparent PNG of the {target}.
Prioritize moments where the target asset is:
1. most isolated from characters, hands, UI, smoke, walls, and other objects,
2. least occluded,
3. least motion-blurred,
4. fully visible including its nose/body/fins,
5. largest or most zoomed-in on screen,
6. high contrast against its background for easier background removal.

Return 3 to 6 candidate moments if possible. For each candidate, give the bounding box of the target asset only.
For a missile/rocket projectile, exclude smoke trail, launch puff, hand cursor, cannon, and impact VFX unless they are physically part of the projectile.
Use box_2d format [ymin, xmin, ymax, xmax], normalized to 0-1000.

Select the single best candidate for downstream crop -> Scenario background removal.
""".strip()

    part = types.Part(
        fileData=types.FileData(fileUri=uploaded.uri, mimeType=uploaded.mime_type or "video/mp4"),
        videoMetadata=types.VideoMetadata(fps=fps),
    )
    config = types.GenerateContentConfig(
        responseMimeType="application/json",
        responseJsonSchema=TARGET_SCHEMA,
        mediaResolution=types.MediaResolution.MEDIA_RESOLUTION_HIGH,
        temperature=0,
        maxOutputTokens=8000,
    )
    model, response = asset_pipeline.call_model_with_fallback(
        client,
        asset_pipeline.VIDEO_MODELS,
        contents=[part, prompt],
        config=config,
    )
    raw_path = manifests_dir / "01_target_video_candidates.raw.txt"
    raw_path.write_text(response.text or "")
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, dict):
        payload = parsed
    else:
        try:
            payload = json.loads(asset_pipeline.extract_json_payload(response.text or "{}"))
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Gemini returned malformed target JSON. Raw response saved to {raw_path}") from exc
    payload["_gemini_model"] = model
    payload["_gemini_file"] = {"name": uploaded.name, "uri": uploaded.uri}
    asset_pipeline.write_json(manifests_dir / "01_target_video_candidates.json", payload)
    return payload


def selected_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    candidates = payload.get("candidates", [])
    if not candidates:
        raise RuntimeError("Gemini returned no target candidates.")
    index = int(payload.get("selected_candidate_index", 0))
    if index < 0 or index >= len(candidates):
        index = max(
            range(len(candidates)),
            key=lambda i: (
                float(candidates[i].get("isolation_score", 0)),
                float(candidates[i].get("zoom_score", 0)),
                float(candidates[i].get("visibility_score", 0)),
            ),
        )
    return candidates[index]


def refine_target_box(frame_path: Path, target: str) -> dict[str, Any]:
    client = asset_pipeline.gemini_client()
    image = Image.open(frame_path)
    prompt = f"""
Find the tight bounding box for the target asset only: {target}.

This crop is for Scenario background removal. Include the complete missile/rocket body, nose, fins, and exhaust cap if visible.
Exclude smoke trail, launch cloud, cannon, hand cursor, UI, background, impact particles, and unrelated objects.
If there are multiple missiles, choose the largest, cleanest, most isolated one.
Return [ymin, xmin, ymax, xmax] normalized to 0-1000.
""".strip()
    config = types.GenerateContentConfig(
        responseMimeType="application/json",
        responseJsonSchema=REFINE_SCHEMA,
        mediaResolution=types.MediaResolution.MEDIA_RESOLUTION_HIGH,
        thinkingConfig=types.ThinkingConfig(thinkingBudget=0),
        temperature=0,
    )
    model, response = asset_pipeline.call_model_with_fallback(
        client,
        asset_pipeline.IMAGE_MODELS,
        contents=[image, prompt],
        config=config,
    )
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, dict):
        payload = parsed
    else:
        payload = json.loads(asset_pipeline.extract_json_payload(response.text or "{}"))
    payload["_gemini_model"] = model
    return payload


def crop_target(frame_path: Path, target_id: str, target_name: str, refined: dict[str, Any], out_dir: Path) -> dict[str, Any]:
    image = Image.open(frame_path).convert("RGBA")
    width, height = image.size
    box_2d = [int(v) for v in refined["box_2d"]]
    pixel_box = asset_pipeline.box_1000_to_pixels(box_2d, width=width, height=height)
    padded = asset_pipeline.padded_box(pixel_box, width=width, height=height, pad_ratio=0.12, min_size=96)

    crop_dir = out_dir / "extracted" / "crops"
    crop_dir.mkdir(parents=True, exist_ok=True)
    crop_path = crop_dir / f"{target_id}.png"
    image.crop(padded).save(crop_path)

    debug = image.copy()
    draw = ImageDraw.Draw(debug)
    draw.rectangle(pixel_box, outline=(255, 0, 0, 255), width=5)
    draw.rectangle(padded, outline=(0, 255, 255, 255), width=5)
    draw.text((padded[0] + 8, max(0, padded[1] - 30)), target_name, fill=(255, 255, 255, 255))
    debug_path = out_dir / "qa" / "debug-overlays" / f"{target_id}_debug.png"
    debug_path.parent.mkdir(parents=True, exist_ok=True)
    debug.save(debug_path)

    return {
        "asset_id": target_id,
        "name": target_name,
        "frame_path": str(frame_path),
        "crop_path": str(crop_path),
        "debug_path": str(debug_path),
        "gemini_box_2d": box_2d,
        "bbox_px": list(pixel_box),
        "padded_bbox_px": list(padded),
        "confidence": refined.get("confidence"),
        "notes": refined.get("notes", ""),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Targeted video-only extraction for one asset.")
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--target", default="missile / rocket projectile")
    parser.add_argument("--fps", type=float, default=12.0)
    parser.add_argument("--skip-video-gemini", action="store_true")
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    target_manifest_path = args.out / "manifests" / "01_target_video_candidates.json"
    if args.skip_video_gemini:
        payload = asset_pipeline.read_json(target_manifest_path)
    else:
        payload = find_target_candidates(args.video, args.out, args.target, args.fps)

    best = selected_candidate(payload)
    target_id = asset_pipeline.safe_slug(str(best.get("asset_id") or "missile"))
    target_name = str(best.get("name") or args.target)
    timestamp_s = float(best["timestamp_s"])

    frame_path = args.out / "extracted" / "frames" / f"{target_id}_{timestamp_s:.3f}s.png"
    asset_pipeline.extract_frame(args.video, timestamp_s, frame_path)

    refined = refine_target_box(frame_path, args.target)
    asset_pipeline.write_json(args.out / "manifests" / "02_target_frame_refinement.json", refined)
    extraction = crop_target(frame_path, target_id, target_name, refined, args.out)
    extraction.update(
        {
            "timestamp_s": timestamp_s,
            "video_candidate": best,
            "target": args.target,
        }
    )
    asset_pipeline.write_json(args.out / "manifests" / "03_target_extraction_manifest.json", extraction)
    print(json.dumps(extraction, indent=2))


if __name__ == "__main__":
    main()
