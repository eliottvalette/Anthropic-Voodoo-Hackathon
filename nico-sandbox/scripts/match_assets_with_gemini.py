"""
Match imported asset filenames against the Gemini video manifest using Gemini Flash.

Usage:
  python match_assets_with_gemini.py --run <run_dir> --imports-dir <dir> [--out <path>]

The matcher reads the user-imported file paths (NOT their pixels) and the required asset
list (asset_id, name, category, visual_description) from the run manifest, then asks Gemini
Flash to decide which imported filename best satisfies each required asset. Filenames are
much cheaper than image uploads and good enough for typical naming patterns
(e.g. "enemy_red.png" vs "enemy_blue.png"). Output is written to
<run_dir>/manifests/04_asset_coverage.json by default.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from google.genai import types

import asset_pipeline


COVERAGE_PROMPT = """
You are matching the GAME ASSETS that a Gemini video analyzer detected against the FILENAMES
of asset files the user has already imported. You DO NOT see the images — only the file paths.
Use lexical clues from the filename: words, abbreviations, color names, role tokens, numbers.

For every required asset below, decide whether ONE of the imported filenames clearly identifies
that specific asset (same identity, not just same category). Treat the filename like a label
the artist gave the file: "red_castle.png" plausibly matches a "red_castle_exterior" asset,
"enemy_3.png" probably does not.

Rules:
- Be strict: prefer null over a weak guess. Confidence below 0.55 should usually be null.
- A required asset can be matched by at most one file. If two filenames could match, pick the
  more specific one and leave the other unmatched.
- Imported files that don't clearly map to any required asset are simply unused — that's fine.
- Filenames may contain folders (e.g. "characters/red_cyclops.png"); the folder is a hint too.

Return JSON only.
""".strip()


COVERAGE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "matches": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "asset_id": {"type": "string"},
                    "matched_file": {
                        "type": ["string", "null"],
                        "description": "Relative path of the matching imported file, or null.",
                    },
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "reasoning": {"type": "string"},
                },
                "required": ["asset_id", "matched_file", "confidence", "reasoning"],
            },
        },
    },
    "required": ["matches"],
}


IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def list_imports(imports_dir: Path) -> list[Path]:
    if not imports_dir.exists():
        return []
    files: list[Path] = []
    for path in sorted(imports_dir.rglob("*")):
        if path.is_file() and path.suffix.lower() in IMAGE_EXTS:
            files.append(path)
    return files


def required_assets_from_run(run_dir: Path) -> list[dict[str, Any]]:
    manifest_path = run_dir / "manifests" / "01_gemini_video_manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Missing video manifest: {manifest_path}")
    payload = asset_pipeline.read_json(manifest_path)
    return [
        {
            "asset_id": str(asset.get("asset_id", "")),
            "name": str(asset.get("name", "")),
            "category": str(asset.get("category", "")),
            "visual_description": str(asset.get("visual_description", "")),
        }
        for asset in payload.get("assets", [])
        if asset.get("asset_id")
    ]


def build_request_text(
    required: list[dict[str, Any]],
    imports: list[Path],
    imports_dir: Path,
) -> str:
    lines = ["REQUIRED ASSETS:"]
    for asset in required:
        lines.append(
            f"- asset_id: {asset['asset_id']} | name: {asset['name']} | "
            f"category: {asset['category']} | description: {asset['visual_description']}"
        )
    lines.append("\nIMPORTED FILE PATHS (filenames only — no image data is provided):")
    for path in imports:
        rel = path.relative_to(imports_dir).as_posix()
        lines.append(f"- {rel}")
    lines.append("")
    lines.append(COVERAGE_PROMPT)
    return "\n".join(lines)


def call_gemini(required: list[dict[str, Any]], imports: list[Path], imports_dir: Path) -> dict[str, Any]:
    asset_pipeline.load_dotenv(asset_pipeline.ROOT / ".env")
    client = asset_pipeline.gemini_client()
    config = types.GenerateContentConfig(
        responseMimeType="application/json",
        responseJsonSchema=COVERAGE_SCHEMA,
        temperature=0.0,
        maxOutputTokens=8000,
    )
    flash_models = ["gemini-2.5-flash", "gemini-3-flash-preview"]
    _model, response = asset_pipeline.call_model_with_fallback(
        client,
        flash_models,
        contents=[build_request_text(required, imports, imports_dir)],
        config=config,
    )
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, dict):
        return parsed
    return json.loads(asset_pipeline.extract_json_payload(response.text or "{}"))


def merge_coverage(required: list[dict[str, Any]], gemini: dict[str, Any]) -> dict[str, Any]:
    by_id = {item["asset_id"]: item for item in gemini.get("matches", [])}
    coverage = []
    provided = 0
    for asset in required:
        asset_id = asset["asset_id"]
        match = by_id.get(asset_id, {})
        matched_file = match.get("matched_file")
        is_matched = bool(matched_file)
        if is_matched:
            provided += 1
        coverage.append(
            {
                "asset_id": asset_id,
                "name": asset["name"],
                "category": asset["category"],
                "coverage": "provided" if is_matched else "missing",
                "matched_file": matched_file,
                "confidence": float(match.get("confidence", 0)),
                "reasoning": match.get("reasoning", ""),
            }
        )
    return {
        "summary": {
            "total": len(required),
            "provided": provided,
            "missing": len(required) - provided,
        },
        "matches": coverage,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Gemini-Flash coverage matcher for imported assets.")
    parser.add_argument("--run", type=Path, required=True, help="Path to a runs/<id> directory.")
    parser.add_argument("--imports-dir", type=Path, required=True, help="Directory containing imported asset images.")
    parser.add_argument("--out", type=Path, default=None, help="Override output path.")
    args = parser.parse_args()

    run_dir = args.run.resolve()
    imports_dir = args.imports_dir.resolve()
    out_path = args.out.resolve() if args.out else run_dir / "manifests" / "04_asset_coverage.json"

    required = required_assets_from_run(run_dir)
    imports = list_imports(imports_dir)
    if not required:
        print(f"[coverage] No required assets in manifest at {run_dir}")
    if not imports:
        empty = {
            "summary": {"total": len(required), "provided": 0, "missing": len(required)},
            "matches": [
                {
                    "asset_id": asset["asset_id"],
                    "name": asset["name"],
                    "category": asset["category"],
                    "coverage": "missing",
                    "matched_file": None,
                    "confidence": 0.0,
                    "reasoning": "No imported files supplied.",
                }
                for asset in required
            ],
        }
        asset_pipeline.write_json(out_path, empty)
        print(json.dumps(empty["summary"]))
        return

    gemini_response = call_gemini(required, imports, imports_dir)
    coverage = merge_coverage(required, gemini_response)
    asset_pipeline.write_json(out_path, coverage)
    print(json.dumps(coverage["summary"]))


if __name__ == "__main__":
    main()
