from __future__ import annotations

import argparse
import json
import sys
import traceback
from pathlib import Path
from typing import Any

import asset_factories
import asset_pipeline
import run_full_asset_pipeline as runner
import scenario_automation


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
    refinement = refinement.strip()
    if not refinement:
        return prompt
    return (
        prompt.rstrip()
        + "\n\n--- USER REFINEMENT (apply on top of everything above, do not contradict the STYLE LOCK) ---\n"
        + refinement
    )


def merge_into_manifest(run_dir: Path, result: dict[str, Any]) -> None:
    manifest_path = run_dir / "manifests" / "05_scenario_automation_manifest.json"
    payload = asset_pipeline.read_json(manifest_path) if manifest_path.exists() else {"assets": []}
    existing = runner.merge_result(list(payload.get("assets", [])), result)
    payload["assets"] = existing
    payload["completed_assets"] = len([item for item in existing if runner.result_is_complete(item)])
    payload["failed_assets"] = len([item for item in existing if item.get("error")])
    payload["updated_at"] = runner.utc_now()
    payload.setdefault("status", "running")
    asset_pipeline.write_json(manifest_path, payload)


def regenerate_asset(args: argparse.Namespace) -> dict[str, Any]:
    run_dir = args.run.resolve()
    item = find_extracted_item(run_dir, args.asset_id)
    if item is None:
        raise FileNotFoundError(f"asset_id not found in extracted manifest: {args.asset_id}")

    item = dict(item)
    item["scenario_prompt"] = append_user_refinement(
        str(item.get("scenario_prompt", "")),
        args.additional_prompt or "",
    )
    route = asset_factories.route_for_item(item)
    client = None
    if route != asset_factories.ROUTE_PROCEDURAL_VFX:
        client = scenario_automation.ScenarioClient(scenario_automation.load_config())

    result = scenario_automation.process_item(
        client,
        run_dir,
        item,
        resolution=args.resolution,
        num_outputs=args.num_outputs,
        extract_character_parts=not args.skip_character_parts,
    )
    if args.additional_prompt:
        result["last_user_refinement"] = args.additional_prompt
    merge_into_manifest(run_dir, result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Regenerate one sandbox asset and merge it into the run checkpoint.")
    parser.add_argument("--run", type=Path, required=True, help="Path to a nico-sandbox/runs/<video_id> directory.")
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--additional-prompt", default="")
    parser.add_argument("--resolution", default="1K", choices=["512", "1K", "2K", "4K"])
    parser.add_argument("--num-outputs", type=int, default=1)
    parser.add_argument("--skip-character-parts", action="store_true")
    args = parser.parse_args()

    try:
        result = regenerate_asset(args)
        print(json.dumps({"status": "done", "asset_id": args.asset_id, "final_path": result.get("final_path")}))
    except Exception as exc:
        run_dir = args.run.resolve()
        item = find_extracted_item(run_dir, args.asset_id) or {}
        result = {
            "asset_id": args.asset_id,
            "name": item.get("name"),
            "category": item.get("category"),
            "route": asset_factories.route_for_item(item) if item else None,
            "source_crop": item.get("crop_path"),
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }
        try:
            merge_into_manifest(run_dir, result)
        except Exception:
            print(traceback.format_exc(), file=sys.stderr)
        print(json.dumps({"status": "error", "asset_id": args.asset_id, "error": str(exc)}), file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
