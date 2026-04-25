from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import imageio_ffmpeg
from google import genai
from google.genai import types
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
VIDEO_PATH = ROOT / "ressources" / "Video Example" / "B11.mp4"
OUTPUT_ROOT = ROOT / "nico-sandbox" / "runs" / "B11"

VIDEO_MODELS = [
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
]
IMAGE_MODELS = [
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
]

SPRITE_RECREATION_PIPELINE = [
    "upload_reference_crop",
    "model_google-gemini-3-1-flash",
    "model_photoroom-background-removal",
    "model_scenario-padding-remover",
]

CHARACTER_ANIMATION_PIPELINE = [
    "upload_best_character_pose",
    "model_google-gemini-3-1-flash",
    "model_photoroom-background-removal",
    "model_meta-sam-3-1-image_or_model_qwen-image-layered",
    "normalize_layers_and_emit_rig_json",
]

BACKGROUND_RECREATION_PIPELINE = [
    "extract_cleanest_full_plate_or_region",
    "model_google-gemini-3-1-flash",
    "optional_inpaint_from_multiple_frames",
]

VIDEO_INVENTORY_PROMPT = """
Analyze this vertical mobile gameplay ad video as a production artist and playable-ad engineer.

The final tool receives only this video. It must output every graphic asset needed to recreate the game/playable ad.
Provided source assets do not exist in production.

Return every reusable visual/gameplay asset needed to recreate the playable prototype:
- backgrounds and scene plates,
- castles, props, terrain, obstacles,
- characters and their reusable animation poses,
- weapons, projectiles, trails, aiming indicators,
- VFX such as explosions, smoke, flashes, impacts,
- UI, HUD, tutorial cursor/gesture assets, and end-card/CTA elements.

For each asset, choose the best timestamp for downstream recreation. The best timestamp is not only where the asset is visible.
It is the frame where the asset is most useful for Scenario cleanup:
- most isolated from other objects,
- least occluded,
- least motion-blurred,
- largest or most zoomed-in,
- fully visible,
- high contrast against the background,
- no unnecessary trail/smoke/hand/wall/character attached unless that element is physically part of the asset.

For animated characters or moving objects, choose the best seed pose and describe the animation states to generate later.
For backgrounds, choose the cleanest plate or the frame/region that best preserves the environment. Include notes about foreground occluders.
For UI-wide elements or full backgrounds, give the full visible region.

Return approximate location as box_2d in [ymin, xmin, ymax, xmax] normalized to 0-1000.
Prefer distinct reusable assets over transient duplicates, but include effects/projectiles that must be recreated independently.

Choose one of these recreation strategies:
- reference_recreate_then_alpha: static sprite, projectile, weapon, prop, icon, or VFX seed. Use Scenario Gemini recreation, then background removal, then trim.
- direct_cutout_then_enhance: crop is already clean enough for alpha removal/upscale.
- background_plate_cleanup: full or partial background plate, no alpha removal.
- animated_character_sheet: character/object needs consistent animation frames from one approved seed pose.
- layered_character_parts: character should be split into rig parts and emitted with rig.json.
- ui_vector_or_sprite: UI element can be vectorized or rebuilt as crisp sprite.

Also return the Scenario pipeline steps you recommend for each asset.
""".strip()

FRAME_REFINEMENT_PROMPT_TEMPLATE = """
Find the single best bounding box for this target asset in the gameplay screenshot.

Target asset: {name}
Category: {category}
Description: {description}
Gameplay role: {role}
Recreation strategy: {strategy}

Return only the target asset if visible. Use box_2d as [ymin, xmin, ymax, xmax] normalized to 0-1000.
This box is the seed crop for Scenario, so keep it tight and intentional.

Rules:
- For projectiles/weapons, include the body/nose/fins/weapon silhouette; exclude smoke trail, launch puff, impact particles, hand cursor, wall, and unrelated objects unless they are physically part of the target.
- For characters, include the full visible body and held weapon if it belongs to the character pose; exclude unrelated UI, other units, and scenery.
- For VFX, include the full effect only if the effect itself is the target.
- For backgrounds, use the full game background region or the requested plate region, not foreground characters/UI.
- For UI, include the full button/panel/text treatment and exclude gameplay scene behind it.
""".strip()

SCENARIO_SPRITE_PROMPT_TEMPLATE = """
Using the reference crop, recreate ONLY this asset as a clean 2D mobile game sprite.

Asset: {name}
Category: {category}
Description: {description}
Gameplay role: {role}

Preserve the source asset's silhouette, color family, proportions, camera angle, readable details, and casual mobile-game rendering style.
Improve video compression artifacts and make the asset crisp and production-quality.
Center the asset with comfortable transparent padding.

Remove everything that is not the asset: no background, no wall, no character, no hand cursor, no UI, no smoke/trail/impact particles unless explicitly part of the target.
Use a transparent background PNG when supported. If transparency is not preserved, use a plain simple background that can be removed cleanly.
Do not add new objects or change the gameplay read.
""".strip()

SCENARIO_BACKGROUND_PROMPT_TEMPLATE = """
Using the reference frame/crop, recreate a clean gameplay background plate for the playable ad.

Asset: {name}
Description: {description}
Gameplay role: {role}

Preserve the original scene composition, camera angle, palette, lighting, and casual mobile-game art style.
Remove foreground characters, projectiles, UI, tutorial hands, and transient VFX when they cover the background.
Reconstruct hidden background details plausibly and keep the result seamless enough to sit behind gameplay.
Do not create a poster, logo, new character, or new UI.
Return an opaque rectangular background plate, not a transparent sprite.
""".strip()

SCENARIO_CHARACTER_PROMPT_TEMPLATE = """
Using the reference crop, recreate this character/object as a clean 2D mobile game animation seed.

Asset: {name}
Description: {description}
Gameplay role: {role}

Preserve the character identity, silhouette, palette, proportions, facing direction, outfit, weapon, and readable facial/body features.
Make one crisp neutral/base pose on transparent background, suitable for later animation.
Do not add scenery, UI, extra characters, labels, or poster composition.

The later animation pass should generate full strips at once from this approved seed, keeping the same character, facing direction, palette, silhouette, outfit proportions, and transparent canvas.
""".strip()


MANIFEST_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "video_summary": {"type": "string"},
        "gameplay_loop": {"type": "string"},
        "camera_and_canvas": {"type": "string"},
        "assets": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "asset_id": {"type": "string"},
                    "name": {"type": "string"},
                    "category": {
                        "type": "string",
                        "enum": [
                            "background",
                            "castle",
                            "character",
                            "projectile",
                            "weapon",
                            "ui",
                            "effect",
                            "other",
                        ],
                    },
                    "visual_description": {"type": "string"},
                    "gameplay_role": {"type": "string"},
                    "best_timestamp_s": {"type": "number"},
                    "fallback_timestamps_s": {
                        "type": "array",
                        "items": {"type": "number"},
                    },
                    "approx_box_2d": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "minItems": 4,
                        "maxItems": 4,
                        "description": "Approximate [ymin, xmin, ymax, xmax] normalized to 0-1000.",
                    },
                    "isolate_with_background_removal": {"type": "boolean"},
                    "recreation_strategy": {
                        "type": "string",
                        "enum": [
                            "reference_recreate_then_alpha",
                            "direct_cutout_then_enhance",
                            "background_plate_cleanup",
                            "animated_character_sheet",
                            "layered_character_parts",
                            "ui_vector_or_sprite",
                        ],
                    },
                    "scenario_pipeline": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "animation_notes": {"type": "string"},
                    "background_plate_notes": {"type": "string"},
                    "priority": {"type": "integer", "minimum": 1, "maximum": 5},
                },
                "required": [
                    "asset_id",
                    "name",
                    "category",
                    "visual_description",
                    "gameplay_role",
                    "best_timestamp_s",
                    "fallback_timestamps_s",
                    "approx_box_2d",
                    "isolate_with_background_removal",
                    "recreation_strategy",
                    "scenario_pipeline",
                    "animation_notes",
                    "background_plate_notes",
                    "priority",
                ],
            },
        },
    },
    "required": ["video_summary", "gameplay_loop", "camera_and_canvas", "assets"],
}

BOX_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "boxes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "box_2d": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "minItems": 4,
                        "maxItems": 4,
                    },
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "notes": {"type": "string"},
                },
                "required": ["label", "box_2d", "confidence", "notes"],
            },
        }
    },
    "required": ["boxes"],
}


@dataclass(frozen=True)
class Candidate:
    asset_id: str
    name: str
    category: str
    visual_description: str
    gameplay_role: str
    timestamp_s: float
    box_2d: list[int]
    isolate: bool
    recreation_strategy: str
    scenario_pipeline: list[str]
    animation_notes: str
    background_plate_notes: str
    priority: int

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "Candidate":
        return cls(
            asset_id=safe_slug(str(value["asset_id"])),
            name=str(value["name"]),
            category=str(value["category"]),
            visual_description=str(value["visual_description"]),
            gameplay_role=str(value["gameplay_role"]),
            timestamp_s=float(value["best_timestamp_s"]),
            box_2d=[int(v) for v in value["approx_box_2d"]],
            isolate=bool(value["isolate_with_background_removal"]),
            recreation_strategy=str(value.get("recreation_strategy") or default_recreation_strategy(str(value["category"]))),
            scenario_pipeline=[str(step) for step in value.get("scenario_pipeline", [])]
            or default_scenario_pipeline(str(value["category"])),
            animation_notes=str(value.get("animation_notes", "")),
            background_plate_notes=str(value.get("background_plate_notes", "")),
            priority=int(value["priority"]),
        )


def safe_slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", value.strip().lower()).strip("_")
    return slug or "asset"


def default_recreation_strategy(category: str) -> str:
    category = category.lower()
    if category == "background":
        return "background_plate_cleanup"
    if category == "character":
        return "animated_character_sheet"
    if category == "ui":
        return "ui_vector_or_sprite"
    return "reference_recreate_then_alpha"


def default_scenario_pipeline(category: str) -> list[str]:
    category = category.lower()
    if category == "background":
        return list(BACKGROUND_RECREATION_PIPELINE)
    if category == "character":
        return list(CHARACTER_ANIMATION_PIPELINE)
    return list(SPRITE_RECREATION_PIPELINE)


def scenario_prompt_for_candidate(candidate: Candidate) -> str:
    values = {
        "name": candidate.name,
        "category": candidate.category,
        "description": candidate.visual_description,
        "role": candidate.gameplay_role,
    }
    strategy = candidate.recreation_strategy
    if candidate.category == "background" or strategy == "background_plate_cleanup":
        return SCENARIO_BACKGROUND_PROMPT_TEMPLATE.format(**values)
    if candidate.category == "character" or strategy in {"animated_character_sheet", "layered_character_parts"}:
        return SCENARIO_CHARACTER_PROMPT_TEMPLATE.format(**values)
    return SCENARIO_SPRITE_PROMPT_TEMPLATE.format(**values)


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def extract_json_payload(text: str) -> str:
    stripped = text.strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", stripped, re.DOTALL)
    if fenced:
        return fenced.group(1).strip()
    start_candidates = [idx for idx in (stripped.find("{"), stripped.find("[")) if idx >= 0]
    if not start_candidates:
        return stripped
    start = min(start_candidates)
    end = max(stripped.rfind("}"), stripped.rfind("]"))
    return stripped[start : end + 1].strip()


def box_1000_to_pixels(box: list[int] | tuple[int, int, int, int], width: int, height: int) -> tuple[int, int, int, int]:
    if len(box) != 4:
        raise ValueError(f"Expected four box values, got {box!r}")
    y1, x1, y2, x2 = [float(v) for v in box]
    y_low, y_high = sorted((y1, y2))
    x_low, x_high = sorted((x1, x2))
    left = round(max(0, min(1000, x_low)) / 1000 * width)
    top = round(max(0, min(1000, y_low)) / 1000 * height)
    right = round(max(0, min(1000, x_high)) / 1000 * width)
    bottom = round(max(0, min(1000, y_high)) / 1000 * height)
    if right <= left:
        right = min(width, left + 1)
    if bottom <= top:
        bottom = min(height, top + 1)
    return (left, top, right, bottom)


def padded_box(
    box: tuple[int, int, int, int],
    width: int,
    height: int,
    pad_ratio: float = 0.18,
    min_size: int = 96,
) -> tuple[int, int, int, int]:
    left, top, right, bottom = box
    box_w = max(1, right - left)
    box_h = max(1, bottom - top)
    pad_x = max(round(box_w * pad_ratio), 8)
    pad_y = max(round(box_h * pad_ratio), 8)
    left -= pad_x
    right += pad_x
    top -= pad_y
    bottom += pad_y

    if right - left < min_size:
        extra = min_size - (right - left)
        left -= extra // 2
        right += extra - extra // 2
    if bottom - top < min_size:
        extra = min_size - (bottom - top)
        top -= extra // 2
        bottom += extra - extra // 2

    left = max(0, left)
    top = max(0, top)
    right = min(width, right)
    bottom = min(height, bottom)
    return (left, top, right, bottom)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text())


def gemini_client() -> genai.Client:
    load_dotenv(ROOT / ".env")
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is missing. Add it to .env or the environment.")
    return genai.Client(api_key=api_key)


def call_model_with_fallback(client: genai.Client, models: list[str], *, contents: Any, config: Any) -> tuple[str, Any]:
    errors: list[str] = []
    for model in models:
        try:
            response = client.models.generate_content(model=model, contents=contents, config=config)
            return model, response
        except Exception as exc:  # The SDK surfaces model availability and safety blocks here.
            errors.append(f"{model}: {exc}")
    raise RuntimeError("All Gemini models failed:\n" + "\n".join(errors))


def wait_for_file(client: genai.Client, name: str, timeout_s: int = 600) -> Any:
    deadline = time.time() + timeout_s
    current = client.files.get(name=name)
    while time.time() < deadline:
        state = str(getattr(current, "state", "")).lower()
        if "active" in state or state.endswith("state_active"):
            return current
        if "failed" in state:
            raise RuntimeError(f"Gemini file processing failed for {name}: {current}")
        time.sleep(5)
        current = client.files.get(name=name)
    raise TimeoutError(f"Timed out waiting for Gemini file {name}")


def generate_manifest(video_path: Path, output_dir: Path, fps: float = 5.0) -> dict[str, Any]:
    client = gemini_client()
    manifests_dir = output_dir / "manifests"
    manifests_dir.mkdir(parents=True, exist_ok=True)

    uploaded = client.files.upload(
        file=str(video_path),
        config=types.UploadFileConfig(mimeType="video/mp4", displayName=video_path.name),
    )
    uploaded = wait_for_file(client, uploaded.name)

    part = types.Part(
        fileData=types.FileData(fileUri=uploaded.uri, mimeType=uploaded.mime_type or "video/mp4"),
        videoMetadata=types.VideoMetadata(fps=fps),
    )
    config = types.GenerateContentConfig(
        responseMimeType="application/json",
        responseJsonSchema=MANIFEST_SCHEMA,
        mediaResolution=types.MediaResolution.MEDIA_RESOLUTION_HIGH,
        temperature=0.1,
        maxOutputTokens=16000,
    )
    model, response = call_model_with_fallback(client, VIDEO_MODELS, contents=[part, VIDEO_INVENTORY_PROMPT], config=config)
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, dict):
        payload = parsed
    else:
        payload = json.loads(extract_json_payload(response.text or "{}"))
    payload["_gemini_model"] = model
    payload["_gemini_file"] = {"name": uploaded.name, "uri": uploaded.uri}
    write_json(manifests_dir / "01_gemini_video_manifest.json", payload)
    return payload


def ffmpeg_path() -> str:
    return imageio_ffmpeg.get_ffmpeg_exe()


def extract_frame(video_path: Path, timestamp_s: float, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg_path(),
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        f"{max(0, timestamp_s):.3f}",
        "-i",
        str(video_path),
        "-frames:v",
        "1",
        str(output_path),
    ]
    subprocess.run(command, check=True)


def refine_box_with_gemini(frame_path: Path, candidate: Candidate) -> dict[str, Any]:
    client = gemini_client()
    image = Image.open(frame_path)
    prompt = FRAME_REFINEMENT_PROMPT_TEMPLATE.format(
        name=candidate.name,
        category=candidate.category,
        description=candidate.visual_description,
        role=candidate.gameplay_role,
        strategy=candidate.recreation_strategy,
    )
    config = types.GenerateContentConfig(
        responseMimeType="application/json",
        responseJsonSchema=BOX_SCHEMA,
        mediaResolution=types.MediaResolution.MEDIA_RESOLUTION_HIGH,
        thinkingConfig=types.ThinkingConfig(thinkingBudget=0),
        temperature=0,
    )
    model, response = call_model_with_fallback(client, IMAGE_MODELS, contents=[image, prompt], config=config)
    payload = json.loads(extract_json_payload(response.text or '{"boxes": []}'))
    payload["_gemini_model"] = model
    return payload


def crop_candidate(
    frame_path: Path,
    candidate: Candidate,
    refined: dict[str, Any] | None,
    crops_dir: Path,
    debug_dir: Path,
) -> dict[str, Any]:
    image = Image.open(frame_path).convert("RGBA")
    width, height = image.size
    source_box = candidate.box_2d
    confidence = None
    if refined and refined.get("boxes"):
        best = max(refined["boxes"], key=lambda box: float(box.get("confidence", 0)))
        source_box = [int(v) for v in best["box_2d"]]
        confidence = best.get("confidence")

    pixel_box = box_1000_to_pixels(source_box, width=width, height=height)
    expanded = padded_box(pixel_box, width=width, height=height)
    crop = image.crop(expanded)
    crop_path = crops_dir / f"{candidate.asset_id}.png"
    crop_path.parent.mkdir(parents=True, exist_ok=True)
    crop.save(crop_path)

    debug = image.copy()
    draw = ImageDraw.Draw(debug)
    draw.rectangle(pixel_box, outline=(255, 0, 0, 255), width=5)
    draw.rectangle(expanded, outline=(0, 255, 255, 255), width=5)
    draw.text((expanded[0] + 8, max(0, expanded[1] - 30)), candidate.name, fill=(255, 255, 255, 255))
    debug_path = debug_dir / f"{candidate.asset_id}_debug.png"
    debug_path.parent.mkdir(parents=True, exist_ok=True)
    debug.save(debug_path)

    return {
        "asset_id": candidate.asset_id,
        "name": candidate.name,
        "category": candidate.category,
        "timestamp_s": candidate.timestamp_s,
        "frame_path": str(frame_path),
        "crop_path": str(crop_path),
        "debug_path": str(debug_path),
        "gemini_box_2d": source_box,
        "bbox_px": list(pixel_box),
        "padded_bbox_px": list(expanded),
        "confidence": confidence,
        "isolate_with_background_removal": candidate.isolate,
        "recreation_strategy": candidate.recreation_strategy,
        "scenario_pipeline": candidate.scenario_pipeline,
        "scenario_prompt": scenario_prompt_for_candidate(candidate),
        "animation_notes": candidate.animation_notes,
        "background_plate_notes": candidate.background_plate_notes,
        "priority": candidate.priority,
        "visual_description": candidate.visual_description,
    }


def extract_candidates(manifest: dict[str, Any], video_path: Path, output_dir: Path, refine: bool = True) -> list[dict[str, Any]]:
    frames_dir = output_dir / "extracted" / "frames"
    crops_dir = output_dir / "extracted" / "crops"
    debug_dir = output_dir / "qa" / "debug-overlays"
    refined_dir = output_dir / "manifests" / "02_gemini_frame_refinement"
    extracted: list[dict[str, Any]] = []

    seen: dict[str, int] = {}
    for raw in sorted(manifest["assets"], key=lambda value: (int(value["priority"]), str(value["asset_id"]))):
        candidate = Candidate.from_dict(raw)
        count = seen.get(candidate.asset_id, 0)
        seen[candidate.asset_id] = count + 1
        if count:
            candidate = Candidate(
                asset_id=f"{candidate.asset_id}_{count + 1}",
                name=candidate.name,
                category=candidate.category,
                visual_description=candidate.visual_description,
                gameplay_role=candidate.gameplay_role,
                timestamp_s=candidate.timestamp_s,
                box_2d=candidate.box_2d,
                isolate=candidate.isolate,
                recreation_strategy=candidate.recreation_strategy,
                scenario_pipeline=candidate.scenario_pipeline,
                animation_notes=candidate.animation_notes,
                background_plate_notes=candidate.background_plate_notes,
                priority=candidate.priority,
            )

        frame_path = frames_dir / f"{candidate.asset_id}_{candidate.timestamp_s:.3f}s.png"
        extract_frame(video_path, candidate.timestamp_s, frame_path)

        refined = None
        if refine:
            refined = refine_box_with_gemini(frame_path, candidate)
            write_json(refined_dir / f"{candidate.asset_id}.json", refined)

        extracted.append(crop_candidate(frame_path, candidate, refined, crops_dir, debug_dir))

    write_json(output_dir / "manifests" / "03_extracted_assets_manifest.json", {"assets": extracted})
    build_contact_sheet(extracted, output_dir / "previews" / "extracted_assets_contact_sheet.png")
    return extracted


def build_contact_sheet(extracted: list[dict[str, Any]], output_path: Path) -> None:
    thumbs: list[tuple[Image.Image, str]] = []
    for item in extracted:
        image = Image.open(item["crop_path"]).convert("RGBA")
        image.thumbnail((220, 220), Image.Resampling.LANCZOS)
        thumbs.append((image, item["name"]))
    if not thumbs:
        return
    cols = 4
    cell_w, cell_h = 260, 290
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell_w, rows * cell_h), (18, 22, 28, 255))
    draw = ImageDraw.Draw(sheet)
    for idx, (thumb, label) in enumerate(thumbs):
        col = idx % cols
        row = idx // cols
        x = col * cell_w + (cell_w - thumb.width) // 2
        y = row * cell_h + 18
        sheet.alpha_composite(thumb, (x, y))
        draw.text((col * cell_w + 12, row * cell_h + 244), label[:32], fill=(240, 244, 248, 255))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(output_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract candidate playable-ad assets from B11.mp4.")
    parser.add_argument("--video", type=Path, default=VIDEO_PATH)
    parser.add_argument("--out", type=Path, default=OUTPUT_ROOT)
    parser.add_argument("--skip-video-gemini", action="store_true")
    parser.add_argument("--skip-refine", action="store_true")
    parser.add_argument("--fps", type=float, default=5.0)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    manifest_path = args.out / "manifests" / "01_gemini_video_manifest.json"
    if args.skip_video_gemini:
        manifest = read_json(manifest_path)
    else:
        manifest = generate_manifest(args.video, args.out, fps=args.fps)
    extract_candidates(manifest, args.video, args.out, refine=not args.skip_refine)
    print(f"Wrote extraction artifacts to {args.out}")


if __name__ == "__main__":
    main()
