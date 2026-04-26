#!/usr/bin/env python3
"""Generate 3 destruction stages + a destruction.gif from a transparent castle PNG.

Usage:
    python scripts/render_damage_pack.py <castle.png> <out_dir> [--seed N]

Output:
    <out_dir>/<castle>_01_impact.png
    <out_dir>/<castle>_02_break.png
    <out_dir>/<castle>_03_destroyed.png
    <out_dir>/<castle>_destruction.gif
"""
from __future__ import annotations

import argparse
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter


@dataclass(frozen=True)
class DamageConfig:
    impact_rel: tuple[float, float] = (0.57, 0.72)
    damage_strength: float = 1.0
    debris_count: int = 90
    smoke_count: int = 34
    particle_count: int = 160
    output_scale: int = 1


def render_damage_pack(
    input_path: str | Path,
    output_dir: str | Path,
    seed: int = 42,
    config: DamageConfig = DamageConfig(),
) -> dict[str, Path]:
    input_path = Path(input_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    castle = _load_sprite(input_path)
    rng = np.random.default_rng(seed)

    frames: list[Image.Image] = []
    stage_data = [
        ("01_impact", 0.36, True, 1.15),
        ("02_break", 0.72, True, 0.82),
        ("03_destroyed", 1.00, False, 0.00),
    ]

    paths: dict[str, Path] = {}

    for name, stage, add_explosion, explosion_alpha in stage_data:
        frame = _render_frame(
            castle=castle,
            rng=rng,
            config=config,
            stage=stage,
            add_explosion=add_explosion,
            explosion_alpha=explosion_alpha,
        )

        if config.output_scale != 1:
            size = (frame.width * config.output_scale, frame.height * config.output_scale)
            frame = frame.resize(size, Image.Resampling.NEAREST)

        path = output_dir / f"{input_path.stem}_{name}.png"
        frame.save(path)
        paths[name] = path
        frames.append(frame)

    gif_path = output_dir / f"{input_path.stem}_destruction.gif"
    frames[0].save(
        gif_path,
        save_all=True,
        append_images=frames[1:],
        duration=[70, 85, 650],
        loop=0,
        disposal=2,
    )
    paths["gif"] = gif_path
    return paths


def _load_sprite(path: Path) -> Image.Image:
    raw = Image.open(path)
    if "A" not in raw.getbands():
        raise ValueError("Input must be a transparent RGBA/LA PNG sprite.")
    image = raw.convert("RGBA")
    if image.getchannel("A").getbbox() is None:
        raise ValueError("Input alpha channel is empty.")
    return image


def _render_frame(castle, rng, config, stage, add_explosion, explosion_alpha):
    alpha = castle.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("Sprite alpha channel is empty.")

    impact = _rel_point(bbox, config.impact_rel[0], config.impact_rel[1])

    damage_mask, missing_mask = _create_damage_masks(
        size=castle.size, bbox=bbox, rng=rng, stage=stage, strength=config.damage_strength,
    )
    sprite_mask = _binary_alpha(alpha)
    damage_mask = _multiply_masks(damage_mask, sprite_mask)
    missing_mask = _multiply_masks(missing_mask, sprite_mask)
    visible_damage = _subtract_masks(damage_mask, missing_mask)

    body = castle.copy()
    new_alpha = _subtract_masks(alpha, missing_mask)
    body.putalpha(new_alpha)

    charred = _create_charred_interior(size=castle.size, bbox=bbox, mask=visible_damage, rng=rng)
    result = Image.alpha_composite(body, charred)

    edge_layer = _create_broken_edges(
        size=castle.size, damage_mask=damage_mask, missing_mask=missing_mask, rng=rng,
    )
    result = Image.alpha_composite(result, edge_layer)

    cracks = _create_cracks(
        size=castle.size, bbox=bbox, damage_mask=damage_mask, sprite_mask=sprite_mask,
        rng=rng, count=int(22 * stage),
    )
    result = Image.alpha_composite(result, cracks)

    debris = _create_debris(
        castle=castle, bbox=bbox, damage_mask=damage_mask, impact=impact,
        rng=rng, count=int(config.debris_count * stage), stage=stage,
    )
    result = Image.alpha_composite(result, debris)

    smoke = _create_smoke(
        size=castle.size, impact=impact, rng=rng,
        count=int(config.smoke_count * stage), stage=stage, after=not add_explosion,
    )
    result = Image.alpha_composite(result, smoke)

    if add_explosion:
        radius = int(max(bbox[2] - bbox[0], bbox[3] - bbox[1]) * (0.23 + 0.12 * stage))
        explosion = _create_explosion(
            size=castle.size, impact=impact, radius=radius, rng=rng, alpha_mul=explosion_alpha,
        )
        result = Image.alpha_composite(result, explosion)

    return result


def _create_damage_masks(size, bbox, rng, stage, strength):
    mask = Image.new("L", size, 0)
    missing = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw_missing = ImageDraw.Draw(missing)

    s = min(1.25, max(0.0, stage * strength))
    spread = 0.55 + 0.45 * s

    slash = [
        _rel_point(bbox, 0.66 - 0.03 * s, 0.02),
        _rel_point(bbox, 0.92 + 0.05 * s, 0.13),
        _rel_point(bbox, 0.82 + 0.03 * s, 0.92),
        _rel_point(bbox, 0.51 - 0.07 * s, 0.78),
        _rel_point(bbox, 0.57 - 0.03 * s, 0.38),
    ]
    draw.polygon(_jagged_polygon(slash, rng, 18 * spread, 5), fill=255)

    middle_bite = [
        _rel_point(bbox, 0.43 - 0.06 * s, 0.42),
        _rel_point(bbox, 0.63 + 0.02 * s, 0.43),
        _rel_point(bbox, 0.70 + 0.03 * s, 0.76),
        _rel_point(bbox, 0.47 - 0.04 * s, 0.70),
    ]
    draw.polygon(_jagged_polygon(middle_bite, rng, 14 * spread, 4), fill=220)

    lower_blast = [
        _rel_point(bbox, 0.45 - 0.06 * s, 0.62),
        _rel_point(bbox, 0.69 + 0.06 * s, 0.61),
        _rel_point(bbox, 0.62 + 0.03 * s, 0.88),
        _rel_point(bbox, 0.42 - 0.05 * s, 0.83),
    ]
    draw.polygon(_jagged_polygon(lower_blast, rng, 16 * spread, 4), fill=int(180 + 65 * s))

    if s > 0.45:
        top_gap = [
            _rel_point(bbox, 0.62 - 0.02 * s, 0.05),
            _rel_point(bbox, 0.79 + 0.06 * s, 0.16),
            _rel_point(bbox, 0.74 + 0.03 * s, 0.58),
            _rel_point(bbox, 0.59 - 0.04 * s, 0.53),
        ]
        draw_missing.polygon(
            _jagged_polygon(top_gap, rng, 16 * spread, 5),
            fill=int(255 * min(1.0, (s - 0.25) / 0.75)),
        )

    if s > 0.78:
        center_gap = [
            _rel_point(bbox, 0.53 - 0.02 * s, 0.50),
            _rel_point(bbox, 0.69 + 0.05 * s, 0.54),
            _rel_point(bbox, 0.64 + 0.03 * s, 0.78),
            _rel_point(bbox, 0.49 - 0.04 * s, 0.72),
        ]
        draw_missing.polygon(
            _jagged_polygon(center_gap, rng, 13 * spread, 4),
            fill=int(255 * min(1.0, (s - 0.58) / 0.42)),
        )

    mask = mask.filter(ImageFilter.MaxFilter(3))
    missing = missing.filter(ImageFilter.MaxFilter(3))
    return mask, missing


def _create_charred_interior(size, bbox, mask, rng):
    width, height = size
    mask_arr = np.asarray(mask, dtype=np.uint8)
    noise = rng.integers(0, 24, (height, width), dtype=np.uint8)

    arr = np.zeros((height, width, 4), dtype=np.uint8)
    arr[..., 0] = 14 + noise // 3
    arr[..., 1] = 13 + noise // 4
    arr[..., 2] = 15 + noise // 2
    arr[..., 3] = mask_arr

    layer = Image.fromarray(arr, "RGBA")

    brick = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(brick)

    x0, y0, x1, y1 = bbox
    brick_h = max(7, int((y1 - y0) * 0.018))
    brick_w = max(18, int((x1 - x0) * 0.08))

    for y in range(y0, y1 + brick_h, brick_h):
        draw.line([(x0, y), (x1, y)], fill=(56, 50, 52, 105), width=1)
        offset = 0 if ((y // brick_h) % 2 == 0) else brick_w // 2
        for x in range(x0 - brick_w, x1 + brick_w, brick_w):
            draw.line([(x + offset, y), (x + offset, y + brick_h)], fill=(42, 37, 39, 75), width=1)

    brick = _clip_rgba_alpha(brick, mask)
    layer = Image.alpha_composite(layer, brick)

    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    coords = np.argwhere(mask_arr > 0)
    if coords.size == 0:
        return layer

    for _ in range(18):
        y, x = coords[rng.integers(0, len(coords))]
        length = int(rng.integers(12, 42))
        angle = float(rng.uniform(-0.35, 0.35))
        x2 = int(x + math.cos(angle) * length)
        y2 = int(y + math.sin(angle) * length)
        color = (
            255,
            int(rng.integers(72, 124)),
            int(rng.integers(12, 34)),
            int(rng.integers(55, 115)),
        )
        draw.line([(int(x), int(y)), (x2, y2)], fill=color, width=int(rng.integers(1, 3)))

    glow = glow.filter(ImageFilter.GaussianBlur(0.7))
    glow = _clip_rgba_alpha(glow, mask)
    return Image.alpha_composite(layer, glow)


def _create_broken_edges(size, damage_mask, missing_mask, rng):
    combined = ImageChops.lighter(damage_mask, missing_mask)
    edge = combined.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.MaxFilter(3))
    edge_arr = np.asarray(edge, dtype=np.uint8)
    alpha = np.where(edge_arr > 20, 210, 0).astype(np.uint8)

    arr = np.zeros((size[1], size[0], 4), dtype=np.uint8)
    arr[..., 0] = 31
    arr[..., 1] = 28
    arr[..., 2] = 29
    arr[..., 3] = alpha

    layer = Image.fromarray(arr, "RGBA")
    draw = ImageDraw.Draw(layer)
    coords = np.argwhere(alpha > 0)
    if coords.size == 0:
        return layer

    for _ in range(min(130, len(coords))):
        y, x = coords[rng.integers(0, len(coords))]
        r = int(rng.integers(2, 7))
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(12, 11, 12, int(rng.integers(70, 150))))
    return layer


def _create_cracks(size, bbox, damage_mask, sprite_mask, rng, count):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    boundary = damage_mask.filter(ImageFilter.FIND_EDGES)
    boundary_arr = np.asarray(boundary, dtype=np.uint8)
    sprite_arr = np.asarray(sprite_mask, dtype=np.uint8)
    coords = np.argwhere((boundary_arr > 20) & (sprite_arr > 0))
    if coords.size == 0:
        return layer

    cx = (bbox[0] + bbox[2]) * 0.5
    cy = (bbox[1] + bbox[3]) * 0.55

    for _ in range(count):
        y, x = coords[rng.integers(0, len(coords))]
        angle = math.atan2(y - cy, x - cx) + float(rng.uniform(-0.95, 0.95))
        length = float(rng.uniform(24, 82))
        branches = int(rng.integers(2, 5))
        points = [(int(x), int(y))]
        px = float(x); py = float(y)
        for _ in range(branches):
            angle += float(rng.uniform(-0.38, 0.38))
            step = length / branches * float(rng.uniform(0.7, 1.25))
            px += math.cos(angle) * step
            py += math.sin(angle) * step
            points.append((int(px), int(py)))
        draw.line(points, fill=(47, 43, 41, 210), width=2, joint="curve")
        draw.line(points, fill=(160, 150, 134, 75), width=1, joint="curve")
        if rng.random() < 0.55 and len(points) > 2:
            bp = points[int(rng.integers(1, len(points)))]
            ba = angle + float(rng.uniform(-1.2, 1.2))
            bl = float(rng.uniform(8, 28))
            end = (int(bp[0] + math.cos(ba) * bl), int(bp[1] + math.sin(ba) * bl))
            draw.line([bp, end], fill=(43, 39, 38, 175), width=1)

    return _clip_rgba_alpha(layer, sprite_mask)


def _create_debris(castle, bbox, damage_mask, impact, rng, count, stage):
    layer = Image.new("RGBA", castle.size, (0, 0, 0, 0))
    alpha = np.asarray(castle.getchannel("A"), dtype=np.uint8)
    damage = np.asarray(damage_mask, dtype=np.uint8)
    valid = np.argwhere((alpha > 20) & (damage > 20))
    if valid.size == 0:
        raise ValueError("Damage mask does not intersect the sprite.")

    max_dim = max(bbox[2] - bbox[0], bbox[3] - bbox[1])

    for i in range(count):
        y, x = valid[rng.integers(0, len(valid))]
        radius = int(rng.integers(max(5, int(max_dim * 0.01)), max(10, int(max_dim * 0.045))))
        crop = castle.crop((x - radius, y - radius, x + radius, y + radius))
        fragment = _random_fragment(crop, rng)
        if rng.random() < 0.52:
            fragment = ImageEnhance.Brightness(fragment).enhance(float(rng.uniform(0.35, 0.78)))
        angle = float(rng.uniform(-115, 115))
        fragment = fragment.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)
        direction = float(rng.uniform(-2.45, 0.22))
        distance = float(rng.uniform(max_dim * 0.05, max_dim * (0.23 + 0.20 * stage)))
        if i % 5 == 0:
            direction = float(rng.uniform(-0.9, 0.35))
            distance *= 1.45
        dx = math.cos(direction) * distance
        dy = math.sin(direction) * distance
        pos = (int(impact[0] + dx - fragment.width * 0.5), int(impact[1] + dy - fragment.height * 0.5))
        layer.alpha_composite(fragment, pos)

    draw = ImageDraw.Draw(layer)
    for _ in range(int(count * 0.75)):
        direction = float(rng.uniform(-2.9, 0.45))
        distance = float(rng.uniform(max_dim * 0.05, max_dim * 0.5))
        x = int(impact[0] + math.cos(direction) * distance)
        y = int(impact[1] + math.sin(direction) * distance)
        r = int(rng.integers(1, 5))
        color = (
            int(rng.integers(8, 32)),
            int(rng.integers(8, 28)),
            int(rng.integers(9, 31)),
            int(rng.integers(110, 230)),
        )
        if rng.random() < 0.12:
            color = (180, int(rng.integers(24, 72)), int(rng.integers(18, 38)), int(rng.integers(90, 180)))
        pts = _shard_points(center=(x, y), radius=r, angle=float(rng.uniform(0, math.tau)), rng=rng)
        draw.polygon(pts, fill=color)

    return layer


def _create_smoke(size, impact, rng, count, stage, after):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    base = max(size) * (0.08 + 0.05 * stage)

    for _ in range(count):
        angle = float(rng.uniform(-2.7, 0.65))
        distance = float(rng.uniform(0, base * (1.4 if after else 0.95)))
        x = int(impact[0] + math.cos(angle) * distance)
        y = int(impact[1] + math.sin(angle) * distance)
        rx = int(rng.uniform(base * 0.12, base * 0.42))
        ry = int(rng.uniform(base * 0.09, base * 0.34))
        gray = int(rng.integers(42, 82))
        alpha = int(rng.integers(28, 82) * (0.85 if after else 1.0))
        draw.ellipse((x - rx, y - ry, x + rx, y + ry), fill=(gray, gray + 3, gray + 4, alpha))

    blur = 6 if after else 4
    return layer.filter(ImageFilter.GaussianBlur(blur))


def _create_explosion(size, impact, radius, rng, alpha_mul):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    layer = Image.alpha_composite(layer, _soft_ellipse(
        size=size, center=impact, rx=radius * 1.25, ry=radius * 0.90,
        color=(95, 52, 115, int(95 * alpha_mul)), blur=10,
    ))
    layer = Image.alpha_composite(layer, _soft_ellipse(
        size=size, center=impact, rx=radius * 0.72, ry=radius * 0.54,
        color=(242, 200, 255, int(165 * alpha_mul)), blur=8,
    ))
    layer = Image.alpha_composite(layer, _soft_ellipse(
        size=size, center=impact, rx=radius * 0.36, ry=radius * 0.26,
        color=(255, 245, 255, int(220 * alpha_mul)), blur=4,
    ))

    rays = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(rays)
    for _ in range(28):
        angle = float(rng.uniform(-math.pi, math.pi))
        length = float(rng.uniform(radius * 0.45, radius * 1.45))
        width = float(rng.uniform(radius * 0.035, radius * 0.09))
        base_angle = angle + math.pi / 2
        p1 = (int(impact[0] + math.cos(base_angle) * width), int(impact[1] + math.sin(base_angle) * width))
        p2 = (int(impact[0] - math.cos(base_angle) * width), int(impact[1] - math.sin(base_angle) * width))
        tip = (int(impact[0] + math.cos(angle) * length), int(impact[1] + math.sin(angle) * length))
        if rng.random() < 0.55:
            color = (244, 220, 255, int(rng.integers(80, 190) * alpha_mul))
        else:
            color = (124, 34, 152, int(rng.integers(70, 160) * alpha_mul))
        draw.polygon([p1, tip, p2], fill=color)
    layer = Image.alpha_composite(layer, rays.filter(ImageFilter.GaussianBlur(0.35)))

    draw = ImageDraw.Draw(layer)
    core = _irregular_blob(center=impact, radius=radius * 0.23, rng=rng, points=13)
    draw.polygon(core, fill=(26, 19, 24, int(245 * alpha_mul)))
    draw.line(core + [core[0]], fill=(185, 38, 45, int(190 * alpha_mul)), width=max(1, radius // 28))

    for _ in range(90):
        angle = float(rng.uniform(-math.pi, math.pi))
        distance = float(rng.uniform(radius * 0.16, radius * 1.42))
        x = int(impact[0] + math.cos(angle) * distance)
        y = int(impact[1] + math.sin(angle) * distance)
        r = int(rng.integers(1, max(3, radius // 26)))
        if rng.random() < 0.18:
            color = (218, int(rng.integers(20, 82)), int(rng.integers(22, 55)), int(rng.integers(120, 230) * alpha_mul))
        elif rng.random() < 0.28:
            color = (165, 68, 214, int(rng.integers(90, 210) * alpha_mul))
        else:
            color = (10, 10, 12, int(rng.integers(130, 250) * alpha_mul))
        draw.polygon(
            _shard_points(center=(x, y), radius=r, angle=float(rng.uniform(0, math.tau)), rng=rng),
            fill=color,
        )
    return layer


def _random_fragment(crop, rng):
    w, h = crop.size
    mask = Image.new("L", crop.size, 0)
    draw = ImageDraw.Draw(mask)
    sides = int(rng.integers(3, 6))
    center = (w * float(rng.uniform(0.35, 0.65)), h * float(rng.uniform(0.35, 0.65)))
    radius = min(w, h) * float(rng.uniform(0.33, 0.56))
    pts = []
    for i in range(sides):
        angle = (i / sides) * math.tau + float(rng.uniform(-0.55, 0.55))
        local_r = radius * float(rng.uniform(0.55, 1.1))
        pts.append((int(center[0] + math.cos(angle) * local_r), int(center[1] + math.sin(angle) * local_r)))
    draw.polygon(pts, fill=255)
    alpha = crop.getchannel("A")
    final_alpha = _multiply_masks(alpha, mask)
    fragment = crop.copy()
    fragment.putalpha(final_alpha)
    return fragment


def _soft_ellipse(size, center, rx, ry, color, blur):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    x, y = center
    draw.ellipse((int(x - rx), int(y - ry), int(x + rx), int(y + ry)), fill=color)
    return layer.filter(ImageFilter.GaussianBlur(blur))


def _irregular_blob(center, radius, rng, points):
    cx, cy = center
    result = []
    for i in range(points):
        angle = (i / points) * math.tau + float(rng.uniform(-0.17, 0.17))
        r = radius * float(rng.uniform(0.65, 1.25))
        result.append((int(cx + math.cos(angle) * r), int(cy + math.sin(angle) * r)))
    return result


def _shard_points(center, radius, angle, rng):
    cx, cy = center
    length = radius * float(rng.uniform(2.0, 5.4))
    width = radius * float(rng.uniform(0.6, 1.5))
    perp = angle + math.pi / 2
    return [
        (int(cx + math.cos(angle) * length), int(cy + math.sin(angle) * length)),
        (int(cx + math.cos(perp) * width), int(cy + math.sin(perp) * width)),
        (int(cx - math.cos(angle) * length * 0.35), int(cy - math.sin(angle) * length * 0.35)),
        (int(cx - math.cos(perp) * width), int(cy - math.sin(perp) * width)),
    ]


def _rel_point(bbox, rx, ry):
    x0, y0, x1, y1 = bbox
    return (int(x0 + (x1 - x0) * rx), int(y0 + (y1 - y0) * ry))


def _jagged_polygon(points, rng, jitter, subdivisions):
    pts = list(points)
    if len(pts) < 3:
        raise ValueError("A polygon needs at least three points.")
    result = []
    for index, start in enumerate(pts):
        end = pts[(index + 1) % len(pts)]
        sx, sy = start; ex, ey = end
        dx = ex - sx; dy = ey - sy
        length = math.hypot(dx, dy)
        if length == 0:
            continue
        nx = -dy / length; ny = dx / length
        for step in range(subdivisions):
            t = step / subdivisions
            j = float(rng.uniform(-jitter, jitter))
            result.append((int(sx + dx * t + nx * j), int(sy + dy * t + ny * j)))
    return result


def _binary_alpha(alpha):
    return alpha.point(lambda v: 255 if v > 12 else 0).convert("L")


def _multiply_masks(a, b):
    arr = (np.asarray(a, dtype=np.uint16) * np.asarray(b, dtype=np.uint16) // 255).astype(np.uint8)
    return Image.fromarray(arr, "L")


def _subtract_masks(a, b):
    arr = np.clip(np.asarray(a, dtype=np.int16) - np.asarray(b, dtype=np.int16), 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "L")


def _clip_rgba_alpha(image, mask):
    result = image.copy()
    alpha = result.getchannel("A")
    result.putalpha(_multiply_masks(alpha, mask))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="Path to a transparent castle PNG")
    parser.add_argument("output_dir", help="Output directory")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--impact-x", type=float, default=0.57)
    parser.add_argument("--impact-y", type=float, default=0.72)
    parser.add_argument("--strength", type=float, default=1.0)
    parser.add_argument("--debris", type=int, default=90)
    parser.add_argument("--smoke", type=int, default=34)
    args = parser.parse_args()

    cfg = DamageConfig(
        impact_rel=(args.impact_x, args.impact_y),
        damage_strength=args.strength,
        debris_count=args.debris,
        smoke_count=args.smoke,
    )
    paths = render_damage_pack(args.input, args.output_dir, seed=args.seed, config=cfg)
    for k, v in paths.items():
        print(f"{k}: {v}")
