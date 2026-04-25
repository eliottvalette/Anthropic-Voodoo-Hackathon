"""
Sound pipeline for game audio recovery from video.

Phase 1 — Gemini audio analysis  → 06_sound_manifest.json
Phase 2a — BGM extraction via ffmpeg (music separates cleanly from the track)
Phase 2b — SFX / UI sound generation via Scenario API
            primary:  model_elevenlabs-sound-effects-v2
            fallback: model_beatoven-sound-effect
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import imageio_ffmpeg
import requests
from google import genai
from google.genai import types

import asset_pipeline
import scenario_automation


# ---------------------------------------------------------------------------
# Scenario audio model IDs
# ---------------------------------------------------------------------------

MODEL_SFX_PRIMARY = "model_elevenlabs-sound-effects-v2"
MODEL_SFX_FALLBACK = "model_beatoven-sound-effect"
MODEL_BGM_GENERATE = "model_beatoven-music-generation"

SFX_MODELS = [MODEL_SFX_PRIMARY, MODEL_SFX_FALLBACK]


# ---------------------------------------------------------------------------
# Gemini sound analysis prompt & schema
# ---------------------------------------------------------------------------

SOUND_MANIFEST_PROMPT = """
Analyze the AUDIO TRACK of this mobile game video as a sound designer and audio director.

Your goal: identify every distinct sound asset needed to recreate the game's audio experience.

Inventory three categories:
1. BGM (background music) — continuous music tracks, identify the cleanest loop-friendly region.
2. SFX (sound effects) — every distinct game event sound: explosions, impacts, projectiles firing, coins, etc.
3. UI sounds — button taps, menu transitions, win/fail jingles, countdown beeps, notifications.

For each sound event return:
- sound_id: unique snake_case slug (e.g. sfx_explosion_large, bgm_main, ui_button_tap)
- type: "bgm", "sfx", or "ui_sound"
- name: short human-readable name
- description: detailed audio description — instruments, tone, texture, attack/decay, pitch character
- game_event: what triggers this sound in gameplay (e.g. "projectile hits target", "player taps screen")
- start_s: first timestamp where this sound appears in the video
- end_s: last timestamp where this sound ends
- best_region_start_s: best extraction window start (cleanest region, least overlap with other sounds)
- best_region_end_s: best extraction window end
- duration_s: recommended asset duration in seconds
- generation_prompt: optimized text prompt for AI sound generation — be specific and descriptive
- extraction_strategy: "ffmpeg_extract" for BGM/music, "scenario_generate" for SFX and UI sounds
- loop_friendly: true if the sound should be a seamless loop

Extraction strategy rules:
- "ffmpeg_extract" for BGM only — music separates cleanly from compressed video audio
- "scenario_generate" for all SFX and UI sounds — overlapping game audio makes clean extraction impossible

Typical mobile game: 1-2 BGM tracks, 5-15 SFX, 3-8 UI sounds.
""".strip()


SOUND_MANIFEST_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "audio_summary": {"type": "string"},
        "sounds": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "sound_id": {"type": "string"},
                    "type": {
                        "type": "string",
                        "enum": ["bgm", "sfx", "ui_sound"],
                    },
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "game_event": {"type": "string"},
                    "start_s": {"type": "number"},
                    "end_s": {"type": "number"},
                    "best_region_start_s": {"type": "number"},
                    "best_region_end_s": {"type": "number"},
                    "duration_s": {"type": "number"},
                    "generation_prompt": {"type": "string"},
                    "extraction_strategy": {
                        "type": "string",
                        "enum": ["ffmpeg_extract", "scenario_generate"],
                    },
                    "loop_friendly": {"type": "boolean"},
                },
                "required": [
                    "sound_id",
                    "type",
                    "name",
                    "description",
                    "game_event",
                    "start_s",
                    "end_s",
                    "best_region_start_s",
                    "best_region_end_s",
                    "duration_s",
                    "generation_prompt",
                    "extraction_strategy",
                    "loop_friendly",
                ],
            },
        },
    },
    "required": ["audio_summary", "sounds"],
}


# ---------------------------------------------------------------------------
# Phase 1: Gemini audio analysis
# ---------------------------------------------------------------------------

def generate_sound_manifest(video_path: Path, run_dir: Path) -> dict[str, Any]:
    """Upload video to Gemini and return a structured sound inventory manifest."""
    asset_pipeline.load_dotenv(asset_pipeline.ROOT / ".env")
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY missing from .env")

    client = genai.Client(api_key=api_key)

    print(f"[sound] Uploading video to Gemini: {video_path.name}")
    uploaded = client.files.upload(
        file=str(video_path),
        config=types.UploadFileConfig(mimeType="video/mp4", displayName=video_path.name),
    )
    uploaded = asset_pipeline.wait_for_file(client, uploaded.name)
    print("[sound] Video active. Running audio analysis…")

    part = types.Part(
        fileData=types.FileData(fileUri=uploaded.uri, mimeType=uploaded.mime_type or "video/mp4"),
    )
    gen_config = types.GenerateContentConfig(
        responseMimeType="application/json",
        responseJsonSchema=SOUND_MANIFEST_SCHEMA,
        temperature=0.1,
        maxOutputTokens=8000,
    )
    _model, response = asset_pipeline.call_model_with_fallback(
        client,
        asset_pipeline.VIDEO_MODELS,
        contents=[part, SOUND_MANIFEST_PROMPT],
        config=gen_config,
    )

    payload = _parse_gemini_response(response)
    # Normalise sound_id slugs
    for sound in payload.get("sounds", []):
        sound["sound_id"] = asset_pipeline.safe_slug(str(sound.get("sound_id", "sound")))

    manifest_path = run_dir / "manifests" / "06_sound_manifest.json"
    asset_pipeline.write_json(manifest_path, payload)
    print(f"[sound] Sound manifest written → {manifest_path}")
    return payload


def _parse_gemini_response(response: Any) -> dict[str, Any]:
    if hasattr(response, "parsed") and response.parsed is not None:
        raw = response.parsed
        if isinstance(raw, dict):
            return raw
        if hasattr(raw, "__dict__"):
            return json.loads(json.dumps(raw, default=vars))
    text = getattr(response, "text", "") or ""
    text = text.strip()
    # Strip markdown fences if present
    text = re.sub(r"^```[a-z]*\n?", "", text)
    text = re.sub(r"\n?```$", "", text)
    return json.loads(text)


# ---------------------------------------------------------------------------
# Phase 2a: BGM extraction via ffmpeg
# ---------------------------------------------------------------------------

def extract_bgm_segment(
    video_path: Path,
    sound: dict[str, Any],
    output_path: Path,
) -> Path:
    """Extract an audio segment from the video using ffmpeg and save as mp3."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    start_s = float(sound.get("best_region_start_s", sound.get("start_s", 0)))
    end_s = float(sound.get("best_region_end_s", sound.get("end_s", start_s + 30)))
    duration_s = end_s - start_s
    if duration_s <= 0:
        duration_s = float(sound.get("duration_s", 30))

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg_exe,
        "-y",
        "-ss", str(start_s),
        "-i", str(video_path),
        "-t", str(duration_s),
        "-vn",
        "-acodec", "libmp3lame",
        "-q:a", "2",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg audio extraction failed: {result.stderr}")

    print(f"[sound] BGM extracted → {output_path.name} ({duration_s:.1f}s)")
    return output_path


# ---------------------------------------------------------------------------
# Phase 2b: SFX / UI sound generation via Scenario
# ---------------------------------------------------------------------------

def _elevenlabs_params(sound: dict[str, Any]) -> dict[str, Any]:
    duration = min(max(float(sound.get("duration_s", 3)), 0.5), 22)
    return {
        "text": str(sound["generation_prompt"]),
        "durationSeconds": duration,
        "promptInfluence": 0.4,
        "loop": bool(sound.get("loop_friendly", False)),
        "outputFormat": "mp3_44100_128",
    }


def _beatoven_sfx_params(sound: dict[str, Any]) -> dict[str, Any]:
    duration = min(max(float(sound.get("duration_s", 3)), 1), 35)
    return {
        "prompt": str(sound["generation_prompt"]),
        "duration": duration,
        "refinement": 40,
        "creativity": 16,
    }


def generate_sfx_via_scenario(
    client: scenario_automation.ScenarioClient,
    sound: dict[str, Any],
    output_path: Path,
) -> dict[str, Any]:
    """Generate a sound effect via Scenario and download to output_path."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    model_params = [
        (MODEL_SFX_PRIMARY, _elevenlabs_params(sound)),
        (MODEL_SFX_FALLBACK, _beatoven_sfx_params(sound)),
    ]

    last_error: Exception | None = None
    for model_id, params in model_params:
        try:
            print(f"[sound] Generating SFX via {model_id}: {sound['sound_id']}")
            job = client.run_model(model_id, params)
            asset_ids = scenario_automation.asset_ids_from_job(job)
            if not asset_ids:
                raise RuntimeError(f"{model_id} returned no asset ids")

            # Download first asset
            audio_asset_id = asset_ids[0]
            _download_audio_asset(client, audio_asset_id, output_path)

            print(f"[sound] SFX downloaded → {output_path.name}")
            return {
                "scenario_asset_id": audio_asset_id,
                "model_id": model_id,
                "job_id": job.get("jobId") or job.get("id"),
                "final_path": str(output_path),
            }

        except Exception as exc:
            print(f"[sound] {model_id} failed for {sound['sound_id']}: {exc}")
            last_error = exc

    raise RuntimeError(
        f"All SFX models failed for {sound['sound_id']}: {last_error}"
    )


def _download_audio_asset(
    client: scenario_automation.ScenarioClient,
    asset_id: str,
    output_path: Path,
) -> None:
    """Resolve Scenario asset URL and download the audio file."""
    asset_url = client.asset_url(asset_id)
    response = requests.get(asset_url, timeout=300)
    if response.status_code >= 400:
        raise RuntimeError(
            f"Failed to download audio asset {asset_id}: "
            f"{response.status_code} {response.text}"
        )
    output_path.write_bytes(response.content)


# ---------------------------------------------------------------------------
# Top-level: process a single sound event
# ---------------------------------------------------------------------------

def process_sound_event(
    client: scenario_automation.ScenarioClient | None,
    video_path: Path,
    sound: dict[str, Any],
    run_dir: Path,
) -> dict[str, Any]:
    """Process one sound event: extract or generate, then return a result dict."""
    sound_id = str(sound.get("sound_id", "sound"))
    sound_type = str(sound.get("type", "sfx"))
    strategy = str(sound.get("extraction_strategy", "scenario_generate"))

    base_result: dict[str, Any] = {
        "sound_id": sound_id,
        "type": sound_type,
        "name": sound.get("name"),
        "game_event": sound.get("game_event"),
        "strategy": strategy,
    }

    if strategy == "ffmpeg_extract":
        folder = run_dir / "final-assets" / "sounds" / "bgm"
        output_path = folder / f"{sound_id}.mp3"
        extract_bgm_segment(video_path, sound, output_path)
        return {**base_result, "final_path": str(output_path)}

    # scenario_generate
    if client is None:
        raise RuntimeError("ScenarioClient required for scenario_generate but not provided")

    sound_subdir = "sfx" if sound_type == "sfx" else "ui"
    folder = run_dir / "final-assets" / "sounds" / sound_subdir
    output_path = folder / f"{sound_id}.mp3"
    scenario_result = generate_sfx_via_scenario(client, sound, output_path)
    return {**base_result, **scenario_result}
