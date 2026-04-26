from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests
from google.genai import types
from PIL import Image

import asset_factories
import asset_pipeline


SCENARIO_BASE_URL = "https://api.cloud.scenario.com/v1"

MODEL_GEMINI_EDIT = asset_factories.MODEL_GEMINI_EDIT
MODEL_BACKGROUND_REMOVE = asset_factories.MODEL_PHOTOROOM
MODEL_PIXA_BACKGROUND_REMOVE = asset_factories.MODEL_PIXA_BACKGROUND_REMOVE
MODEL_PADDING_REMOVE = asset_factories.MODEL_PADDING_REMOVER
MODEL_SAM_IMAGE = asset_factories.MODEL_SAM_IMAGE

BACKGROUND_REMOVE_MODELS = [MODEL_BACKGROUND_REMOVE, MODEL_PIXA_BACKGROUND_REMOVE]


CHARACTER_PART_PROMPTS = {
    "shadow": "Segment only the simple ground shadow under the character. Exclude the body and weapon.",
    "body": "Segment only the torso/body clothing or armor. Exclude head, arms, legs, weapon, and shadow.",
    "head": "Segment only the head and face. Exclude body, arms, legs, weapon, and shadow.",
    "arm_back": "Segment only the rear/back arm if visible. Exclude torso, front arm, legs, weapon, and shadow.",
    "arm_front": "Segment only the front/leading arm if visible. Exclude torso, rear arm, legs, weapon, and shadow.",
    "leg_back": "Segment only the rear/back leg if visible. Exclude torso, front leg, arms, weapon, and shadow.",
    "leg_front": "Segment only the front/leading leg if visible. Exclude torso, rear leg, arms, weapon, and shadow.",
    "weapon": "Segment only the held weapon or carried tool if visible. Exclude character body, limbs, and shadow.",
}


CHARACTER_PART_SHEET_PROMPT_TEMPLATE = """
Using the clean full-body character reference, create a production-ready transparent character parts sheet for 2D playable animation.

Asset: {name}
Description: {description}

Output one image with a 4-column by 2-row layout. Each slot should contain exactly one isolated painted part on transparent background.
Slot order, left to right:
top row: head, body, arm_front, arm_back
bottom row: leg_front, leg_back, weapon, shadow

Rules:
- Preserve the same character identity, palette, outline style, facing direction, weapon style, and proportions.
- Draw the parts as usable color sprites, not white masks.
- Keep each part centered inside its slot with transparent padding.
- Do not draw labels, text, grid lines, scenery, UI, or a full assembled character.
- If a part is barely visible in the reference, infer a plausible matching part from the character design.
""".strip()


@dataclass(frozen=True)
class ScenarioConfig:
    api_key: str
    api_secret: str | None
    project_id: str
    team_id: str | None
    base_url: str = SCENARIO_BASE_URL


def load_config() -> ScenarioConfig:
    asset_pipeline.load_dotenv(asset_pipeline.ROOT / ".env")
    api_key = os.environ.get("SCENARIO_API_KEY")
    if not api_key:
        raise RuntimeError("SCENARIO_API_KEY is missing. Add it to .env or the environment.")
    project_id = os.environ.get("SCENARIO_PROJECT_ID")
    if not project_id:
        raise RuntimeError("SCENARIO_PROJECT_ID is missing. Add it to .env or the environment.")
    return ScenarioConfig(
        api_key=api_key,
        api_secret=os.environ.get("SCENARIO_API_SECRET") or None,
        project_id=project_id,
        team_id=os.environ.get("SCENARIO_TEAM_ID") or None,
        base_url=os.environ.get("SCENARIO_API_BASE", SCENARIO_BASE_URL).rstrip("/"),
    )


class ScenarioClient:
    def __init__(self, config: ScenarioConfig, *, poll_interval_s: float = 3.0, timeout_s: float = 600.0) -> None:
        self.config = config
        self.poll_interval_s = poll_interval_s
        self.timeout_s = timeout_s
        self.session = requests.Session()

    def headers(self, *, json_content: bool = True) -> dict[str, str]:
        headers: dict[str, str] = {}
        if json_content:
            headers["Content-Type"] = "application/json"
        if self.config.api_secret:
            credentials = base64.b64encode(f"{self.config.api_key}:{self.config.api_secret}".encode()).decode()
            headers["Authorization"] = f"Basic {credentials}"
        else:
            # Some upload endpoints accept a bearer-style single access key. Generation endpoints may still
            # require SCENARIO_API_SECRET; in that case the API will return 401 and this script reports it.
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        return headers

    def _url(self, path: str) -> str:
        return f"{self.config.base_url}/{path.lstrip('/')}"

    def request_json(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        params = dict(kwargs.pop("params", {}) or {})
        params.setdefault("projectId", self.config.project_id)
        backoff_s = 1.0
        response = None
        for attempt in range(4):  # 1 initial + 3 retries
            response = self.session.request(method, self._url(path), params=params, timeout=120, **kwargs)
            if response.status_code < 400:
                break
            if response.status_code in (429, 502, 503, 504) and attempt < 3:
                retry_after = response.headers.get("Retry-After")
                sleep_s = (
                    float(retry_after)
                    if retry_after and retry_after.replace(".", "").replace("-", "").isdigit()
                    else backoff_s
                )
                time.sleep(min(sleep_s, 30.0))
                backoff_s *= 2
                continue
            # Non-retryable 4xx OR exhausted retries
            raise RuntimeError(f"Scenario API {method} {path} failed: {response.status_code} {response.text}")
        if response is None or response.status_code >= 400:
            raise RuntimeError(
                f"Scenario API {method} {path} failed after retries: "
                f"{response.status_code if response is not None else 'no response'}"
            )
        if not response.text:
            return {}
        return response.json()

    def upload_image(self, path: Path) -> str:
        content_type = mimetypes.guess_type(path.name)[0] or "image/png"
        data = path.read_bytes()
        if len(data) < 6 * 1024 * 1024:
            payload = {
                "image": base64.b64encode(data).decode("ascii"),
                "name": path.name,
            }
            response = self.request_json("POST", "/assets", headers=self.headers(), json=payload)
            return str(response["asset"]["id"])
        return self.upload_large_file(path, kind="image", content_type=content_type)

    def upload_large_file(self, path: Path, *, kind: str, content_type: str) -> str:
        init = self.request_json(
            "POST",
            "/uploads",
            headers=self.headers(),
            json={
                "fileName": path.name,
                "contentType": content_type,
                "kind": kind,
                "parts": 1,
                "fileSize": path.stat().st_size,
            },
        )
        upload = init["upload"]
        upload_id = upload["id"]
        part = upload["parts"][0]
        with path.open("rb") as handle:
            put_response = self.session.put(part["url"], data=handle, timeout=300)
        if put_response.status_code >= 400:
            raise RuntimeError(f"Scenario presigned upload failed: {put_response.status_code} {put_response.text}")
        self.request_json("POST", f"/uploads/{upload_id}/action", headers=self.headers(), json={"action": "complete"})

        deadline = time.time() + self.timeout_s
        while time.time() < deadline:
            status = self.request_json("GET", f"/uploads/{upload_id}", headers=self.headers(json_content=False))
            upload_status = status["upload"]
            if upload_status.get("status") == "imported" and upload_status.get("entityId"):
                return str(upload_status["entityId"])
            if upload_status.get("status") == "failed":
                raise RuntimeError(f"Scenario upload failed: {upload_status.get('errorMessage')}")
            time.sleep(self.poll_interval_s)
        raise TimeoutError(f"Timed out waiting for Scenario upload {upload_id}")

    def run_model(self, model_id: str, parameters: dict[str, Any]) -> dict[str, Any]:
        response = self.request_json(
            "POST",
            f"/generate/custom/{model_id}",
            headers=self.headers(),
            json=parameters,
        )
        job = response.get("job", {})
        job_id = job.get("jobId") or job.get("id") or response.get("jobId")
        if not job_id:
            raise RuntimeError(f"Scenario generation did not return a job id: {response}")
        return self.poll_job(str(job_id))

    def poll_job(self, job_id: str) -> dict[str, Any]:
        deadline = time.time() + self.timeout_s
        while time.time() < deadline:
            response = self.request_json("GET", f"/jobs/{job_id}", headers=self.headers(json_content=False))
            job = response["job"]
            status = str(job.get("status", "")).lower()
            if status in {"success", "succeeded"}:
                return job
            if status in {"failed", "failure", "canceled", "cancelled"}:
                raise RuntimeError(f"Scenario job {job_id} ended with status {status}: {job}")
            time.sleep(self.poll_interval_s)
        raise TimeoutError(f"Timed out waiting for Scenario job {job_id}")

    def asset_url(self, asset_id: str) -> str:
        response = self.request_json("GET", f"/assets/{asset_id}", headers=self.headers(json_content=False))
        return str(response["asset"]["url"])

    def download_asset(self, asset_id: str, output_path: Path) -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        response = self.session.get(self.asset_url(asset_id), timeout=300)
        if response.status_code >= 400:
            raise RuntimeError(f"Failed to download Scenario asset {asset_id}: {response.status_code} {response.text}")
        output_path.write_bytes(response.content)


def asset_ids_from_job(job: dict[str, Any]) -> list[str]:
    metadata = job.get("metadata", {}) or {}
    ids = metadata.get("assetIds") or metadata.get("asset_ids") or []
    if ids:
        return [str(asset_id) for asset_id in ids]
    assets = job.get("assets") or []
    if isinstance(assets, list):
        return [str(asset.get("id")) for asset in assets if isinstance(asset, dict) and asset.get("id")]
    result = job.get("result") or {}
    if isinstance(result, dict):
        result_ids = result.get("assetIds") or result.get("asset_ids") or []
        return [str(asset_id) for asset_id in result_ids]
    return []


def resolve_path(value: str, run_dir: Path) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    for base in (asset_pipeline.ROOT, run_dir):
        candidate = base / path
        if candidate.exists():
            return candidate
    return asset_pipeline.ROOT / path


def prompt_for_item(item: dict[str, Any]) -> str:
    return asset_factories.prompt_for_item(item)


def output_path_for_item(run_dir: Path, item: dict[str, Any]) -> Path:
    return asset_factories.plan_for_item(run_dir, item).primary_output


def run_reference_edit(
    client: ScenarioClient,
    reference_asset_id: str,
    prompt: str,
    *,
    resolution: str,
    num_outputs: int,
    aspect_ratio: str = "auto",
) -> tuple[dict[str, Any], list[str]]:
    generation = client.run_model(
        MODEL_GEMINI_EDIT,
        {
            "prompt": prompt,
            "referenceImages": [reference_asset_id],
            "aspectRatio": aspect_ratio,
            "resolution": resolution,
            "numOutputs": num_outputs,
            "useGoogleSearch": False,
        },
    )
    generated_ids = asset_ids_from_job(generation)
    if not generated_ids:
        raise RuntimeError("Scenario Gemini edit did not return generated asset ids.")
    return generation, generated_ids


def background_removal_parameters(model_id: str, source_asset_id: str) -> dict[str, Any]:
    if model_id == MODEL_PIXA_BACKGROUND_REMOVE:
        return {"image": source_asset_id, "outputFormat": "rgba"}
    return {"image": source_asset_id}


def run_background_removal(client: ScenarioClient, source_asset_id: str) -> tuple[str, dict[str, Any], list[dict[str, Any]]]:
    errors: list[dict[str, Any]] = []
    for model_id in BACKGROUND_REMOVE_MODELS:
        try:
            job = client.run_model(model_id, background_removal_parameters(model_id, source_asset_id))
            alpha_ids = asset_ids_from_job(job)
            if not alpha_ids:
                errors.append({"model_id": model_id, "error": "Background removal returned no asset ids."})
                continue
            step = {
                "step": "background_removal",
                "model_id": model_id,
                "job_id": job.get("jobId"),
                "asset_id": alpha_ids[0],
            }
            if errors:
                step["fallback_from"] = errors
            return alpha_ids[0], step, errors
        except Exception as exc:
            errors.append({"model_id": model_id, "error": str(exc)})
    raise RuntimeError(f"All background removal models failed: {errors}")


def run_alpha_trim(client: ScenarioClient, source_asset_id: str) -> tuple[str, list[dict[str, Any]]]:
    alpha_asset_id, alpha_step, _errors = run_background_removal(client, source_asset_id)
    trim_job = client.run_model(MODEL_PADDING_REMOVE, {"image": alpha_asset_id})
    trim_ids = asset_ids_from_job(trim_job)
    if not trim_ids:
        raise RuntimeError("Scenario padding remover did not return asset ids.")

    return trim_ids[0], [
        alpha_step,
        {
            "step": "transparent_padding_trim",
            "model_id": MODEL_PADDING_REMOVE,
            "job_id": trim_job.get("jobId"),
            "asset_id": trim_ids[0],
        },
    ]


def write_asset_manifest(plan: asset_factories.FactoryPlan, result: dict[str, Any]) -> None:
    asset_pipeline.write_json(plan.manifest_path, {"plan": plan.to_dict(), "result": result})


def process_static_sprite(
    client: ScenarioClient,
    run_dir: Path,
    item: dict[str, Any],
    *,
    resolution: str,
    num_outputs: int,
) -> dict[str, Any]:
    plan = asset_factories.plan_for_item(run_dir, item)
    crop_path = resolve_path(str(item["crop_path"]), run_dir)
    uploaded_asset_id = client.upload_image(crop_path)

    prompt = prompt_for_item(item)
    generation, generated_ids = run_reference_edit(
        client,
        uploaded_asset_id,
        prompt,
        resolution=resolution,
        num_outputs=num_outputs,
    )
    selected_generated_id = generated_ids[-1] if len(generated_ids) > 1 else generated_ids[0]
    final_asset_id, alpha_steps = run_alpha_trim(client, selected_generated_id)

    final_path = plan.primary_output
    client.download_asset(final_asset_id, final_path)
    result = {
        "asset_id": item["asset_id"],
        "name": item.get("name"),
        "category": item.get("category"),
        "route": plan.route,
        "source_crop": str(crop_path),
        "final_path": str(final_path),
        "scenario_asset_id": final_asset_id,
        "steps": [
            {"step": "upload_reference_crop", "asset_id": uploaded_asset_id},
            {
                "step": "reference_guided_sprite_recreation",
                "model_id": MODEL_GEMINI_EDIT,
                "job_id": generation.get("jobId"),
                "asset_ids": generated_ids,
                "selected_asset_id": selected_generated_id,
            },
            *alpha_steps,
        ],
    }
    write_asset_manifest(plan, result)
    return result


def process_background_plate(
    client: ScenarioClient,
    run_dir: Path,
    item: dict[str, Any],
    *,
    resolution: str,
) -> dict[str, Any]:
    plan = asset_factories.plan_for_item(run_dir, item)
    crop_path = resolve_path(str(item["crop_path"]), run_dir)
    uploaded_asset_id = client.upload_image(crop_path)
    generation, generated_ids = run_reference_edit(
        client,
        uploaded_asset_id,
        prompt_for_item(item),
        resolution=resolution,
        num_outputs=1,
    )
    final_asset_id = generated_ids[0]
    final_path = plan.primary_output
    client.download_asset(final_asset_id, final_path)
    result = {
        "asset_id": item["asset_id"],
        "name": item.get("name"),
        "category": item.get("category"),
        "route": plan.route,
        "source_crop": str(crop_path),
        "final_path": str(final_path),
        "scenario_asset_id": final_asset_id,
        "steps": [
            {"step": "upload_reference_crop", "asset_id": uploaded_asset_id},
            {
                "step": "background_plate_cleanup",
                "model_id": MODEL_GEMINI_EDIT,
                "job_id": generation.get("jobId"),
                "asset_id": final_asset_id,
            },
        ],
    }
    write_asset_manifest(plan, result)
    return result


def segment_character_parts(
    client: ScenarioClient,
    plan: asset_factories.FactoryPlan,
    source_asset_id: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    part_steps: list[dict[str, Any]] = []
    part_errors: list[dict[str, Any]] = []
    parts_dir = Path(str(plan.outputs["parts_dir"]))
    parts_dir.mkdir(parents=True, exist_ok=True)

    for part_id in asset_factories.CHARACTER_PARTS:
        prompt = CHARACTER_PART_PROMPTS[part_id]
        try:
            job = client.run_model(
                MODEL_SAM_IMAGE,
                {
                    "image": source_asset_id,
                    "imagePromptingText": prompt,
                },
            )
            part_ids = asset_ids_from_job(job)
            if not part_ids:
                part_errors.append({"part": part_id, "error": "SAM returned no asset ids."})
                continue
            part_path = parts_dir / f"{part_id}.png"
            client.download_asset(part_ids[0], part_path)
            part_steps.append(
                {
                    "step": "character_part_segmentation",
                    "part": part_id,
                    "model_id": MODEL_SAM_IMAGE,
                    "job_id": job.get("jobId"),
                    "asset_id": part_ids[0],
                    "path": str(part_path),
                }
            )
        except Exception as exc:
            part_errors.append({"part": part_id, "error": str(exc)})
    return part_steps, part_errors


def character_parts_sheet_prompt(item: dict[str, Any]) -> str:
    return CHARACTER_PART_SHEET_PROMPT_TEMPLATE.format(
        name=item.get("name", item.get("asset_id", "character")),
        description=item.get("visual_description", ""),
    )


def trim_transparent(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    bbox = rgba.getchannel("A").getbbox()
    if not bbox:
        return Image.new("RGBA", (8, 8), (0, 0, 0, 0))
    return rgba.crop(bbox)


def slice_parts_sheet(sheet_path: Path, plan: asset_factories.FactoryPlan) -> list[dict[str, Any]]:
    image = Image.open(sheet_path).convert("RGBA")
    grid = plan.outputs["part_sheet_grid"]
    columns = int(grid["columns"])
    rows = int(grid["rows"])
    order = list(grid["order"])
    cell_w = image.width // columns
    cell_h = image.height // rows
    parts_dir = Path(str(plan.outputs["parts_dir"]))
    parts_dir.mkdir(parents=True, exist_ok=True)

    outputs: list[dict[str, Any]] = []
    for idx, part_id in enumerate(order):
        col = idx % columns
        row = idx // columns
        left = col * cell_w
        top = row * cell_h
        right = image.width if col == columns - 1 else (col + 1) * cell_w
        bottom = image.height if row == rows - 1 else (row + 1) * cell_h
        part = trim_transparent(image.crop((left, top, right, bottom)))
        part_path = parts_dir / f"{part_id}.png"
        part.save(part_path)
        outputs.append({"part": part_id, "path": str(part_path), "size": [part.width, part.height]})
    return outputs


def generate_character_parts_sheet(
    client: ScenarioClient,
    plan: asset_factories.FactoryPlan,
    source_asset_id: str,
    item: dict[str, Any],
    *,
    resolution: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    steps: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    generation, generated_ids = run_reference_edit(
        client,
        source_asset_id,
        character_parts_sheet_prompt(item),
        resolution=resolution,
        num_outputs=1,
        aspect_ratio="4:3",
    )
    sheet_asset_id = generated_ids[0]
    steps.append(
        {
            "step": "character_parts_sheet_generation",
            "model_id": MODEL_GEMINI_EDIT,
            "job_id": generation.get("jobId"),
            "asset_id": sheet_asset_id,
        }
    )

    try:
        sheet_asset_id, alpha_step, fallback_errors = run_background_removal(client, sheet_asset_id)
        alpha_step["step"] = "parts_sheet_background_removal"
        if fallback_errors:
            alpha_step["fallback_from"] = fallback_errors
        steps.append(alpha_step)
    except Exception as exc:
        errors.append({"step": "parts_sheet_background_removal", "error": str(exc)})

    sheet_path = Path(str(plan.outputs["parts_sheet"]))
    client.download_asset(sheet_asset_id, sheet_path)
    steps.append({"step": "download_parts_sheet", "asset_id": sheet_asset_id, "path": str(sheet_path)})

    sliced = slice_parts_sheet(sheet_path, plan)
    steps.append({"step": "slice_part_sheet", "parts": sliced})
    return steps, errors


def process_character_rig(
    client: ScenarioClient,
    run_dir: Path,
    item: dict[str, Any],
    *,
    resolution: str,
    num_outputs: int,
    extract_parts: bool,
) -> dict[str, Any]:
    plan = asset_factories.plan_for_item(run_dir, item)
    crop_path = resolve_path(str(item["crop_path"]), run_dir)
    uploaded_asset_id = client.upload_image(crop_path)
    generation, generated_ids = run_reference_edit(
        client,
        uploaded_asset_id,
        prompt_for_item(item),
        resolution=resolution,
        num_outputs=num_outputs,
    )
    selected_generated_id = generated_ids[-1] if len(generated_ids) > 1 else generated_ids[0]
    final_asset_id, alpha_steps = run_alpha_trim(client, selected_generated_id)

    full_path = plan.primary_output
    client.download_asset(final_asset_id, full_path)

    rig_path = Path(str(plan.outputs["rig"]))
    rig_template = dict(plan.outputs["rig_template"])
    rig_template["source"] = {
        "full_png": str(full_path),
        "scenario_asset_id": final_asset_id,
        "source_crop": str(crop_path),
    }
    asset_pipeline.write_json(rig_path, rig_template)

    part_steps: list[dict[str, Any]] = []
    part_errors: list[dict[str, Any]] = []
    if extract_parts:
        try:
            part_steps, part_errors = generate_character_parts_sheet(
                client,
                plan,
                final_asset_id,
                item,
                resolution=resolution,
            )
        except Exception as exc:
            part_errors.append({"step": "character_parts_sheet_generation", "error": str(exc)})
            sam_steps, sam_errors = segment_character_parts(client, plan, final_asset_id)
            part_steps.extend(sam_steps)
            part_errors.extend(sam_errors)

    result = {
        "asset_id": item["asset_id"],
        "name": item.get("name"),
        "category": item.get("category"),
        "route": plan.route,
        "source_crop": str(crop_path),
        "final_path": str(full_path),
        "rig_path": str(rig_path),
        "scenario_asset_id": final_asset_id,
        "part_errors": part_errors,
        "steps": [
            {"step": "upload_reference_crop", "asset_id": uploaded_asset_id},
            {
                "step": "reference_guided_character_seed",
                "model_id": MODEL_GEMINI_EDIT,
                "job_id": generation.get("jobId"),
                "asset_ids": generated_ids,
                "selected_asset_id": selected_generated_id,
            },
            *alpha_steps,
            {"step": "emit_rig_json", "path": str(rig_path)},
            *part_steps,
        ],
    }
    write_asset_manifest(plan, result)
    return result


def process_procedural_vfx(run_dir: Path, item: dict[str, Any]) -> dict[str, Any]:
    plan = asset_factories.plan_for_item(run_dir, item)
    crop_path = resolve_path(str(item["crop_path"]), run_dir)
    image = Image.open(crop_path)
    prompt = (
        plan.prompts["gemini_codegen"]
        + "\n\nReturn JSON with keys: summary, duration_ms, palette, particle_config, typescript."
    )
    config = types.GenerateContentConfig(
        responseMimeType="application/json",
        mediaResolution=types.MediaResolution.MEDIA_RESOLUTION_HIGH,
        temperature=0.2,
        maxOutputTokens=12000,
    )
    client = asset_pipeline.gemini_client()
    model, response = asset_pipeline.call_model_with_fallback(
        client,
        asset_pipeline.IMAGE_MODELS,
        contents=[image, prompt],
        config=config,
    )
    text = response.text or "{}"
    try:
        payload = json.loads(asset_pipeline.extract_json_payload(text))
    except json.JSONDecodeError:
        payload = {"summary": "Gemini returned non-JSON procedural VFX output.", "raw": text}

    code = str(payload.get("typescript") or payload.get("code") or "")
    if not code:
        code = "/* Gemini procedural VFX response did not include TypeScript. See JSON config. */\n"

    config_path = Path(str(plan.outputs["config"]))
    code_path = Path(str(plan.outputs["code"]))
    asset_pipeline.write_json(
        config_path,
        {
            "asset_id": item["asset_id"],
            "name": item.get("name"),
            "category": item.get("category"),
            "route": plan.route,
            "gemini_model": model,
            "source_crop": str(crop_path),
            "payload": payload,
        },
    )
    code_path.parent.mkdir(parents=True, exist_ok=True)
    code_path.write_text(code.rstrip() + "\n")
    result = {
        "asset_id": item["asset_id"],
        "name": item.get("name"),
        "category": item.get("category"),
        "route": plan.route,
        "source_crop": str(crop_path),
        "final_path": str(code_path),
        "config_path": str(config_path),
        "gemini_model": model,
        "steps": [{"step": "procedural_vfx_codegen", "model": model}],
    }
    write_asset_manifest(plan, result)
    return result


def process_item(
    client: ScenarioClient | None,
    run_dir: Path,
    item: dict[str, Any],
    *,
    resolution: str,
    num_outputs: int,
    extract_character_parts: bool,
) -> dict[str, Any]:
    route = asset_factories.route_for_item(item)
    if route == asset_factories.ROUTE_BACKGROUND_PLATE:
        if client is None:
            raise RuntimeError("Scenario client is required for background plate processing.")
        return process_background_plate(client, run_dir, item, resolution=resolution)
    if route == asset_factories.ROUTE_CHARACTER_RIG:
        if client is None:
            raise RuntimeError("Scenario client is required for character rig processing.")
        return process_character_rig(
            client,
            run_dir,
            item,
            resolution=resolution,
            num_outputs=num_outputs,
            extract_parts=extract_character_parts,
        )
    if route == asset_factories.ROUTE_PROCEDURAL_VFX:
        return process_procedural_vfx(run_dir, item)
    if client is None:
        raise RuntimeError("Scenario client is required for sprite processing.")
    return process_static_sprite(client, run_dir, item, resolution=resolution, num_outputs=num_outputs)


def load_extracted_manifest(run_dir: Path) -> list[dict[str, Any]]:
    manifest = asset_pipeline.read_json(run_dir / "manifests" / "03_extracted_assets_manifest.json")
    return list(manifest.get("assets", []))


def automation_plan_for_items(run_dir: Path, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    plans: list[dict[str, Any]] = []
    for item in items:
        factory_plan = asset_factories.plan_for_item(run_dir, item)
        payload = factory_plan.to_dict()
        payload.update(
            {
                "name": item.get("name"),
                "crop_path": item.get("crop_path"),
                "recreation_strategy": item.get("recreation_strategy")
                or asset_pipeline.default_recreation_strategy(str(item.get("category", "other"))),
            }
        )
        plans.append(payload)
    return plans


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Scenario recreation/enhancement on extracted video-only assets.")
    parser.add_argument("--run", type=Path, required=True, help="Run directory containing manifests/03_extracted_assets_manifest.json.")
    parser.add_argument("--asset-id", action="append", help="Optional asset id filter. Can be passed more than once.")
    parser.add_argument("--limit", type=int, help="Optional max number of assets to process.")
    parser.add_argument("--resolution", default="1K", choices=["512", "1K", "2K", "4K"])
    parser.add_argument("--num-outputs", type=int, default=4)
    parser.add_argument("--skip-character-parts", action="store_true", help="Only emit character full.png and rig.json.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    run_dir = args.run.resolve()
    items = load_extracted_manifest(run_dir)
    if args.asset_id:
        wanted = set(args.asset_id)
        items = [item for item in items if item.get("asset_id") in wanted]
    if args.limit is not None:
        items = items[: args.limit]

    plan = automation_plan_for_items(run_dir, items)
    if args.dry_run:
        asset_pipeline.write_json(run_dir / "manifests" / "05_scenario_automation_plan.json", {"assets": plan})
        print(json.dumps({"dry_run": True, "assets": plan}, indent=2))
        return

    requires_scenario = any(
        asset_factories.route_for_item(item) != asset_factories.ROUTE_PROCEDURAL_VFX for item in items
    )
    client = ScenarioClient(load_config()) if requires_scenario else None
    results = [
        process_item(
            client,
            run_dir,
            item,
            resolution=args.resolution,
            num_outputs=args.num_outputs,
            extract_character_parts=not args.skip_character_parts,
        )
        for item in items
    ]
    asset_pipeline.write_json(run_dir / "manifests" / "05_scenario_automation_manifest.json", {"assets": results})
    print(json.dumps({"assets": results}, indent=2))


if __name__ == "__main__":
    main()
