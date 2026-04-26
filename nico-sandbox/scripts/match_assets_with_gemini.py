"""
Match imported asset filenames + the in-tree utils library against the Gemini video manifest.

Usage:
  python match_assets_with_gemini.py --run <run_dir> --imports-dir <dir> \\
      [--catalog <utils/catalog.json>] [--out <path>]

The matcher considers TWO sources of supply for each required asset:
  1. USER IMPORTS — files the user dragged into the UI. We see filenames only.
  2. BUILT-IN LIBRARY — utilities already in the repo (utils/catalog.json) covering
     particles/VFX, HUD widgets, end screens, generic mechanics. These don't need
     generation — they get matched to the asset and flagged provided.

Hard rules applied AFTER Gemini:
  - Any asset whose name/description mentions "tutorial hand", "hand cursor",
    "pointing hand", "cursor", "tap indicator" is auto-marked provided (the
    prettifier ships a tutorial_hand_animation that handles this universally).

Output: <run_dir>/manifests/04_asset_coverage.json
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from google.genai import types

import asset_pipeline


COVERAGE_PROMPT = """
You are deciding whether each REQUIRED ASSET from a video analysis is already SATISFIED by
one of two sources:
  (a) USER IMPORTS — files the user uploaded; you see filenames only.
  (b) BUILT-IN LIBRARY — generic engine utilities the repo ships (particles, smoke, trail,
      shake, debris, end screens, HP bars, etc.). These are CODE, not images, so they
      cover entire effect families regardless of color or context.

DECISION RULES — bias toward MATCHING when there is reasonable evidence:
- A wrong "missing" verdict regenerates an asset the user already supplied (wasted credits
  and wasted time). A wrong "matched" verdict skips an asset, which is fixable by clicking
  Regenerate. Therefore prefer to match when a filename token clearly maps to the asset.
- A high token overlap on filename (e.g. asset "red_rocket_projectile" + import
  "rocket.png" or "red_rocket.png" or "Projectile_1.png" near a folder hint) IS a match.
- A required asset can be satisfied by AT MOST ONE source. If two imports could fit, pick
  the more specific filename and leave the other unmatched.
- An imported file / library entry can only satisfy ONE required asset.
- Pre-matched assets in the prompt below were already locked in by lexical analysis — do
  NOT change those, just leave them in your output unchanged.

USER IMPORTS — filename matching:
  Treat the filename like an artist's label. Color tokens, role tokens, folder context,
  numbers, and synonyms all count.
    "Red Castle.png"        → matches "red_castle_exterior"        (confidence ~0.9)
    "Projectile_1.png"      → matches first projectile asset       (confidence ~0.7)
    "Background.png"        → matches "background_plate"           (confidence ~0.95)
    "ninja.png"             → matches "purple_ninja_character"     (confidence ~0.85)
    "Music.ogg"             → no visual asset match
    "enemy_3.png"           → ambiguous, only match if there's clearly one enemy

BUILT-IN LIBRARY — semantic / family matching:
  The library is GENERIC implementations. Match an asset to a library entry when the
  entry's tags / description clearly cover the asset's role:
    "fireball_smoke_trail"     → library `smoke` or `trail`     ✓
    "rocket_launch_puff"       → library `smoke` or `burst`     ✓
    "stone_explosion_vfx"      → library `debris` + `burst`     ✓ (pick the closer one)
    "screen_shake_on_hit"      → library `shake`                 ✓
    "coin_pickup_sparkle"      → library `sparkle` or `coin-pop` ✓
    "ui_health_bars"           → library `hp-segmented` / `hp-percentage` ✓
    "end_screen_overlay"       → library `game-won` / `game-lost` / `try-again` ✓

  Library entries DO NOT cover bespoke characters, props, backgrounds, UI illustrations, or
  projectile bodies. They only cover GENERIC effect/HUD utilities.

OUTPUT for every required asset (return one entry per asset_id, including pre-matched ones):
  - asset_id
  - matched_kind: "import" | "library" | null
  - matched_file: the import path OR the library file path; null when matched_kind is null
  - confidence: 0..1
  - reasoning: one short sentence

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
                    "matched_kind": {
                        "type": ["string", "null"],
                        "enum": ["import", "library", None],
                        "description": "Source that satisfies this asset, or null.",
                    },
                    "matched_file": {
                        "type": ["string", "null"],
                        "description": "Relative path of the satisfying file (import or library entry), or null.",
                    },
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "reasoning": {"type": "string"},
                },
                "required": ["asset_id", "matched_kind", "matched_file", "confidence", "reasoning"],
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


def load_library_catalog(catalog_path: Path | None) -> list[dict[str, Any]]:
    if catalog_path is None or not catalog_path.exists():
        return []
    try:
        payload = json.loads(catalog_path.read_text())
    except json.JSONDecodeError:
        return []
    flat: list[dict[str, Any]] = []
    for category in payload.get("categories", []):
        cat_id = category.get("id", "")
        for item in category.get("items", []):
            flat.append(
                {
                    "category": cat_id,
                    "name": item.get("name", ""),
                    "file": item.get("file", ""),
                    "description": item.get("description", ""),
                    "tags": item.get("tags", []),
                }
            )
    return flat


_TOKEN_RE = re.compile(r"[a-z0-9]+")
_GENERIC_TOKENS = {"asset", "assets", "image", "img", "png", "jpg", "jpeg", "webp", "ogg", "wav", "mp3", "the", "a"}


def _tokens(value: str) -> set[str]:
    return {t for t in _TOKEN_RE.findall(value.lower()) if t not in _GENERIC_TOKENS and len(t) > 1}


def lexical_prematch(
    required: list[dict[str, Any]],
    imports: list[Path],
    imports_dir: Path,
) -> dict[str, dict[str, Any]]:
    """Lock in obvious filename → asset matches before asking Gemini.

    Greedy: each import claims the first asset whose tokens it covers best, with a
    minimum overlap ratio of 0.5 on the asset side. An import can only be claimed once.
    """
    if not imports:
        return {}
    asset_tokens: list[tuple[dict[str, Any], set[str]]] = []
    for asset in required:
        toks = _tokens(asset.get("asset_id", "")) | _tokens(asset.get("name", ""))
        if toks:
            asset_tokens.append((asset, toks))

    pre_matches: dict[str, dict[str, Any]] = {}
    consumed_imports: set[str] = set()
    # Deterministic order: assets first by descending token count (most specific first)
    asset_tokens.sort(key=lambda pair: -len(pair[1]))

    for asset, atoks in asset_tokens:
        best_path: str | None = None
        best_score = 0.0
        for path in imports:
            rel = path.relative_to(imports_dir).as_posix()
            if rel in consumed_imports:
                continue
            ftoks = _tokens(path.stem) | _tokens(rel)
            if not ftoks:
                continue
            overlap = atoks & ftoks
            if not overlap:
                continue
            score = len(overlap) / max(1, len(atoks))
            if score > best_score:
                best_score = score
                best_path = rel
        if best_path and best_score >= 0.5:
            consumed_imports.add(best_path)
            pre_matches[asset["asset_id"]] = {
                "matched_kind": "import",
                "matched_file": best_path,
                "confidence": min(0.95, 0.6 + 0.35 * best_score),
                "reasoning": f"Lexical pre-match on filename tokens (overlap {best_score:.2f})",
            }
    return pre_matches


def build_request_text(
    required: list[dict[str, Any]],
    imports: list[Path],
    imports_dir: Path,
    library: list[dict[str, Any]],
    pre_matches: dict[str, dict[str, Any]],
) -> str:
    lines = ["REQUIRED ASSETS (the video analyzer says these are needed):"]
    for asset in required:
        lines.append(
            f"- asset_id: {asset['asset_id']} | name: {asset['name']} | "
            f"category: {asset['category']} | description: {asset['visual_description']}"
        )
    lines.append("\nUSER IMPORTS (filenames only — no image data is provided):")
    if imports:
        for path in imports:
            rel = path.relative_to(imports_dir).as_posix()
            lines.append(f"- {rel}")
    else:
        lines.append("- (none)")
    lines.append("\nBUILT-IN LIBRARY (utils/catalog.json — generic engine utilities the repo ships):")
    if library:
        for entry in library:
            tags = ", ".join(str(t) for t in entry.get("tags", []) or [])
            lines.append(
                f"- {entry['file']} [{entry['category']}/{entry['name']}] "
                f"tags=[{tags}] — {entry['description']}"
            )
    else:
        lines.append("- (none)")
    if pre_matches:
        lines.append("\nPRE-MATCHED (already locked in by lexical pre-pass — do NOT change, leave them in your output):")
        for asset_id, m in pre_matches.items():
            lines.append(
                f"- asset_id={asset_id} matched_kind={m['matched_kind']} "
                f"matched_file={m['matched_file']} confidence={m['confidence']:.2f}"
            )
    lines.append("")
    lines.append(COVERAGE_PROMPT)
    return "\n".join(lines)


def call_gemini(
    required: list[dict[str, Any]],
    imports: list[Path],
    imports_dir: Path,
    library: list[dict[str, Any]],
    pre_matches: dict[str, dict[str, Any]],
) -> dict[str, Any]:
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
        contents=[build_request_text(required, imports, imports_dir, library, pre_matches)],
        config=config,
    )
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, dict):
        return parsed
    return json.loads(asset_pipeline.extract_json_payload(response.text or "{}"))


# The prettifier ships a generic tutorial_hand_animation that covers any
# pointing/tapping/cursor hand asset. Detection is co-occurrence based: an
# asset qualifies if its blob mentions "hand" (or "finger" / "cursor") AND
# any of the tutorial-pointer keywords. We avoid plain "hand" alone because
# a character's hand is not the same thing.
_HAND_TOKEN = re.compile(r"\b(hand|finger|cursor|pointer)\b", re.IGNORECASE)
_HAND_INTENT_TOKEN = re.compile(
    r"\b(tutorial|pointing|pointer|cursor|tap|tapping|press|click|gesture|indicator)\b",
    re.IGNORECASE,
)


def is_universal_hand_asset(asset: dict[str, Any]) -> bool:
    blob = " ".join(
        [
            str(asset.get("asset_id", "")),
            str(asset.get("name", "")),
            str(asset.get("category", "")),
            str(asset.get("visual_description", "")),
        ]
    )
    if not _HAND_TOKEN.search(blob):
        return False
    return bool(_HAND_INTENT_TOKEN.search(blob))


def merge_coverage(
    required: list[dict[str, Any]],
    gemini: dict[str, Any],
    pre_matches: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    by_id = {item["asset_id"]: item for item in gemini.get("matches", [])}
    pre_matches = pre_matches or {}
    coverage: list[dict[str, Any]] = []
    provided = 0
    for asset in required:
        asset_id = asset["asset_id"]
        # Lexical pre-match wins — Gemini cannot un-match a filename token hit.
        if asset_id in pre_matches:
            pm = pre_matches[asset_id]
            matched_kind = pm["matched_kind"]
            matched_file = pm["matched_file"]
            confidence = float(pm["confidence"])
            reasoning = pm["reasoning"]
        else:
            match = by_id.get(asset_id, {}) or {}
            matched_kind = match.get("matched_kind")
            matched_file = match.get("matched_file")
            confidence = float(match.get("confidence", 0))
            reasoning = match.get("reasoning", "")

        # Hard rule: hand/cursor/tap-indicator assets are always covered by the
        # prettifier's tutorial_hand_animation. Override Gemini if needed.
        if is_universal_hand_asset(asset):
            matched_kind = "library"
            matched_file = "prettifier/tutorial_hand_animation.js"
            confidence = max(confidence, 0.95)
            reasoning = "Built-in tutorial hand animation handles all hand/cursor assets."

        is_matched = bool(matched_kind) and bool(matched_file)
        if is_matched:
            provided += 1
        coverage.append(
            {
                "asset_id": asset_id,
                "name": asset["name"],
                "category": asset["category"],
                "coverage": "provided" if is_matched else "missing",
                "matched_kind": matched_kind if is_matched else None,
                "matched_file": matched_file if is_matched else None,
                "confidence": confidence,
                "reasoning": reasoning,
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
    parser = argparse.ArgumentParser(description="Gemini-Flash coverage matcher for imported + built-in assets.")
    parser.add_argument("--run", type=Path, required=True, help="Path to a runs/<id> directory.")
    parser.add_argument("--imports-dir", type=Path, required=True, help="Directory containing imported asset images.")
    parser.add_argument(
        "--catalog",
        type=Path,
        default=asset_pipeline.ROOT / "utils" / "catalog.json",
        help="Path to the built-in utility catalog (default: <repo>/utils/catalog.json).",
    )
    parser.add_argument("--out", type=Path, default=None, help="Override output path.")
    args = parser.parse_args()

    run_dir = args.run.resolve()
    imports_dir = args.imports_dir.resolve()
    out_path = args.out.resolve() if args.out else run_dir / "manifests" / "04_asset_coverage.json"

    required = required_assets_from_run(run_dir)
    imports = list_imports(imports_dir)
    library = load_library_catalog(args.catalog)
    if not required:
        print(f"[coverage] No required assets in manifest at {run_dir}")
    # If neither imports nor library entries exist, every required asset is missing
    # except the universal hand-cursor override.
    if not imports and not library:
        empty_matches = []
        provided = 0
        for asset in required:
            if is_universal_hand_asset(asset):
                provided += 1
                empty_matches.append(
                    {
                        "asset_id": asset["asset_id"],
                        "name": asset["name"],
                        "category": asset["category"],
                        "coverage": "provided",
                        "matched_kind": "library",
                        "matched_file": "prettifier/tutorial_hand_animation.js",
                        "confidence": 0.95,
                        "reasoning": "Built-in tutorial hand animation handles all hand/cursor assets.",
                    }
                )
            else:
                empty_matches.append(
                    {
                        "asset_id": asset["asset_id"],
                        "name": asset["name"],
                        "category": asset["category"],
                        "coverage": "missing",
                        "matched_kind": None,
                        "matched_file": None,
                        "confidence": 0.0,
                        "reasoning": "No imported files or library entries supplied.",
                    }
                )
        result = {
            "summary": {"total": len(required), "provided": provided, "missing": len(required) - provided},
            "matches": empty_matches,
        }
        asset_pipeline.write_json(out_path, result)
        print(json.dumps(result["summary"]))
        return

    pre_matches = lexical_prematch(required, imports, imports_dir)
    if pre_matches:
        print(f"[coverage] Lexical pre-matched {len(pre_matches)} import(s) before asking Gemini")
    gemini_response = call_gemini(required, imports, imports_dir, library, pre_matches)
    coverage = merge_coverage(required, gemini_response, pre_matches)
    asset_pipeline.write_json(out_path, coverage)
    print(json.dumps(coverage["summary"]))


if __name__ == "__main__":
    main()
