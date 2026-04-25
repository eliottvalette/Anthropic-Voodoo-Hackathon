import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import asset_factories
import run_full_asset_pipeline
import scenario_automation


def sample_item(**overrides):
    item = {
        "asset_id": "asset_01",
        "name": "Asset 01",
        "category": "other",
        "visual_description": "small stylized asset",
        "gameplay_role": "test asset",
        "timestamp_s": 1.0,
        "fallback_timestamps_s": [],
        "gemini_box_2d": [100, 100, 300, 300],
        "isolate_with_background_removal": True,
        "priority": 1,
        "crop_path": "runs/test/extracted/crops/asset_01.png",
    }
    item.update(overrides)
    return item


class AssetFactoryRoutingTests(unittest.TestCase):
    def test_character_plan_targets_parts_and_rig_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            item = sample_item(
                asset_id="char_skeleton",
                name="Skeleton",
                category="character",
                recreation_strategy="layered_character_parts",
            )
            plan = asset_factories.plan_for_item(run_dir, item)

            self.assertEqual(plan.route, asset_factories.ROUTE_CHARACTER_RIG)
            self.assertEqual(plan.primary_output, run_dir / "final-assets" / "characters" / "char_skeleton" / "full.png")
            self.assertEqual(
                plan.outputs["parts_sheet"],
                str(run_dir / "final-assets" / "characters" / "char_skeleton" / "parts_sheet.png"),
            )
            self.assertEqual(plan.outputs["rig"], str(run_dir / "final-assets" / "characters" / "char_skeleton" / "rig.json"))
            self.assertEqual(plan.manifest_path, run_dir / "final-assets" / "characters" / "char_skeleton" / "asset_manifest.json")
            self.assertIn(asset_factories.MODEL_SAM_IMAGE, plan.scenario_models)
            self.assertIn(asset_factories.MODEL_QWEN_LAYERED, plan.scenario_models)
            self.assertIn("head", plan.outputs["expected_parts"])
            self.assertIn("weapon", plan.outputs["expected_parts"])
            self.assertEqual(plan.outputs["part_sheet_grid"]["columns"], 4)
            self.assertIn("parts sheet", plan.prompts["parts_sheet"])

    def test_vfx_plan_uses_gemini_codegen_without_scenario_models(self):
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            item = sample_item(
                asset_id="vfx_explosion",
                name="Explosion Burst",
                category="effect",
                visual_description="orange smoke and flash burst",
            )
            plan = asset_factories.plan_for_item(run_dir, item)

            self.assertEqual(plan.route, asset_factories.ROUTE_PROCEDURAL_VFX)
            self.assertEqual(plan.scenario_models, [])
            self.assertTrue(str(plan.primary_output).endswith("vfx_explosion.ts"))
            self.assertIn("procedural", plan.prompts["gemini_codegen"].lower())
            self.assertIn("Do not include external assets", plan.prompts["gemini_codegen"])

    def test_background_plan_stays_opaque_and_skips_alpha_models(self):
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            item = sample_item(
                asset_id="bg_gameplay",
                name="Gameplay Plate",
                category="background",
                recreation_strategy="background_plate_cleanup",
                isolate_with_background_removal=False,
            )
            plan = asset_factories.plan_for_item(run_dir, item)

            self.assertEqual(plan.route, asset_factories.ROUTE_BACKGROUND_PLATE)
            self.assertEqual(plan.primary_output, run_dir / "final-assets" / "backgrounds" / "bg_gameplay.png")
            self.assertNotIn(asset_factories.MODEL_PHOTOROOM, plan.scenario_models)
            self.assertNotIn(asset_factories.MODEL_PADDING_REMOVER, plan.scenario_models)
            self.assertGreaterEqual(len(plan.outputs["lora_candidates"]), 1)
            self.assertIn("Opaque plate output", plan.notes[0])

    def test_static_projectiles_keep_missile_proven_chain(self):
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            item = sample_item(asset_id="proj_missile", name="Missile", category="projectile")
            plan = asset_factories.plan_for_item(run_dir, item)

            self.assertEqual(plan.route, asset_factories.ROUTE_STATIC_SPRITE)
            self.assertEqual(plan.primary_output, run_dir / "final-assets" / "projectiles" / "proj_missile.png")
            self.assertEqual(
                plan.scenario_models,
                [
                    asset_factories.MODEL_GEMINI_EDIT,
                    asset_factories.MODEL_PHOTOROOM,
                    asset_factories.MODEL_PIXA_BACKGROUND_REMOVE,
                    asset_factories.MODEL_PADDING_REMOVER,
                ],
            )


class ScenarioAutomationPlanTests(unittest.TestCase):
    def test_dry_run_plan_exposes_factory_routes(self):
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            items = [
                sample_item(asset_id="char_skeleton", category="character"),
                sample_item(asset_id="vfx_explosion", category="effect"),
                sample_item(asset_id="bg_gameplay", category="background"),
            ]

            plan = scenario_automation.automation_plan_for_items(run_dir, items)
            routes = {entry["asset_id"]: entry["route"] for entry in plan}

            self.assertEqual(routes["char_skeleton"], asset_factories.ROUTE_CHARACTER_RIG)
            self.assertEqual(routes["vfx_explosion"], asset_factories.ROUTE_PROCEDURAL_VFX)
            self.assertEqual(routes["bg_gameplay"], asset_factories.ROUTE_BACKGROUND_PLATE)
            self.assertIn("outputs", plan[0])
            self.assertIn("prompts", plan[1])


class FullPipelineWrapperTests(unittest.TestCase):
    def test_default_run_dir_uses_video_stem(self):
        run_dir = run_full_asset_pipeline.default_run_dir(Path("/tmp/My Video!.mp4"))
        self.assertEqual(run_dir.name, "my_video")
        self.assertEqual(run_dir.parent.name, "runs")

    def test_selected_items_filters_before_limit(self):
        items = [
            sample_item(asset_id="a"),
            sample_item(asset_id="b"),
            sample_item(asset_id="c"),
        ]

        selected = run_full_asset_pipeline.selected_items(items, ["b", "c"], 1)

        self.assertEqual([item["asset_id"] for item in selected], ["b"])


if __name__ == "__main__":
    unittest.main()
