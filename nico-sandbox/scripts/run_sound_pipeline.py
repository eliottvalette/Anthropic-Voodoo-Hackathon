"""
Entry point for the sound pipeline.

Usage:
  python run_sound_pipeline.py <video_path> [options]

Steps:
  1. Gemini audio analysis → 06_sound_manifest.json
  2. BGM segments extracted via ffmpeg → final-assets/sounds/bgm/
  3. SFX & UI sounds generated via Scenario → final-assets/sounds/sfx|ui/

Options:
  --out DIR             Output run directory (default: runs/<video_stem>)
  --skip-gemini         Reuse existing 06_sound_manifest.json
  --sound-id ID [...]   Process only these sound_ids
  --limit N             Cap number of sounds to process
  --dry-run             Print plan without generating anything
  --force               Re-process already-completed sounds
  --stop-on-error       Halt on first failure
"""
from __future__ import annotations

import argparse
import json
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import asset_pipeline
import scenario_automation
import sound_pipeline


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def default_run_dir(video_path: Path) -> Path:
    return asset_pipeline.ROOT / "nico-sandbox" / "runs" / asset_pipeline.safe_slug(video_path.stem)


def previous_results(manifest_path: Path) -> list[dict[str, Any]]:
    if not manifest_path.exists():
        return []
    return list(asset_pipeline.read_json(manifest_path).get("sounds", []))


def result_is_complete(result: dict[str, Any]) -> bool:
    if result.get("error"):
        return False
    final_path = result.get("final_path")
    return bool(final_path and Path(str(final_path)).exists())


def merge_result(results: list[dict[str, Any]], result: dict[str, Any]) -> list[dict[str, Any]]:
    sound_id = result.get("sound_id")
    kept = [r for r in results if r.get("sound_id") != sound_id]
    kept.append(result)
    return kept


def write_checkpoint(
    manifest_path: Path,
    *,
    video_path: Path,
    run_dir: Path,
    sounds_plan: list[dict[str, Any]],
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
            "planned_sounds": len(sounds_plan),
            "completed_sounds": len([r for r in results if result_is_complete(r)]),
            "failed_sounds": len([r for r in results if r.get("error")]),
            "sounds": results,
        },
    )


def selected_sounds(
    sounds: list[dict[str, Any]],
    sound_ids: list[str] | None,
    limit: int | None,
) -> list[dict[str, Any]]:
    if sound_ids:
        wanted = set(sound_ids)
        sounds = [s for s in sounds if s.get("sound_id") in wanted]
    if limit is not None:
        sounds = sounds[:limit]
    return sounds


def load_or_generate_manifest(args: argparse.Namespace, run_dir: Path) -> dict[str, Any]:
    manifest_path = run_dir / "manifests" / "06_sound_manifest.json"
    if args.skip_gemini:
        if not manifest_path.exists():
            raise FileNotFoundError(f"Missing sound manifest: {manifest_path}")
        print(f"[sound-pipeline] Reusing manifest: {manifest_path}")
        return asset_pipeline.read_json(manifest_path)
    print(f"[sound-pipeline] Running Gemini audio analysis for {args.video}")
    return sound_pipeline.generate_sound_manifest(args.video, run_dir)


def run(args: argparse.Namespace) -> None:
    run_dir = args.out or default_run_dir(args.video)
    run_dir.mkdir(parents=True, exist_ok=True)

    manifest = load_or_generate_manifest(args, run_dir)
    all_sounds = manifest.get("sounds", [])
    print(f"[sound-pipeline] {len(all_sounds)} sounds identified in manifest")

    sounds = selected_sounds(all_sounds, args.sound_id, args.limit)
    print(f"[sound-pipeline] Processing {len(sounds)} sound(s)")

    if args.dry_run:
        dry_run_path = run_dir / "manifests" / "06_sound_dry_run.json"
        asset_pipeline.write_json(
            dry_run_path,
            {
                "status": "dry_run",
                "updated_at": utc_now(),
                "source_video": str(args.video),
                "planned_sounds": len(sounds),
                "sounds": sounds,
            },
        )
        print(f"[sound-pipeline] Dry run written → {dry_run_path}")
        for s in sounds:
            strategy = s.get("extraction_strategy", "scenario_generate")
            print(f"  {s['sound_id']:40s}  [{s['type']:8s}]  {strategy}")
        return

    result_path = run_dir / "manifests" / "06_sound_results.json"
    results = [] if args.force else previous_results(result_path)
    completed_ids = {str(r.get("sound_id")) for r in results if result_is_complete(r)}

    needs_scenario = any(
        s.get("extraction_strategy") == "scenario_generate"
        and (args.force or str(s.get("sound_id")) not in completed_ids)
        for s in sounds
    )
    client = scenario_automation.ScenarioClient(scenario_automation.load_config()) if needs_scenario else None

    write_checkpoint(
        result_path,
        video_path=args.video,
        run_dir=run_dir,
        sounds_plan=sounds,
        results=results,
        status="running",
    )

    total = len(sounds)
    for index, sound in enumerate(sounds, start=1):
        sound_id = str(sound.get("sound_id"))
        if not args.force and sound_id in completed_ids:
            print(f"[sound-pipeline] {index}/{total} skipping completed {sound_id}")
            continue

        print(f"[sound-pipeline] {index}/{total} processing {sound_id} [{sound.get('type')}]")
        try:
            result = sound_pipeline.process_sound_event(client, args.video, sound, run_dir)
        except Exception as exc:
            result = {
                "sound_id": sound_id,
                "type": sound.get("type"),
                "name": sound.get("name"),
                "error": str(exc),
                "traceback": traceback.format_exc(),
            }
            results = merge_result(results, result)
            write_checkpoint(
                result_path,
                video_path=args.video,
                run_dir=run_dir,
                sounds_plan=sounds,
                results=results,
                status="failed" if args.stop_on_error else "running",
            )
            print(f"[sound-pipeline] ERROR {sound_id}: {exc}", file=sys.stderr)
            if args.stop_on_error:
                raise
            continue

        results = merge_result(results, result)
        completed_ids.add(sound_id)
        write_checkpoint(
            result_path,
            video_path=args.video,
            run_dir=run_dir,
            sounds_plan=sounds,
            results=results,
            status="running",
        )

    final_status = "complete" if not any(r.get("error") for r in results) else "partial"
    write_checkpoint(
        result_path,
        video_path=args.video,
        run_dir=run_dir,
        sounds_plan=sounds,
        results=results,
        status=final_status,
    )

    completed = [r for r in results if result_is_complete(r)]
    failed = [r for r in results if r.get("error")]
    print(f"\n[sound-pipeline] Done: {len(completed)} completed, {len(failed)} failed")
    print(f"[sound-pipeline] Results → {result_path}")

    for r in failed:
        print(f"  FAILED: {r.get('sound_id')} — {r.get('error')}", file=sys.stderr)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Game sound recovery pipeline")
    parser.add_argument("video", type=Path, help="Path to source gameplay video (.mp4)")
    parser.add_argument("--out", type=Path, default=None, metavar="DIR",
                        help="Output run directory (default: runs/<video_stem>)")
    parser.add_argument("--skip-gemini", action="store_true",
                        help="Reuse existing 06_sound_manifest.json")
    parser.add_argument("--sound-id", nargs="+", default=None, metavar="ID",
                        help="Process only these sound_ids")
    parser.add_argument("--limit", type=int, default=None, metavar="N",
                        help="Cap number of sounds to process")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print plan without generating anything")
    parser.add_argument("--force", action="store_true",
                        help="Re-process already-completed sounds")
    parser.add_argument("--stop-on-error", action="store_true",
                        help="Halt on first failure")
    return parser.parse_args()


if __name__ == "__main__":
    run(parse_args())
