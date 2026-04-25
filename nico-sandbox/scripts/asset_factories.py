from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import asset_pipeline


ROUTE_STATIC_SPRITE = "static_sprite"
ROUTE_CHARACTER_RIG = "character_rig"
ROUTE_PROCEDURAL_VFX = "procedural_vfx"
ROUTE_BACKGROUND_PLATE = "background_plate"
ROUTE_UI_ASSET = "ui_asset"

MODEL_GEMINI_EDIT = "model_google-gemini-3-1-flash"
MODEL_PHOTOROOM = "model_photoroom-background-removal"
MODEL_PIXA_BACKGROUND_REMOVE = "model_pixa-background-removal"
MODEL_PADDING_REMOVER = "model_scenario-padding-remover"
MODEL_SAM_IMAGE = "model_meta-sam-3-1-image"
MODEL_SAM_IMAGE_31 = "model_meta-sam-3-1-image"
MODEL_QWEN_LAYERED = "model_qwen-image-layered"

BACKGROUND_LORA_CANDIDATES = [
    {
        "model_id": "model_mqgQv6BPF2Vd7mkbnpZBKfKV",
        "name": "Battle Arenas 2.0",
        "best_for": "cartoon fantasy battlegrounds and side-view arena plates",
    },
    {
        "model_id": "model_hHuMquQ1QvEGHS1w7tGuYXud",
        "name": "Cartoon Backgrounds 2.0",
        "best_for": "bold casual game backgrounds and end-card scenery",
    },
    {
        "model_id": "model_D8GZ4GXnGgLXYZbj9rfZ4Gxe",
        "name": "Bold Line Environments 2.0",
        "best_for": "clean outlined environments with stylized depth",
    },
    {
        "model_id": "model_uPCFzAgcZVB6sdTdRS7XXQ6Z",
        "name": "Top-down TD Game",
        "best_for": "top-down maps, lanes, forests, deserts, and strategy-game terrain",
    },
]

UI_LORA_CANDIDATES = [
    {
        "model_id": "model_2CrDSJ7FsBZckLpakS4JyS6A",
        "name": "Human Interface 2.0",
        "best_for": "HUDs, menus, buttons, frames, and game UI mockups",
    },
    {
        "model_id": "model_mcYj5uGzXteUw6tKapsaDgBP",
        "name": "Game UI Essentials 2.0",
        "best_for": "icons, buttons, badges, and casual mobile UI elements",
    },
]

CHARACTER_PARTS = [
    "shadow",
    "body",
    "head",
    "arm_back",
    "arm_front",
    "leg_back",
    "leg_front",
    "weapon",
]

CHARACTER_PART_SHEET_ORDER = [
    "head",
    "body",
    "arm_front",
    "arm_back",
    "leg_front",
    "leg_back",
    "weapon",
    "shadow",
]

STATIC_OUTPUT_DIRS = {
    "castle": "props",
    "projectile": "projectiles",
    "weapon": "weapons",
    "other": "sprites",
}

VFX_CODE_PROMPT_TEMPLATE = """
Analyze this gameplay VFX asset and recreate it as procedural browser-game code, not as a Scenario-generated sprite.

Asset: {name}
Description: {description}
Gameplay role: {role}

Return a compact implementation plan for a Phaser/Canvas playable ad:
- visual read at mobile scale,
- duration in milliseconds,
- color palette,
- particle counts,
- emitter positions,
- velocity ranges,
- size/alpha/rotation curves,
- blend mode,
- cleanup timing,
- TypeScript code for a reusable function.

The output should be deterministic enough to recreate the effect without needing a PNG sprite sheet.
Do not include external assets.
""".strip()


@dataclass(frozen=True)
class FactoryPlan:
    asset_id: str
    route: str
    category: str
    output_dir: Path
    primary_output: Path
    manifest_path: Path
    steps: list[str]
    scenario_models: list[str]
    gemini_tasks: list[str]
    outputs: dict[str, Any]
    prompts: dict[str, str]
    notes: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "asset_id": self.asset_id,
            "route": self.route,
            "category": self.category,
            "output_dir": str(self.output_dir),
            "primary_output": str(self.primary_output),
            "manifest_path": str(self.manifest_path),
            "steps": self.steps,
            "scenario_models": self.scenario_models,
            "gemini_tasks": self.gemini_tasks,
            "outputs": self.outputs,
            "prompts": self.prompts,
            "notes": self.notes,
        }


def route_for_item(item: dict[str, Any]) -> str:
    category = str(item.get("category", "other")).lower()
    strategy = str(item.get("recreation_strategy", "")).lower()
    asset_id = str(item.get("asset_id", "")).lower()
    name = str(item.get("name", "")).lower()

    if category == "background" or strategy == "background_plate_cleanup":
        return ROUTE_BACKGROUND_PLATE
    if category == "character" or strategy in {"animated_character_sheet", "layered_character_parts"}:
        return ROUTE_CHARACTER_RIG
    if category == "effect" or asset_id.startswith("vfx_") or any(token in name for token in ("explosion", "smoke", "impact", "flash")):
        return ROUTE_PROCEDURAL_VFX
    if category == "ui" or strategy == "ui_vector_or_sprite":
        return ROUTE_UI_ASSET
    return ROUTE_STATIC_SPRITE


def candidate_from_item(item: dict[str, Any]) -> asset_pipeline.Candidate:
    category = str(item.get("category", "other"))
    return asset_pipeline.Candidate.from_dict(
        {
            "asset_id": item.get("asset_id", "asset"),
            "name": item.get("name", item.get("asset_id", "asset")),
            "category": category,
            "visual_description": item.get("visual_description", ""),
            "gameplay_role": item.get("gameplay_role", ""),
            "best_timestamp_s": item.get("timestamp_s", item.get("best_timestamp_s", 0)),
            "fallback_timestamps_s": item.get("fallback_timestamps_s", []),
            "approx_box_2d": item.get("gemini_box_2d", item.get("approx_box_2d", [0, 0, 1000, 1000])),
            "isolate_with_background_removal": item.get("isolate_with_background_removal", category != "background"),
            "priority": item.get("priority", 3),
            "recreation_strategy": item.get("recreation_strategy") or asset_pipeline.default_recreation_strategy(category),
            "scenario_pipeline": item.get("scenario_pipeline") or asset_pipeline.default_scenario_pipeline(category),
            "animation_notes": item.get("animation_notes", ""),
            "background_plate_notes": item.get("background_plate_notes", ""),
        }
    )


def prompt_for_item(item: dict[str, Any]) -> str:
    if item.get("scenario_prompt"):
        return str(item["scenario_prompt"])
    return asset_pipeline.scenario_prompt_for_candidate(candidate_from_item(item))


def default_character_rig(asset_id: str) -> dict[str, Any]:
    return {
        "asset_id": asset_id,
        "version": 1,
        "coordinate_space": "normalized_source_image",
        "anchor": {"x": 0.5, "y": 0.92},
        "parts": [
            {"id": "shadow", "file": "parts/shadow.png", "pivot": {"x": 0.5, "y": 0.5}, "draw_order": 0},
            {"id": "leg_back", "file": "parts/leg_back.png", "pivot": {"x": 0.5, "y": 0.18}, "draw_order": 1},
            {"id": "body", "file": "parts/body.png", "pivot": {"x": 0.5, "y": 0.62}, "draw_order": 2},
            {"id": "arm_back", "file": "parts/arm_back.png", "pivot": {"x": 0.3, "y": 0.22}, "draw_order": 3},
            {"id": "head", "file": "parts/head.png", "pivot": {"x": 0.5, "y": 0.72}, "draw_order": 4},
            {"id": "leg_front", "file": "parts/leg_front.png", "pivot": {"x": 0.5, "y": 0.18}, "draw_order": 5},
            {"id": "arm_front", "file": "parts/arm_front.png", "pivot": {"x": 0.3, "y": 0.22}, "draw_order": 6},
            {"id": "weapon", "file": "parts/weapon.png", "pivot": {"x": 0.18, "y": 0.5}, "draw_order": 7},
        ],
        "animations": [
            {
                "id": "idle",
                "duration_ms": 900,
                "loop": True,
                "description": "subtle breathing/bounce using body, head, and arm rotations",
            },
            {
                "id": "attack",
                "duration_ms": 500,
                "loop": False,
                "description": "anticipation, strike/release, recoil",
            },
            {
                "id": "hit",
                "duration_ms": 300,
                "loop": False,
                "description": "quick backward squash, tint flash, recover",
            },
        ],
    }


def plan_for_item(run_dir: Path, item: dict[str, Any]) -> FactoryPlan:
    route = route_for_item(item)
    if route == ROUTE_CHARACTER_RIG:
        return character_rig_plan(run_dir, item)
    if route == ROUTE_PROCEDURAL_VFX:
        return procedural_vfx_plan(run_dir, item)
    if route == ROUTE_BACKGROUND_PLATE:
        return background_plate_plan(run_dir, item)
    if route == ROUTE_UI_ASSET:
        return ui_asset_plan(run_dir, item)
    return static_sprite_plan(run_dir, item)


def static_sprite_plan(run_dir: Path, item: dict[str, Any]) -> FactoryPlan:
    asset_id = str(item["asset_id"])
    category = str(item.get("category", "other")).lower()
    output_dir = run_dir / "final-assets" / STATIC_OUTPUT_DIRS.get(category, "sprites")
    return FactoryPlan(
        asset_id=asset_id,
        route=ROUTE_STATIC_SPRITE,
        category=category,
        output_dir=output_dir,
        primary_output=output_dir / f"{asset_id}.png",
        manifest_path=run_dir / "manifests" / "factories" / f"{asset_id}.json",
        steps=["upload_crop", "scenario_gemini_recreate", "photoroom_alpha", "padding_trim"],
        scenario_models=[MODEL_GEMINI_EDIT, MODEL_PHOTOROOM, MODEL_PIXA_BACKGROUND_REMOVE, MODEL_PADDING_REMOVER],
        gemini_tasks=["candidate_qa"],
        outputs={"png": str(output_dir / f"{asset_id}.png")},
        prompts={"scenario": prompt_for_item(item)},
        notes=["Video crop is reference evidence; Scenario recreation supplies final pixels."],
    )


def character_rig_plan(run_dir: Path, item: dict[str, Any]) -> FactoryPlan:
    asset_id = str(item["asset_id"])
    output_dir = run_dir / "final-assets" / "characters" / asset_id
    rig = default_character_rig(asset_id)
    return FactoryPlan(
        asset_id=asset_id,
        route=ROUTE_CHARACTER_RIG,
        category="character",
        output_dir=output_dir,
        primary_output=output_dir / "full.png",
        manifest_path=output_dir / "asset_manifest.json",
        steps=[
            "upload_best_seed_crop",
            "scenario_gemini_clean_full_body",
            "photoroom_alpha",
            "scenario_gemini_part_sheet",
            "slice_part_sheet",
            "optional_sam_or_qwen_fallback",
            "emit_rig_json",
        ],
        scenario_models=[
            MODEL_GEMINI_EDIT,
            MODEL_PHOTOROOM,
            MODEL_PIXA_BACKGROUND_REMOVE,
            MODEL_PADDING_REMOVER,
            MODEL_SAM_IMAGE_31,
            MODEL_QWEN_LAYERED,
        ],
        gemini_tasks=["part_label_qa", "pivot_anchor_estimation", "animation_suggestion"],
        outputs={
            "full": str(output_dir / "full.png"),
            "parts_sheet": str(output_dir / "parts_sheet.png"),
            "parts_dir": str(output_dir / "parts"),
            "rig": str(output_dir / "rig.json"),
            "expected_parts": CHARACTER_PARTS,
            "part_sheet_grid": {"columns": 4, "rows": 2, "order": CHARACTER_PART_SHEET_ORDER},
            "rig_template": rig,
        },
        prompts={
            "scenario_base": prompt_for_item(item),
            "parts_sheet": "Create a transparent 4x2 character parts sheet in the fixed slot order: "
            + ", ".join(CHARACTER_PART_SHEET_ORDER)
            + ". No labels, no grid lines, no scenery.",
            "segmentation_fallback": "Use broad visual category prompts or bounding boxes only; SAM outputs masks, not painted color parts.",
        },
        notes=["Parts plus rig.json are the runtime target; generated parts sheet is the default, PSB is optional artist handoff only."],
    )


def procedural_vfx_plan(run_dir: Path, item: dict[str, Any]) -> FactoryPlan:
    asset_id = str(item["asset_id"])
    output_dir = run_dir / "final-assets" / "vfx" / asset_id
    prompt = VFX_CODE_PROMPT_TEMPLATE.format(
        name=item.get("name", asset_id),
        description=item.get("visual_description", ""),
        role=item.get("gameplay_role", ""),
    )
    return FactoryPlan(
        asset_id=asset_id,
        route=ROUTE_PROCEDURAL_VFX,
        category="effect",
        output_dir=output_dir,
        primary_output=output_dir / f"{asset_id}.ts",
        manifest_path=output_dir / "asset_manifest.json",
        steps=["gemini_vfx_temporal_description", "emit_particle_config", "emit_typescript_function"],
        scenario_models=[],
        gemini_tasks=["procedural_vfx_codegen"],
        outputs={
            "config": str(output_dir / f"{asset_id}.json"),
            "code": str(output_dir / f"{asset_id}.ts"),
        },
        prompts={"gemini_codegen": prompt},
        notes=["No Scenario image generation by default; recreate with code and tune in engine."],
    )


def background_plate_plan(run_dir: Path, item: dict[str, Any]) -> FactoryPlan:
    asset_id = str(item["asset_id"])
    output_dir = run_dir / "final-assets" / "backgrounds"
    return FactoryPlan(
        asset_id=asset_id,
        route=ROUTE_BACKGROUND_PLATE,
        category="background",
        output_dir=output_dir,
        primary_output=output_dir / f"{asset_id}.png",
        manifest_path=run_dir / "manifests" / "factories" / f"{asset_id}.json",
        steps=["extract_clean_plate", "scenario_background_cleanup", "optional_lora_ab_test", "gemini_plate_qa"],
        scenario_models=[MODEL_GEMINI_EDIT] + [candidate["model_id"] for candidate in BACKGROUND_LORA_CANDIDATES],
        gemini_tasks=["plate_occlusion_notes", "candidate_qa"],
        outputs={
            "plate": str(output_dir / f"{asset_id}.png"),
            "lora_candidates": BACKGROUND_LORA_CANDIDATES,
        },
        prompts={"scenario_background": prompt_for_item(item)},
        notes=["Opaque plate output; no alpha removal."],
    )


def ui_asset_plan(run_dir: Path, item: dict[str, Any]) -> FactoryPlan:
    asset_id = str(item["asset_id"])
    output_dir = run_dir / "final-assets" / "ui"
    return FactoryPlan(
        asset_id=asset_id,
        route=ROUTE_UI_ASSET,
        category="ui",
        output_dir=output_dir,
        primary_output=output_dir / f"{asset_id}.png",
        manifest_path=run_dir / "manifests" / "factories" / f"{asset_id}.json",
        steps=["gemini_ui_description", "choose_html_svg_or_png", "optional_ui_lora_recreation", "qa_legibility"],
        scenario_models=[candidate["model_id"] for candidate in UI_LORA_CANDIDATES],
        gemini_tasks=["ocr", "layout_description", "candidate_qa"],
        outputs={"png": str(output_dir / f"{asset_id}.png"), "ui_lora_candidates": UI_LORA_CANDIDATES},
        prompts={"scenario_ui": prompt_for_item(item)},
        notes=["Prefer HTML/CSS for simple counters/labels; use Scenario UI LoRAs for graphical UI art."],
    )
