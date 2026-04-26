from __future__ import annotations

import argparse
import concurrent.futures
import json
import sys
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import asset_factories
import asset_pipeline
import scenario_automation


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def default_run_dir(video_path: Path) -> Path:
    return asset_pipeline.ROOT / "nico-sandbox" / "runs" / asset_pipeline.safe_slug(video_path.stem)


def selected_items(items: list[dict[str, Any]], asset_ids: list[str] | None, limit: int | None) -> list[dict[str, Any]]:
    if asset_ids:
        wanted = set(asset_ids)
        items = [item for item in items if item.get("asset_id") in wanted]
    if limit is not None:
        items = items[:limit]
    return items


def previous_results(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    payload = asset_pipeline.read_json(path)
    return list(payload.get("assets", []))


def result_is_complete(result: dict[str, Any]) -> bool:
    if result.get("error"):
        return False
    final_path = result.get("final_path")
    return bool(final_path and Path(str(final_path)).exists())


def merge_result(results: list[dict[str, Any]], result: dict[str, Any]) -> list[dict[str, Any]]:
    asset_id = result.get("asset_id")
    kept = [existing for existing in results if existing.get("asset_id") != asset_id]
    kept.append(result)
    return kept


def write_checkpoint(
    manifest_path: Path,
    *,
    video_path: Path,
    run_dir: Path,
    plan: list[dict[str, Any]],
    results: list[dict[str, Any]],
    status: str,
) -> None:
    asset_pipeline.write_json(
        manifest_path,
        {
            "status": status,
            "updated_at": utc_now(),
            "source_video": str(video_path),
            "run_dir": str(run_dir),
            "plan_path": str(run_dir / "manifests" / "05_scenario_automation_plan.json"),
            "planned_assets": len(plan),
            "completed_assets": len([result for result in results if result_is_complete(result)]),
            "failed_assets": len([result for result in results if result.get("error")]),
            "assets": results,
        },
    )


def load_or_generate_inventory(args: argparse.Namespace, run_dir: Path) -> dict[str, Any]:
    manifest_path = run_dir / "manifests" / "01_gemini_video_manifest.json"
    if args.skip_video_gemini:
        if not manifest_path.exists():
            raise FileNotFoundError(f"Missing existing Gemini video manifest: {manifest_path}")
        print(f"[pipeline] Reusing Gemini video manifest: {manifest_path}")
        return asset_pipeline.read_json(manifest_path)
    print(f"[pipeline] Running Gemini video inventory for {args.video}")
    return asset_pipeline.generate_manifest(args.video, run_dir, fps=args.fps)


def load_or_extract_assets(args: argparse.Namespace, run_dir: Path, inventory: dict[str, Any]) -> list[dict[str, Any]]:
    extracted_path = run_dir / "manifests" / "03_extracted_assets_manifest.json"
    if args.skip_extraction:
        if not extracted_path.exists():
            raise FileNotFoundError(f"Missing existing extracted assets manifest: {extracted_path}")
        print(f"[pipeline] Reusing extracted assets manifest: {extracted_path}")
        return scenario_automation.load_extracted_manifest(run_dir)
    print("[pipeline] Extracting timestamped frames, refining boxes, and writing crops")
    return asset_pipeline.extract_candidates(inventory, args.video, run_dir, refine=not args.skip_refine)


def process_assets(args: argparse.Namespace, run_dir: Path, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    plan = scenario_automation.automation_plan_for_items(run_dir, items)
    plan_path = run_dir / "manifests" / "05_scenario_automation_plan.json"
    manifest_path = run_dir / "manifests" / "05_scenario_automation_manifest.json"
    asset_pipeline.write_json(plan_path, {"assets": plan})
    print(f"[pipeline] Wrote Scenario/Gemini asset plan: {plan_path}")

    if args.dry_run_scenario:
        asset_pipeline.write_json(
            run_dir / "manifests" / "05_scenario_automation_dry_run.json",
            {
                "status": "dry_run",
                "updated_at": utc_now(),
                "source_video": str(args.video),
                "run_dir": str(run_dir),
                "planned_assets": len(plan),
                "assets": plan,
            },
        )
        return []

    results = [] if args.force else previous_results(manifest_path)
    completed_ids = {
        str(result.get("asset_id"))
        for result in results
        if result_is_complete(result)
    }

    requires_scenario = any(
        asset_factories.route_for_item(item) != asset_factories.ROUTE_PROCEDURAL_VFX
        and (args.force or str(item.get("asset_id")) not in completed_ids)
        for item in items
    )
    client = scenario_automation.ScenarioClient(scenario_automation.load_config()) if requires_scenario else None

    write_checkpoint(
        manifest_path,
        video_path=args.video,
        run_dir=run_dir,
        plan=plan,
        results=results,
        status="running",
    )

    total = len(items)
    pending: list[dict[str, Any]] = []
    for item in items:
        asset_id = str(item.get("asset_id"))
        if not args.force and asset_id in completed_ids:
            print(f"[pipeline] skipping completed {asset_id}")
        else:
            pending.append(item)

    def _process(item: dict[str, Any]) -> dict[str, Any]:
        asset_id = str(item.get("asset_id"))
        route = asset_factories.route_for_item(item)
        try:
            return scenario_automation.process_item(
                client,
                run_dir,
                item,
                resolution=args.resolution,
                num_outputs=args.num_outputs,
                extract_character_parts=not args.skip_character_parts,
            )
        except Exception as exc:
            return {
                "asset_id": asset_id,
                "name": item.get("name"),
                "category": item.get("category"),
                "route": route,
                "source_crop": item.get("crop_path"),
                "error": str(exc),
                "traceback": traceback.format_exc(),
            }

    if pending:
        max_workers = max(1, min(args.max_workers, len(pending)))
        print(f"[pipeline] dispatching {len(pending)} assets across {max_workers} workers (parallel)")
        checkpoint_lock = threading.Lock()
        completed_so_far = 0
        first_error: Exception | None = None
        per_asset_timeout_s = float(args.per_asset_timeout_s)
        # Overall wall-clock deadline. Sized to give every batch room to
        # finish: ceil(N/workers) batches × per_asset timeout × 1.5 buffer.
        n_batches = (len(pending) + max_workers - 1) // max_workers
        overall_deadline = time.time() + per_asset_timeout_s * n_batches * 1.5
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            future_to_item = {pool.submit(_process, item): item for item in pending}
            remaining = set(future_to_item.keys())

            def _record(item: dict[str, Any], result: dict[str, Any]) -> None:
                nonlocal completed_so_far, first_error, results
                asset_id = str(item.get("asset_id"))
                route = asset_factories.route_for_item(item)
                with checkpoint_lock:
                    results = merge_result(results, result)
                    completed_so_far += 1
                    if result.get("error"):
                        print(
                            f"[pipeline] ERROR ({completed_so_far}/{len(pending)}) "
                            f"{asset_id}: {result['error']}",
                            file=sys.stderr,
                        )
                        if args.stop_on_error and first_error is None:
                            first_error = RuntimeError(
                                f"asset {asset_id} failed: {result['error']}"
                            )
                            pool.shutdown(wait=False, cancel_futures=True)
                    else:
                        completed_ids.add(asset_id)
                        print(
                            f"[pipeline] OK ({completed_so_far}/{len(pending)}) "
                            f"{asset_id} via {route}"
                        )
                    write_checkpoint(
                        manifest_path,
                        video_path=args.video,
                        run_dir=run_dir,
                        plan=plan,
                        results=results,
                        status="failed" if (first_error and args.stop_on_error) else "running",
                    )

            try:
                wait_budget = max(1.0, overall_deadline - time.time())
                for future in as_completed(future_to_item, timeout=wait_budget):
                    remaining.discard(future)
                    item = future_to_item[future]
                    if future.cancelled():
                        continue
                    try:
                        result = future.result(timeout=per_asset_timeout_s)
                    except concurrent.futures.TimeoutError:
                        result = {
                            "asset_id": str(item.get("asset_id")),
                            "name": item.get("name"),
                            "category": item.get("category"),
                            "route": asset_factories.route_for_item(item),
                            "source_crop": item.get("crop_path"),
                            "error": f"per-asset timeout ({per_asset_timeout_s}s) exceeded — Scenario job likely stuck in queue",
                        }
                    except Exception as exc:
                        result = {
                            "asset_id": str(item.get("asset_id")),
                            "name": item.get("name"),
                            "category": item.get("category"),
                            "route": asset_factories.route_for_item(item),
                            "source_crop": item.get("crop_path"),
                            "error": f"{type(exc).__name__}: {exc}",
                            "traceback": traceback.format_exc(),
                        }
                    _record(item, result)
            except concurrent.futures.TimeoutError:
                # Overall wall-clock blew up. Mark anything still pending as
                # failed and bail. In-flight HTTP requests in `requests` can't
                # be aborted (no AbortController) but no new ones will dispatch.
                pool.shutdown(wait=False, cancel_futures=True)
                for future in remaining:
                    item = future_to_item[future]
                    result = {
                        "asset_id": str(item.get("asset_id")),
                        "name": item.get("name"),
                        "category": item.get("category"),
                        "route": asset_factories.route_for_item(item),
                        "source_crop": item.get("crop_path"),
                        "error": "overall pipeline wall-clock exceeded — asset never started or never finished",
                    }
                    _record(item, result)
        if first_error is not None:
            raise first_error

    final_status = "complete"
    if any(result.get("error") for result in results):
        final_status = "complete_with_errors"
    write_checkpoint(
        manifest_path,
        video_path=args.video,
        run_dir=run_dir,
        plan=plan,
        results=results,
        status=final_status,
    )
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the full video-only asset recreation pipeline.")
    parser.add_argument("video", type=Path, help="Input gameplay/ad video path.")
    parser.add_argument("--out", type=Path, help="Run output directory. Defaults to nico-sandbox/runs/<video_stem>.")
    parser.add_argument("--fps", type=float, default=5.0, help="Gemini video sampling FPS metadata.")
    parser.add_argument("--skip-video-gemini", action="store_true", help="Reuse manifests/01_gemini_video_manifest.json.")
    parser.add_argument("--skip-extraction", action="store_true", help="Reuse manifests/03_extracted_assets_manifest.json.")
    parser.add_argument("--skip-refine", action="store_true", help="Skip Gemini frame box refinement during extraction.")
    parser.add_argument("--asset-id", action="append", help="Optional asset id filter. Can be passed more than once.")
    parser.add_argument("--limit", type=int, help="Optional max number of assets to process after sorting/filtering.")
    parser.add_argument("--resolution", default="1K", choices=["512", "1K", "2K", "4K"])
    parser.add_argument("--num-outputs", type=int, default=1, help="Scenario candidate count for sprite/character seed generation.")
    parser.add_argument("--skip-character-parts", action="store_true", help="Only emit character full.png and rig.json.")
    parser.add_argument("--dry-run-scenario", action="store_true", help="Stop after extraction and write the Scenario/Gemini asset plan.")
    parser.add_argument("--force", action="store_true", help="Reprocess assets even if manifest results already exist.")
    parser.add_argument("--stop-on-error", action="store_true", help="Abort the full run on the first failed asset.")
    parser.add_argument(
        "--max-workers",
        type=int,
        default=8,
        help="Maximum concurrent Scenario jobs. Default 8 (empirically clean "
        "with 5.94x speedup; values above can hit Scenario's per-account "
        "concurrency cap and leave the slowest job queued server-side, "
        "causing 'stuck on last asset' symptoms).",
    )
    parser.add_argument(
        "--per-asset-timeout-s",
        type=int,
        default=300,
        help="Wall-clock cap per asset future in the parallel loop. After "
        "this, the slow future is marked failed and the loop moves on. "
        "Default 5 min — enough for character rigs, well below the 600s "
        "Scenario poll deadline.",
    )
    args = parser.parse_args()

    args.video = args.video.resolve()
    if not args.video.exists():
        raise FileNotFoundError(f"Video does not exist: {args.video}")

    run_dir = (args.out or default_run_dir(args.video)).resolve()
    run_dir.mkdir(parents=True, exist_ok=True)
    print(f"[pipeline] Run directory: {run_dir}")

    if args.skip_extraction:
        inventory: dict[str, Any] = {}
    else:
        inventory = load_or_generate_inventory(args, run_dir)
    # If the inventory came from the Claude fallback (Gemini Files API was
    # down/degraded), force --skip-refine. Refinement uses Gemini per-asset
    # and would hang indefinitely against a broken backend.
    if isinstance(inventory.get("_via"), str) and inventory["_via"].startswith("claude"):
        if not args.skip_refine:
            print("[pipeline] Inventory came from Claude fallback — auto-enabling --skip-refine")
            args.skip_refine = True
    items = load_or_extract_assets(args, run_dir, inventory)
    items = selected_items(items, args.asset_id, args.limit)
    print(f"[pipeline] Selected {len(items)} assets")

    results = process_assets(args, run_dir, items)
    summary = {
        "run_dir": str(run_dir),
        "selected_assets": len(items),
        "completed_assets": len([result for result in results if result_is_complete(result)]),
        "failed_assets": len([result for result in results if result.get("error")]),
        "manifest": str(run_dir / "manifests" / "05_scenario_automation_manifest.json"),
    }
    if args.dry_run_scenario:
        summary["dry_run_manifest"] = str(run_dir / "manifests" / "05_scenario_automation_dry_run.json")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
