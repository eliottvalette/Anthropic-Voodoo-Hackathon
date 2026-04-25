#!/usr/bin/env python3
"""
Deterministic sprite background remover.

Usage:
  python clean_sprites.py input.png output.png
  python clean_sprites.py input.png output.png --threshold 50 --padding 6
  python clean_sprites.py assets/ cleaned/ --batch

Algorithm:
  1. Sample background color from image corners (median of 5x5 corner patches)
  2. BFS flood-fill from all border pixels to mark connected background
  3. Morphological opening (erode + dilate) to remove stray artifact pixels
  4. Crop to bounding box of non-transparent pixels + padding
"""

import sys
import argparse
from pathlib import Path
from collections import deque

try:
    import numpy as np
    from PIL import Image
except ImportError:
    print("Missing dependencies. Run: pip install pillow numpy")
    sys.exit(1)


def sample_background_color(arr: np.ndarray, patch: int = 5) -> np.ndarray:
    """Median color of the four corner patches (RGB only)."""
    h, w = arr.shape[:2]
    p = min(patch, h // 4, w // 4)
    corners = [
        arr[:p, :p, :3],
        arr[:p, w - p:, :3],
        arr[h - p:, :p, :3],
        arr[h - p:, w - p:, :3],
    ]
    samples = np.vstack([c.reshape(-1, 3) for c in corners])
    return np.median(samples, axis=0).astype(np.float32)


def flood_fill_background(arr: np.ndarray, bg_rgb: np.ndarray, threshold: float) -> np.ndarray:
    """
    BFS from all 4 border edges. Marks pixels whose RGB distance to bg_rgb
    is <= threshold AND are connected to the border as background.
    Returns bool mask (True = background).
    """
    h, w = arr.shape[:2]
    rgb = arr[:, :, :3].astype(np.float32)
    dist = np.sqrt(np.sum((rgb - bg_rgb) ** 2, axis=2))

    visited = np.zeros((h, w), dtype=bool)
    bg_mask = np.zeros((h, w), dtype=bool)
    queue = deque()

    for x in range(w):
        queue.append((0, x))
        queue.append((h - 1, x))
    for y in range(h):
        queue.append((y, 0))
        queue.append((y, w - 1))

    while queue:
        y, x = queue.popleft()
        if visited[y, x]:
            continue
        visited[y, x] = True
        if dist[y, x] <= threshold:
            bg_mask[y, x] = True
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                    queue.append((ny, nx))

    return bg_mask


def morphological_open(mask: np.ndarray, k: int = 3) -> np.ndarray:
    """Erode then dilate (opening) using a kxk box kernel. Removes isolated specks."""
    pad = k // 2

    def erode(m):
        out = np.zeros_like(m)
        padded = np.pad(m, pad, constant_values=False)
        for dy in range(k):
            for dx in range(k):
                out &= padded[dy: dy + m.shape[0], dx: dx + m.shape[1]] if dy == 0 and dx == 0 else \
                       padded[dy: dy + m.shape[0], dx: dx + m.shape[1]]
        # Simpler: use stride approach
        h, w = m.shape
        out = np.ones((h, w), dtype=bool)
        for dy in range(k):
            for dx in range(k):
                out &= padded[dy: dy + h, dx: dx + w]
        return out

    def dilate(m):
        h, w = m.shape
        padded = np.pad(m, pad, constant_values=False)
        out = np.zeros((h, w), dtype=bool)
        for dy in range(k):
            for dx in range(k):
                out |= padded[dy: dy + h, dx: dx + w]
        return out

    return dilate(erode(mask))


def bounding_box(alpha: np.ndarray, padding: int):
    rows = np.any(alpha > 0, axis=1)
    cols = np.any(alpha > 0, axis=0)
    if not rows.any():
        return None
    rmin, rmax = int(np.where(rows)[0][0]), int(np.where(rows)[0][-1])
    cmin, cmax = int(np.where(cols)[0][0]), int(np.where(cols)[0][-1])
    h, w = alpha.shape
    return (
        max(0, rmin - padding),
        min(h - 1, rmax + padding),
        max(0, cmin - padding),
        min(w - 1, cmax + padding),
    )


def clean_sprite(input_path: Path, output_path: Path, threshold: float = 40.0, padding: int = 4) -> bool:
    img = Image.open(input_path).convert("RGBA")
    arr = np.array(img)

    bg_rgb = sample_background_color(arr)
    bg_mask = flood_fill_background(arr, bg_rgb, threshold)
    bg_mask = morphological_open(bg_mask, k=3)

    arr[bg_mask, 3] = 0

    box = bounding_box(arr[:, :, 3], padding)
    if box is None:
        print(f"  SKIP {input_path.name}: no foreground pixels found")
        return False

    rmin, rmax, cmin, cmax = box
    cropped = arr[rmin: rmax + 1, cmin: cmax + 1]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(cropped, "RGBA").save(output_path)
    h, w = cropped.shape[:2]
    print(f"  OK   {input_path.name} → {output_path.name}  ({w}×{h}px)")
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Deterministic PNG sprite background remover",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("input", help="Input PNG file or directory (with --batch)")
    parser.add_argument("output", help="Output PNG file or directory (with --batch)")
    parser.add_argument("--threshold", type=float, default=40.0,
                        help="RGB distance threshold for background detection (default: 40)")
    parser.add_argument("--padding", type=int, default=4,
                        help="Pixel padding around the cropped sprite (default: 4)")
    parser.add_argument("--batch", action="store_true",
                        help="Process all PNGs in input directory, write to output directory")
    args = parser.parse_args()

    inp = Path(args.input)
    out = Path(args.output)

    if args.batch:
        if not inp.is_dir():
            print(f"Error: {inp} is not a directory")
            sys.exit(1)
        pngs = sorted(inp.glob("*.png"))
        if not pngs:
            print(f"No PNG files found in {inp}")
            sys.exit(1)
        print(f"Processing {len(pngs)} PNG(s) → {out}/")
        ok = sum(clean_sprite(p, out / p.name, args.threshold, args.padding) for p in pngs)
        print(f"\nDone: {ok}/{len(pngs)} cleaned.")
    else:
        if not inp.is_file():
            print(f"Error: {inp} is not a file")
            sys.exit(1)
        print(f"Processing {inp.name}…")
        clean_sprite(inp, out, args.threshold, args.padding)


if __name__ == "__main__":
    main()
