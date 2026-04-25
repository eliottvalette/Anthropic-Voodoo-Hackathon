import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import asset_pipeline
from asset_pipeline import box_1000_to_pixels, extract_json_payload, padded_box


class GeometryTests(unittest.TestCase):
    def test_converts_gemini_yxyx_box_to_pixel_xyxy(self):
        self.assertEqual(
            box_1000_to_pixels([250, 100, 750, 600], width=1080, height=1920),
            (108, 480, 648, 1440),
        )

    def test_clamps_and_orders_invalid_box_values(self):
        self.assertEqual(
            box_1000_to_pixels([900, 1200, 100, -20], width=100, height=200),
            (0, 20, 100, 180),
        )

    def test_padded_box_expands_without_crossing_image_bounds(self):
        self.assertEqual(
            padded_box((10, 20, 60, 80), width=100, height=100, pad_ratio=0.2, min_size=1),
            (0, 8, 70, 92),
        )


class JsonParsingTests(unittest.TestCase):
    def test_extracts_fenced_json_payload(self):
        payload = extract_json_payload('```json\n{"assets": [{"name": "orc"}]}\n```')
        self.assertEqual(json.loads(payload)["assets"][0]["name"], "orc")


class PathTests(unittest.TestCase):
    def test_root_points_to_repository_root_after_script_reorg(self):
        self.assertTrue((asset_pipeline.ROOT / ".env").exists())
        self.assertTrue((asset_pipeline.ROOT / "nico-sandbox").exists())


if __name__ == "__main__":
    unittest.main()
