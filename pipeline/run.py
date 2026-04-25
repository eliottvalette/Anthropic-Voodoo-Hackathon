from __future__ import annotations

import argparse
import mimetypes
import os
import sys
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any

from .assets import inventory_assets, video_metadata
from .brief import render_brief
from .env import load_env_file
from .gemini import GeminiClient, GeminiError, UploadedFile
from .json_utils import first_candidate_text, parse_json_text, write_json
from .prompts import VIDEO_BREAKDOWN_PROMPT, feature_spec_prompt

DEFAULT_MODEL = "models/gemini-3.1-pro-preview"
DEFAULT_FALLBACK_MODEL = "models/gemini-2.5-pro"


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    load_env_file(args.env)
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY is missing. Add it to .env or the environment.", file=sys.stderr)
        return 2

    video_path = args.video.resolve()
    asset_dir = args.assets.resolve()
    out_dir = resolve_out_dir(args.out, video_path)
    out_dir.mkdir(parents=True, exist_ok=True)

    client = GeminiClient(api_key=api_key, timeout_seconds=args.request_timeout)
    manifest: dict[str, Any] = {
        "created_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "video": str(video_path),
        "assets": str(asset_dir),
        "model": args.model,
        "fallback_model": args.fallback_model,
    }

    try:
        run_pipeline(client, args, video_path, asset_dir, out_dir, manifest)
    except (GeminiError, OSError, ValueError, KeyError, TypeError) as exc:
        manifest["status"] = "failed"
        manifest["error"] = str(exc)
        write_json(out_dir / "run_manifest.json", manifest)
        print(f"Pipeline failed: {exc}", file=sys.stderr)
        return 1

    manifest["status"] = "completed"
    write_json(out_dir / "run_manifest.json", manifest)
    print(f"Pipeline completed: {out_dir}")
    return 0


def run_pipeline(
    client: GeminiClient,
    args: argparse.Namespace,
    video_path: Path,
    asset_dir: Path,
    out_dir: Path,
    manifest: dict[str, Any],
) -> None:
    video_meta = video_metadata(video_path)
    write_json(out_dir / "video_metadata.json", video_meta)

    asset_inventory = inventory_assets(asset_dir)
    write_json(out_dir / "asset_inventory.json", asset_inventory)

    uploaded = upload_or_reuse_file(client, args, video_path)
    manifest["uploaded_file"] = asdict(uploaded)

    video_response = generate_with_fallback(
        client=client,
        model=args.model,
        fallback_model=args.fallback_model,
        prompt=VIDEO_BREAKDOWN_PROMPT,
        file=uploaded,
    )
    write_json(out_dir / "raw_gemini_video_analysis.json", video_response)
    video_breakdown = normalize_model_object(parse_json_text(first_candidate_text(video_response)), "video_breakdown")
    write_json(out_dir / "video_breakdown.json", video_breakdown)

    spec_response = generate_with_fallback(
        client=client,
        model=args.model,
        fallback_model=args.fallback_model,
        prompt=feature_spec_prompt(video_breakdown, asset_inventory),
        file=None,
    )
    write_json(out_dir / "raw_gemini_feature_spec.json", spec_response)
    feature_spec = normalize_model_object(parse_json_text(first_candidate_text(spec_response)), "playable_feature_spec")
    write_json(out_dir / "playable_feature_spec.json", feature_spec)

    (out_dir / "brief.md").write_text(render_brief(video_breakdown, feature_spec), encoding="utf-8")


def upload_or_reuse_file(client: GeminiClient, args: argparse.Namespace, video_path: Path) -> UploadedFile:
    mime_type = mimetypes.guess_type(video_path.name)[0] or "video/mp4"
    if args.file_uri and args.file_name:
        return UploadedFile(name=args.file_name, uri=args.file_uri, mime_type=mime_type, state="ACTIVE")
    display_name = f"{video_path.stem}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    return client.upload_file(
        path=video_path,
        mime_type=mime_type,
        display_name=display_name,
        poll_interval_seconds=args.poll_interval,
        poll_timeout_seconds=args.poll_timeout,
    )


def generate_with_fallback(
    client: GeminiClient,
    model: str,
    fallback_model: str,
    prompt: str,
    file: UploadedFile | None,
) -> dict[str, Any]:
    try:
        return client.generate_json(model=model, prompt=prompt, file=file)
    except GeminiError:
        if not fallback_model or fallback_model == model:
            raise
        return client.generate_json(model=fallback_model, prompt=prompt, file=file)


def normalize_model_object(payload: Any, label: str) -> dict[str, Any]:
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, list) and payload and all(isinstance(item, dict) for item in payload):
        primary = dict(payload[0])
        if len(payload) > 1:
            primary["alternatives_from_model"] = payload[1:]
        primary["_normalization_note"] = f"Gemini returned a top-level array for {label}; normalized to object."
        return primary
    raise ValueError(f"Expected {label} to be a JSON object, got {type(payload).__name__}")


def resolve_out_dir(out: Path | None, video_path: Path) -> Path:
    if out is not None:
        return out.resolve()
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return Path("runs") / f"{video_path.stem}_{stamp}"


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze gameplay video into a playable ad feature spec.")
    parser.add_argument("--video", type=Path, required=True, help="Input gameplay video path.")
    parser.add_argument("--assets", type=Path, required=True, help="Directory containing available game assets.")
    parser.add_argument("--out", type=Path, default=None, help="Output run directory.")
    parser.add_argument("--env", type=Path, default=Path(".env"), help="Env file containing GEMINI_API_KEY.")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Primary Gemini model.")
    parser.add_argument("--fallback-model", default=DEFAULT_FALLBACK_MODEL, help="Fallback Gemini model.")
    parser.add_argument("--poll-interval", type=float, default=2.0, help="Seconds between Gemini file state polls.")
    parser.add_argument("--poll-timeout", type=int, default=600, help="Max seconds to wait for Gemini file ACTIVE.")
    parser.add_argument("--request-timeout", type=int, default=240, help="HTTP request timeout in seconds.")
    parser.add_argument("--file-uri", default=None, help="Reuse an existing Gemini file URI.")
    parser.add_argument("--file-name", default=None, help="Reuse an existing Gemini file name, e.g. files/abc.")
    return parser.parse_args(argv)


if __name__ == "__main__":
    raise SystemExit(main())
