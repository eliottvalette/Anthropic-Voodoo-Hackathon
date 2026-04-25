from __future__ import annotations

import mimetypes
import shutil
import struct
import subprocess
from pathlib import Path
from typing import Any


def inventory_assets(asset_dir: Path) -> dict[str, Any]:
    files = [path for path in sorted(asset_dir.rglob("*")) if path.is_file()]
    return {
        "asset_root": str(asset_dir),
        "total_files": len(files),
        "total_size_bytes": sum(path.stat().st_size for path in files),
        "assets": [_asset_entry(asset_dir, path) for path in files],
    }


def video_metadata(video_path: Path) -> dict[str, Any]:
    metadata = _ffprobe(video_path)
    return {
        "path": str(video_path),
        "size_bytes": video_path.stat().st_size,
        "mime_type": mimetypes.guess_type(video_path.name)[0] or "video/mp4",
        "ffprobe": metadata,
    }


def _asset_entry(root: Path, path: Path) -> dict[str, Any]:
    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    entry: dict[str, Any] = {
        "path": str(path),
        "relative_path": str(path.relative_to(root)),
        "size_bytes": path.stat().st_size,
        "mime_type": mime_type,
    }
    dimensions = _dimensions(path)
    if dimensions is not None:
        entry["width"] = dimensions[0]
        entry["height"] = dimensions[1]
    media = _ffprobe(path)
    if media:
        entry["ffprobe"] = media
    return entry


def _dimensions(path: Path) -> tuple[int, int] | None:
    suffix = path.suffix.lower()
    try:
        if suffix == ".png":
            return _png_dimensions(path)
        if suffix in {".psd", ".psb"}:
            return _photoshop_dimensions(path)
    except (OSError, struct.error, ValueError):
        return None
    return None


def _png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        header = handle.read(24)
    if not header.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("not a png")
    width, height = struct.unpack(">II", header[16:24])
    return width, height


def _photoshop_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        header = handle.read(26)
    if not header.startswith(b"8BPS"):
        raise ValueError("not a photoshop document")
    height, width = struct.unpack(">II", header[14:22])
    return width, height


def _ffprobe(path: Path) -> dict[str, Any] | None:
    if shutil.which("ffprobe") is None:
        return None
    if path.suffix.lower() not in {".mp4", ".mov", ".m4v", ".ogg", ".wav", ".mp3", ".aac"}:
        return None
    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration,size,bit_rate",
        "-show_entries",
        "stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels,duration",
        "-of",
        "json",
        str(path),
    ]
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True)
    except (OSError, subprocess.CalledProcessError):
        return None
    import json

    return json.loads(result.stdout)

