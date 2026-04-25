"""
Local sandbox UI for the asset pipeline.

Usage:
  python sandbox_server.py --run ../runs/B11 [--port 8000]

Reads checkpoints from <run>/manifests/05_scenario_automation_manifest.json so
the UI shows assets appearing live as the main pipeline writes them. Each card
exposes a "Regenerate" button with an optional additional prompt that is
appended (under USER REFINEMENT) to the asset's existing style-locked prompt.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import time
import traceback
import uuid
from collections import defaultdict
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

import asset_pipeline
import asset_factories
import run_full_asset_pipeline as runner
import scenario_automation


SCRIPT_DIR = Path(__file__).resolve().parent
UI_HTML = SCRIPT_DIR / "sandbox_ui.html"


def find_extracted_item(run_dir: Path, asset_id: str) -> dict[str, Any] | None:
    path = run_dir / "manifests" / "03_extracted_assets_manifest.json"
    if not path.exists():
        return None
    payload = asset_pipeline.read_json(path)
    for item in payload.get("assets", []):
        if str(item.get("asset_id")) == asset_id:
            return item
    return None


def append_user_refinement(prompt: str, refinement: str) -> str:
    refinement = (refinement or "").strip()
    if not refinement:
        return prompt
    return (
        prompt.rstrip()
        + "\n\n--- USER REFINEMENT (apply on top of everything above, do not contradict the STYLE LOCK) ---\n"
        + refinement
    )


class RegenerateRequest(BaseModel):
    asset_id: str
    additional_prompt: str | None = None
    resolution: str = "1K"


class SandboxApp:
    def __init__(self, run_dir: Path, video_path: Path | None) -> None:
        self.run_dir = run_dir.resolve()
        self.video_path = video_path
        self.manifest_path = self.run_dir / "manifests" / "05_scenario_automation_manifest.json"
        self.jobs: dict[str, dict[str, Any]] = {}
        self.locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        self._client: scenario_automation.ScenarioClient | None = None

    @property
    def client(self) -> scenario_automation.ScenarioClient:
        if self._client is None:
            self._client = scenario_automation.ScenarioClient(scenario_automation.load_config())
        return self._client

    def read_manifest(self) -> dict[str, Any]:
        if not self.manifest_path.exists():
            return {"status": "missing", "assets": []}
        return asset_pipeline.read_json(self.manifest_path)

    def merge_into_manifest(self, result: dict[str, Any]) -> None:
        payload = self.read_manifest()
        existing = list(payload.get("assets", []))
        existing = runner.merge_result(existing, result)
        payload["assets"] = existing
        payload["completed_assets"] = len([r for r in existing if runner.result_is_complete(r)])
        payload["failed_assets"] = len([r for r in existing if r.get("error")])
        payload["updated_at"] = runner.utc_now()
        asset_pipeline.write_json(self.manifest_path, payload)

    async def regenerate(self, req: RegenerateRequest) -> dict[str, Any]:
        item = find_extracted_item(self.run_dir, req.asset_id)
        if item is None:
            raise HTTPException(404, f"asset_id not found in extracted manifest: {req.asset_id}")

        item = dict(item)
        original_prompt = str(item.get("scenario_prompt", ""))
        item["scenario_prompt"] = append_user_refinement(original_prompt, req.additional_prompt or "")

        job_id = uuid.uuid4().hex[:10]
        job = {
            "job_id": job_id,
            "asset_id": req.asset_id,
            "status": "running",
            "started_at": time.time(),
            "additional_prompt": req.additional_prompt or "",
        }
        self.jobs[job_id] = job

        async def _run() -> None:
            lock = self.locks[req.asset_id]
            async with lock:
                try:
                    result = await asyncio.to_thread(
                        scenario_automation.process_item,
                        self.client,
                        self.run_dir,
                        item,
                        resolution=req.resolution,
                        num_outputs=1,
                        extract_character_parts=True,
                    )
                    if req.additional_prompt:
                        result["last_user_refinement"] = req.additional_prompt
                    self.merge_into_manifest(result)
                    job["status"] = "done"
                    job["finished_at"] = time.time()
                    job["final_path"] = result.get("final_path")
                except Exception as exc:
                    err_result = {
                        "asset_id": req.asset_id,
                        "name": item.get("name"),
                        "category": item.get("category"),
                        "route": asset_factories.route_for_item(item),
                        "source_crop": item.get("crop_path"),
                        "error": str(exc),
                        "traceback": traceback.format_exc(),
                    }
                    self.merge_into_manifest(err_result)
                    job["status"] = "error"
                    job["finished_at"] = time.time()
                    job["error"] = str(exc)

        asyncio.create_task(_run())
        return job


def build_app(run_dir: Path, video_path: Path | None) -> FastAPI:
    sandbox = SandboxApp(run_dir, video_path)
    app = FastAPI(title="Asset Pipeline Sandbox")

    if not run_dir.exists():
        raise FileNotFoundError(f"run_dir does not exist: {run_dir}")

    final_assets_dir = run_dir / "final-assets"
    final_assets_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/files/final-assets", StaticFiles(directory=str(final_assets_dir)), name="final_assets")
    crops_dir = run_dir / "extracted" / "crops"
    if crops_dir.exists():
        app.mount("/files/crops", StaticFiles(directory=str(crops_dir)), name="crops")

    @app.get("/", response_class=HTMLResponse)
    async def index() -> HTMLResponse:
        return HTMLResponse(UI_HTML.read_text(encoding="utf-8"))

    @app.get("/api/manifest")
    async def api_manifest() -> dict[str, Any]:
        payload = sandbox.read_manifest()
        extracted_path = run_dir / "manifests" / "03_extracted_assets_manifest.json"
        extracted = (
            asset_pipeline.read_json(extracted_path).get("assets", [])
            if extracted_path.exists()
            else []
        )
        ext_by_id = {str(item.get("asset_id")): item for item in extracted}

        assets = []
        for asset in payload.get("assets", []):
            asset_id = str(asset.get("asset_id"))
            ext = ext_by_id.get(asset_id, {})
            final_path = asset.get("final_path")
            rel_url = None
            if final_path:
                try:
                    rel = Path(final_path).resolve().relative_to(final_assets_dir.resolve())
                    rel_url = f"/files/final-assets/{rel.as_posix()}"
                except ValueError:
                    rel_url = None
            crop_url = None
            if ext.get("crop_path"):
                try:
                    rel = Path(ext["crop_path"]).resolve().relative_to(crops_dir.resolve())
                    crop_url = f"/files/crops/{rel.as_posix()}"
                except (ValueError, FileNotFoundError):
                    crop_url = None
            assets.append(
                {
                    "asset_id": asset_id,
                    "name": asset.get("name"),
                    "category": asset.get("category"),
                    "route": asset.get("route"),
                    "status": "error" if asset.get("error") else ("done" if final_path else "pending"),
                    "error": asset.get("error"),
                    "final_url": rel_url,
                    "crop_url": crop_url,
                    "last_user_refinement": asset.get("last_user_refinement"),
                    "visual_description": ext.get("visual_description"),
                }
            )

        return {
            "run_dir": str(run_dir),
            "status": payload.get("status"),
            "updated_at": payload.get("updated_at"),
            "completed_assets": payload.get("completed_assets"),
            "failed_assets": payload.get("failed_assets"),
            "planned_assets": payload.get("planned_assets") or len(assets),
            "art_style": (
                asset_pipeline.read_json(run_dir / "manifests" / "01_gemini_video_manifest.json").get("art_style")
                if (run_dir / "manifests" / "01_gemini_video_manifest.json").exists()
                else None
            ),
            "assets": assets,
        }

    @app.get("/api/jobs")
    async def api_jobs() -> dict[str, Any]:
        return {"jobs": list(sandbox.jobs.values())}

    @app.post("/api/regenerate")
    async def api_regenerate(req: RegenerateRequest) -> dict[str, Any]:
        return await sandbox.regenerate(req)

    @app.get("/api/asset/{asset_id}/prompt")
    async def api_asset_prompt(asset_id: str) -> dict[str, Any]:
        item = find_extracted_item(run_dir, asset_id)
        if item is None:
            raise HTTPException(404, f"asset_id not found: {asset_id}")
        return {
            "asset_id": asset_id,
            "scenario_prompt": item.get("scenario_prompt"),
            "visual_description": item.get("visual_description"),
            "category": item.get("category"),
            "name": item.get("name"),
        }

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="Local sandbox UI for the asset pipeline.")
    parser.add_argument("--run", type=Path, required=True, help="Path to a runs/<video> directory.")
    parser.add_argument("--video", type=Path, default=None, help="Optional path to source video (only needed for full reruns).")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    app = build_app(args.run.resolve(), args.video.resolve() if args.video else None)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
