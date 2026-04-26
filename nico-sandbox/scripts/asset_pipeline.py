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

============================================================
STEP 1 — GLOBAL ART STYLE (fill `art_style` first, before any asset)
============================================================
Look at the whole video and lock down ONE consistent art style description that every asset must match.
Describe what you actually see, do not assume genre tropes. A "ninja" character in a cartoon game is still
cartoon, not pixel art. A "robot" in a hand-drawn game is still hand-drawn, not 3D rendered.

Fill these fields:
- summary: one sentence, e.g. "casual cartoon mobile game with bold outlines and saturated flat colors"
- rendering: technique (2D vector-cartoon, hand-drawn raster, painterly, pixel art, low-poly 3D render…)
- line_work: outline weight & color (thick dark outlines / thin colored outlines / no outlines / etc.)
- palette: dominant color feel (saturated warm, muted pastel, neon high-contrast, earth tones…)
- shading: shading approach (flat / cel-shaded / soft gradient / painterly / none)
- scale_feel: chibi/stylized proportions vs realistic, sticker-like vs detailed
- anti_styles: an array of styles this game is NOT — explicit exclusions (e.g. ["pixel art", "voxel",
  "3D rendered", "photorealistic", "minimalist vector flat"]). This list is critical: it prevents
  downstream generators from defaulting to common tropes.

============================================================
STEP 2 — ASSET INVENTORY (be exhaustive, especially for VFX)
============================================================
Return every reusable visual/gameplay asset needed to recreate the playable prototype.

PRIMARY CATEGORIES:
- backgrounds and scene plates
- castles, props, terrain, obstacles, structures (intact AND destroyed/damaged states if they appear)
- characters and their reusable animation poses
- weapons, projectiles, trails, aiming indicators
- UI, HUD, tutorial cursor/gesture assets, end-card/CTA elements

VFX COMPLETENESS CHECK — do a deliberate second pass for ALL of these, they are easy to miss:
- launch / cast / muzzle / charge-up effects (puffs, sparks, glows that appear when a projectile or ability fires)
- in-flight effects (projectile trails, motion auras — only if the game uses them as standalone visuals)
- impact / hit effects (dust clouds, splash, sparks, hit-flash overlays on targets)
- destruction effects (debris, building/object break particles, screen shake flashes, smoke aftermath)
- state-change overlays (poison cloud, fire-burning loop, freeze sheen, electrified shock arcs)
- ambient world VFX (falling leaves, embers, floating dust, weather)
- UI feedback VFX (coin sparkle, score popups, "WIN"/"FAIL" stinger flashes)
For every distinct effect, emit a separate asset entry — do NOT lump multiple VFX into one entry.

ANIMATED SUB-PARTS — even when the parent asset is static (e.g. building, vehicle, prop):
If the parent has any sub-element that moves while the parent stays still (wheels rotating, flags waving,
blinking lights, opening doors, rotating turrets, glowing eyes pulsing), list each one in the asset's
`animated_parts` array. The parent is generated as a static sprite; each animated part is generated
separately as a small sprite strip and composited at runtime. For each animated_part:
- part_id: short slug
- description: what the part is, where it sits on the parent
- motion: how it moves ("continuous rotation", "2-state blink", "swing -15deg/+15deg loop", "open/close")
- frames_recommended: integer (4-12 typical for smooth loop, 2-3 for blink/state toggle)
- loop: true if the motion loops seamlessly

============================================================
STEP 3 — TIMESTAMP & STRATEGY (per asset)
============================================================
For each asset, choose the best timestamp for downstream recreation. The best timestamp is the frame
where the asset is most useful for Scenario cleanup:
- most isolated from other objects,
- least occluded,
- least motion-blurred,
- largest or most zoomed-in,
- fully visible,
- high contrast against the background,
- no unnecessary trail/smoke/hand/wall/character attached unless that element is physically part of the asset.

For animated characters or moving objects, choose the best seed pose and describe the animation states.
For backgrounds, choose the cleanest plate. Include notes about foreground occluders.
For UI-wide elements or full backgrounds, give the full visible region.

Return approximate location as box_2d in [ymin, xmin, ymax, xmax] normalized to 0-1000.
Prefer distinct reusable assets over transient duplicates, but include effects/projectiles that must be recreated independently.

Choose one of these recreation strategies:
- reference_recreate_then_alpha: static sprite, projectile, weapon, prop, icon, or VFX seed.
- direct_cutout_then_enhance: crop is already clean enough for alpha removal/upscale.
- background_plate_cleanup: full or partial background plate, no alpha removal.
- animated_character_sheet: character/object needs consistent animation frames from one approved seed pose.
- layered_character_parts: character should be split into rig parts and emitted with rig.json.
- ui_vector_or_sprite: UI element can be vectorized or rebuilt as crisp sprite.

Also return the Scenario pipeline steps you recommend for each asset.

Every asset's `visual_description` must be consistent with the global `art_style` block from STEP 1.
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

{style_lock}

Preserve the source asset's silhouette, color family, proportions, camera angle, and readable details.
Improve video compression artifacts and make the asset crisp and production-quality.
Center the asset with comfortable transparent padding.

Remove everything that is not the asset: no background, no wall, no character, no hand cursor, no UI, no smoke/trail/impact particles unless explicitly part of the target.
Use a transparent background PNG when supported. If transparency is not preserved, use a plain simple background that can be removed cleanly.
Do not add new objects or change the gameplay read.
""".strip()

SCENARIO_PROJECTILE_PROMPT_TEMPLATE = """
Using the reference crop, recreate ONLY the projectile body as a clean 2D mobile game sprite ready for direct engine use.

Asset: {name}
Description: {description}
Gameplay role: {role}

{style_lock}

Reproduce the projectile's shape, silhouette, and color exactly.
Center it on a transparent background with comfortable padding.

STRICT EXCLUSIONS — do NOT include any of the following:
- smoke trails, exhaust plumes, fire trails, or motion streaks
- launch effects, impact particles, or debris
- glow auras, light flares, or bloom
- any visual effect that is NOT the hard body of the projectile

The game engine will add all visual effects (trails, explosions, glows) at runtime.
This sprite is the clean projectile object only — imagine it sitting still on a shelf with no motion.
""".strip()


SCENARIO_BACKGROUND_PROMPT_TEMPLATE = """
Using the reference frame/crop, recreate a clean gameplay background plate for the playable ad.

Asset: {name}
Description: {description}
Gameplay role: {role}

{style_lock}

Preserve the original scene composition, camera angle, palette, and lighting.
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

{style_lock}

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
        "art_style": {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "rendering": {"type": "string"},
                "line_work": {"type": "string"},
                "palette": {"type": "string"},
                "shading": {"type": "string"},
                "scale_feel": {"type": "string"},
                "anti_styles": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Styles this game is NOT — explicit exclusions for downstream generators.",
                },
            },
            "required": [
                "summary",
                "rendering",
                "line_work",
                "palette",
                "shading",
                "scale_feel",
                "anti_styles",
            ],
        },
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
                    "animated_parts": {
                        "type": "array",
                        "description": "Sub-elements of an otherwise static parent that need their own animation strip.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "part_id": {"type": "string"},
                                "description": {"type": "string"},
                                "motion": {"type": "string"},
                                "frames_recommended": {"type": "integer", "minimum": 2, "maximum": 24},
                                "loop": {"type": "boolean"},
                            },
                            "required": ["part_id", "description", "motion", "frames_recommended", "loop"],
                        },
                    },
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
                    "animated_parts",
                ],
            },
        },
    },
    "required": ["video_summary", "gameplay_loop", "camera_and_canvas", "art_style", "assets"],
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


def format_style_lock(art_style: dict[str, Any] | None) -> str:
    """Render the global art_style block into the STYLE LOCK section of every Scenario prompt."""
    if not art_style or not isinstance(art_style, dict):
        return ""
    summary = str(art_style.get("summary", "")).strip()
    rendering = str(art_style.get("rendering", "")).strip()
    line_work = str(art_style.get("line_work", "")).strip()
    palette = str(art_style.get("palette", "")).strip()
    shading = str(art_style.get("shading", "")).strip()
    scale_feel = str(art_style.get("scale_feel", "")).strip()
    anti = art_style.get("anti_styles") or []
    anti_str = ", ".join(str(a).strip() for a in anti if str(a).strip())

    lines = ["=== STYLE LOCK (must match exactly across every asset in this game) ==="]
    if summary:
        lines.append(f"Overall: {summary}")
    if rendering:
        lines.append(f"Rendering technique: {rendering}")
    if line_work:
        lines.append(f"Line work: {line_work}")
    if palette:
        lines.append(f"Palette: {palette}")
    if shading:
        lines.append(f"Shading: {shading}")
    if scale_feel:
        lines.append(f"Scale / proportions: {scale_feel}")
    if anti_str:
        lines.append(f"DO NOT use any of these styles: {anti_str}.")
    lines.append(
        "Match this style regardless of what the asset depicts — do not default to genre tropes "
        "(e.g. ninjas as pixel art, robots as voxel, fantasy as painterly) unless the lock above says so."
    )
    return "\n".join(lines)


def scenario_prompt_for_candidate(
    candidate: Candidate,
    art_style: dict[str, Any] | None = None,
) -> str:
    values = {
        "name": candidate.name,
        "category": candidate.category,
        "description": candidate.visual_description,
        "role": candidate.gameplay_role,
        "style_lock": format_style_lock(art_style),
    }
    strategy = candidate.recreation_strategy
    if candidate.category == "background" or strategy == "background_plate_cleanup":
        return SCENARIO_BACKGROUND_PROMPT_TEMPLATE.format(**values)
    if candidate.category == "character" or strategy in {"animated_character_sheet", "layered_character_parts"}:
        return SCENARIO_CHARACTER_PROMPT_TEMPLATE.format(**values)
    if candidate.category == "projectile":
        return SCENARIO_PROJECTILE_PROMPT_TEMPLATE.format(**values)
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
        # Each asset entry is ~500 tokens with the new schema (animated_parts,
        # rich descriptions, fallback timestamps). 32k gives headroom for
        # 50+ assets without truncation killing the JSON mid-stream.
        maxOutputTokens=32000,
    )
    # Gemini occasionally returns a "successful" response whose `.parsed` is
    # None and whose `.text` is malformed JSON (truncated mid-stream). Retry
    # the call instead of letting the whole pipeline crash on one flake.
    last_err: Exception | None = None
    for attempt in range(3):
        model, response = call_model_with_fallback(
            client, VIDEO_MODELS, contents=[part, VIDEO_INVENTORY_PROMPT], config=config,
        )
        parsed = getattr(response, "parsed", None)
        if isinstance(parsed, dict):
            payload = parsed
            break
        try:
            payload = json.loads(extract_json_payload(response.text or "{}"))
            break
        except json.JSONDecodeError as exc:
            last_err = exc
            print(f"[asset_pipeline] Gemini returned malformed JSON (attempt {attempt + 1}/3): {exc}")
    else:
        raise RuntimeError(f"All Gemini attempts returned malformed manifest JSON: {last_err}")

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
    art_style: dict[str, Any] | None = None,
    animated_parts: list[dict[str, Any]] | None = None,
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
        "scenario_prompt": scenario_prompt_for_candidate(candidate, art_style),
        "animation_notes": candidate.animation_notes,
        "background_plate_notes": candidate.background_plate_notes,
        "priority": candidate.priority,
        "visual_description": candidate.visual_description,
        "animated_parts": list(animated_parts or []),
    }


def extract_candidates(manifest: dict[str, Any], video_path: Path, output_dir: Path, refine: bool = True) -> list[dict[str, Any]]:
    frames_dir = output_dir / "extracted" / "frames"
    crops_dir = output_dir / "extracted" / "crops"
    debug_dir = output_dir / "qa" / "debug-overlays"
    refined_dir = output_dir / "manifests" / "02_gemini_frame_refinement"
    extracted: list[dict[str, Any]] = []
    art_style = manifest.get("art_style") if isinstance(manifest, dict) else None

    seen: dict[str, int] = {}
    for raw in sorted(manifest["assets"], key=lambda value: (int(value["priority"]), str(value["asset_id"]))):
        candidate = Candidate.from_dict(raw)
        animated_parts = raw.get("animated_parts") or []
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

        extracted.append(
            crop_candidate(
                frame_path,
                candidate,
                refined,
                crops_dir,
                debug_dir,
                art_style=art_style,
                animated_parts=animated_parts,
            )
        )

    write_json(
        output_dir / "manifests" / "03_extracted_assets_manifest.json",
        {"art_style": art_style, "assets": extracted},
    )
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
