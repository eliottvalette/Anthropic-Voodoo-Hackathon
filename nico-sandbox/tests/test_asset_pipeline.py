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


class StrategyTests(unittest.TestCase):
    def test_projectiles_default_to_reference_recreate_then_alpha(self):
        self.assertEqual(asset_pipeline.default_recreation_strategy("projectile"), "reference_recreate_then_alpha")
        self.assertIn("model_google-gemini-3-1-flash", asset_pipeline.default_scenario_pipeline("projectile"))
        self.assertIn("model_photoroom-background-removal", asset_pipeline.default_scenario_pipeline("projectile"))

    def test_backgrounds_skip_alpha_pipeline(self):
        self.assertEqual(asset_pipeline.default_recreation_strategy("background"), "background_plate_cleanup")
        self.assertNotIn("model_photoroom-background-removal", asset_pipeline.default_scenario_pipeline("background"))

    def test_scenario_prompt_for_sprite_excludes_background_noise(self):
        candidate = asset_pipeline.Candidate.from_dict(
            {
                "asset_id": "proj_missile",
                "name": "Missile",
                "category": "projectile",
                "visual_description": "red nose rocket with white fins",
                "gameplay_role": "fired projectile",
                "best_timestamp_s": 9.25,
                "fallback_timestamps_s": [],
                "approx_box_2d": [100, 100, 200, 200],
                "isolate_with_background_removal": True,
                "priority": 1,
            }
        )
        prompt = asset_pipeline.scenario_prompt_for_candidate(candidate)
        self.assertIn("recreate ONLY this asset", prompt)
        self.assertIn("no background", prompt)


if __name__ == "__main__":
    unittest.main()
