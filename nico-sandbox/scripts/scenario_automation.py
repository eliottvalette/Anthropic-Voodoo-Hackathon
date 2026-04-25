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

import asset_pipeline


SCENARIO_BASE_URL = "https://api.cloud.scenario.com/v1"

MODEL_GEMINI_EDIT = "model_google-gemini-3-1-flash"
MODEL_BACKGROUND_REMOVE = "model_photoroom-background-removal"
MODEL_PADDING_REMOVE = "model_scenario-padding-remover"

FINAL_DIRS = {
    "background": "backgrounds",
    "castle": "props",
    "character": "characters",
    "projectile": "projectiles",
    "weapon": "weapons",
    "ui": "ui",
    "effect": "vfx",
    "other": "misc",
}


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
        response = requests.request(method, self._url(path), params=params, timeout=120, **kwargs)
        if response.status_code >= 400:
            raise RuntimeError(f"Scenario API {method} {path} failed: {response.status_code} {response.text}")
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
            put_response = requests.put(part["url"], data=handle, timeout=300)
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
        response = requests.get(self.asset_url(asset_id), timeout=300)
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
    if item.get("scenario_prompt"):
        return str(item["scenario_prompt"])
    category = str(item.get("category", "other"))
    raw = {
        "asset_id": item.get("asset_id", "asset"),
        "name": item.get("name", item.get("asset_id", "asset")),
        "category": category,
        "visual_description": item.get("visual_description", ""),
        "gameplay_role": item.get("gameplay_role", ""),
        "best_timestamp_s": item.get("timestamp_s", 0),
        "fallback_timestamps_s": [],
        "approx_box_2d": item.get("gemini_box_2d", [0, 0, 1000, 1000]),
        "isolate_with_background_removal": category != "background",
        "priority": item.get("priority", 3),
        "recreation_strategy": item.get("recreation_strategy") or asset_pipeline.default_recreation_strategy(category),
        "scenario_pipeline": item.get("scenario_pipeline") or asset_pipeline.default_scenario_pipeline(category),
        "animation_notes": item.get("animation_notes", ""),
        "background_plate_notes": item.get("background_plate_notes", ""),
    }
    return asset_pipeline.scenario_prompt_for_candidate(asset_pipeline.Candidate.from_dict(raw))


def output_path_for_item(run_dir: Path, item: dict[str, Any]) -> Path:
    category = str(item.get("category", "other")).lower()
    folder = FINAL_DIRS.get(category, FINAL_DIRS["other"])
    return run_dir / "final-assets" / folder / f"{item['asset_id']}.png"


def process_item(client: ScenarioClient, run_dir: Path, item: dict[str, Any], *, resolution: str, num_outputs: int) -> dict[str, Any]:
    crop_path = resolve_path(str(item["crop_path"]), run_dir)
    category = str(item.get("category", "other")).lower()
    uploaded_asset_id = client.upload_image(crop_path)

    prompt = prompt_for_item(item)
    if category == "background" or item.get("recreation_strategy") == "background_plate_cleanup":
        generation = client.run_model(
            MODEL_GEMINI_EDIT,
            {
                "prompt": prompt,
                "referenceImages": [uploaded_asset_id],
                "aspectRatio": "auto",
                "resolution": resolution,
                "numOutputs": 1,
                "useGoogleSearch": False,
            },
        )
        generated_ids = asset_ids_from_job(generation)
        if not generated_ids:
            raise RuntimeError(f"No generated Scenario asset ids for {item['asset_id']}")
        final_asset_id = generated_ids[0]
        steps = [
            {"step": "upload_reference_crop", "asset_id": uploaded_asset_id},
            {"step": "background_plate_cleanup", "model_id": MODEL_GEMINI_EDIT, "job_id": generation.get("jobId"), "asset_id": final_asset_id},
        ]
    else:
        generation = client.run_model(
            MODEL_GEMINI_EDIT,
            {
                "prompt": prompt,
                "referenceImages": [uploaded_asset_id],
                "aspectRatio": "auto",
                "resolution": resolution,
                "numOutputs": num_outputs,
                "useGoogleSearch": False,
            },
        )
        generated_ids = asset_ids_from_job(generation)
        if not generated_ids:
            raise RuntimeError(f"No generated Scenario asset ids for {item['asset_id']}")
        selected_generated_id = generated_ids[-1] if len(generated_ids) > 1 else generated_ids[0]

        alpha_job = client.run_model(MODEL_BACKGROUND_REMOVE, {"image": selected_generated_id})
        alpha_ids = asset_ids_from_job(alpha_job)
        if not alpha_ids:
            raise RuntimeError(f"No alpha Scenario asset ids for {item['asset_id']}")

        trim_job = client.run_model(MODEL_PADDING_REMOVE, {"image": alpha_ids[0]})
        trim_ids = asset_ids_from_job(trim_job)
        if not trim_ids:
            raise RuntimeError(f"No trimmed Scenario asset ids for {item['asset_id']}")
        final_asset_id = trim_ids[0]
        steps = [
            {"step": "upload_reference_crop", "asset_id": uploaded_asset_id},
            {
                "step": "reference_guided_sprite_recreation",
                "model_id": MODEL_GEMINI_EDIT,
                "job_id": generation.get("jobId"),
                "asset_ids": generated_ids,
                "selected_asset_id": selected_generated_id,
            },
            {"step": "background_removal", "model_id": MODEL_BACKGROUND_REMOVE, "job_id": alpha_job.get("jobId"), "asset_id": alpha_ids[0]},
            {"step": "transparent_padding_trim", "model_id": MODEL_PADDING_REMOVE, "job_id": trim_job.get("jobId"), "asset_id": final_asset_id},
        ]

    final_path = output_path_for_item(run_dir, item)
    client.download_asset(final_asset_id, final_path)
    return {
        "asset_id": item["asset_id"],
        "name": item.get("name"),
        "category": item.get("category"),
        "source_crop": str(crop_path),
        "final_path": str(final_path),
        "scenario_asset_id": final_asset_id,
        "steps": steps,
    }


def load_extracted_manifest(run_dir: Path) -> list[dict[str, Any]]:
    manifest = asset_pipeline.read_json(run_dir / "manifests" / "03_extracted_assets_manifest.json")
    return list(manifest.get("assets", []))


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Scenario recreation/enhancement on extracted video-only assets.")
    parser.add_argument("--run", type=Path, required=True, help="Run directory containing manifests/03_extracted_assets_manifest.json.")
    parser.add_argument("--asset-id", action="append", help="Optional asset id filter. Can be passed more than once.")
    parser.add_argument("--limit", type=int, help="Optional max number of assets to process.")
    parser.add_argument("--resolution", default="1K", choices=["512", "1K", "2K", "4K"])
    parser.add_argument("--num-outputs", type=int, default=4)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    run_dir = args.run.resolve()
    items = load_extracted_manifest(run_dir)
    if args.asset_id:
        wanted = set(args.asset_id)
        items = [item for item in items if item.get("asset_id") in wanted]
    if args.limit is not None:
        items = items[: args.limit]

    plan = [
        {
            "asset_id": item["asset_id"],
            "name": item.get("name"),
            "category": item.get("category"),
            "recreation_strategy": item.get("recreation_strategy") or asset_pipeline.default_recreation_strategy(str(item.get("category", "other"))),
            "output_path": str(output_path_for_item(run_dir, item)),
        }
        for item in items
    ]
    if args.dry_run:
        asset_pipeline.write_json(run_dir / "manifests" / "05_scenario_automation_plan.json", {"assets": plan})
        print(json.dumps({"dry_run": True, "assets": plan}, indent=2))
        return

    client = ScenarioClient(load_config())
    results = [process_item(client, run_dir, item, resolution=args.resolution, num_outputs=args.num_outputs) for item in items]
    asset_pipeline.write_json(run_dir / "manifests" / "05_scenario_automation_manifest.json", {"assets": results})
    print(json.dumps({"assets": results}, indent=2))


if __name__ == "__main__":
    main()
