import { z } from "zod";

export const VideoMetaSchema = z.object({
  path: z.string(),
  durationSec: z.number(),
  width: z.number(),
  height: z.number(),
  fps: z.number(),
  codec: z.string(),
});
export type VideoMeta = z.infer<typeof VideoMetaSchema>;

export const RigPartSchema = z.object({
  file: z.string(),
  z_index: z.number().optional(),
  anchor: z.object({ x: z.number(), y: z.number() }).optional(),
});
export type RigPart = z.infer<typeof RigPartSchema>;

export const AssetSchema = z.object({
  filename: z.string(),
  relpath: z.string(),
  kind: z.enum(["image", "audio", "rig"]),
  width: z.number().optional(),
  height: z.number().optional(),
  durationSec: z.number().optional(),
  bytes: z.number(),
  rig: z
    .object({
      asset_id: z.string(),
      anchor: z.object({ x: z.number(), y: z.number() }),
      parts: z.array(RigPartSchema),
    })
    .optional(),
});
export type Asset = z.infer<typeof AssetSchema>;

export const ProbeReportSchema = z.object({
  video: VideoMetaSchema,
  assetsDir: z.string(),
  assets: z.array(AssetSchema),
  generatedAt: z.string(),
});
export type ProbeReport = z.infer<typeof ProbeReportSchema>;

export const ROLE_VOCAB = [
  "player_castle",
  "enemy_castle",
  "background_gameplay",
  "background_endcard",
  "unit_player_0",
  "unit_player_1",
  "unit_player_2",
  "unit_enemy_0",
  "unit_enemy_1",
  "unit_enemy_2",
  "projectile_player_0",
  "projectile_player_1",
  "projectile_player_2",
  "projectile_enemy_0",
  "hud_top_bar",
  "hud_unit_panel",
  "ui_play_button",
  "ui_battle_failed",
  "ui_battle_won",
  "ui_logo",
  "sfx_hit",
  "sfx_fire",
  "sfx_ui",
  "bgm_loop",
] as const;
export const RoleNameSchema = z.enum(ROLE_VOCAB);
export type RoleName = z.infer<typeof RoleNameSchema>;

export const RoleEntrySchema = z.object({
  role: RoleNameSchema,
  filename: z.string().nullable(),
  relpath: z.string().nullable(),
  needs_generation: z.boolean(),
  reason_if_null: z.string().nullable(),
});
export type RoleEntry = z.infer<typeof RoleEntrySchema>;

export const AssetMapSchema = z.object({
  roles: z.array(RoleEntrySchema),
  unmapped_assets: z.array(z.string()),
  notes: z.array(z.string()).default([]),
});
export type AssetMap = z.infer<typeof AssetMapSchema>;

export const TemplateIdSchema = z.enum([
  "artillery_drag_shoot",
  "lane_defender",
  "tap_to_shoot",
  "swipe_aim",
  "drag_drop",
]);
export type TemplateId = z.infer<typeof TemplateIdSchema>;

export const GameSpecSchema = z.object({
  game_id: z.string(),
  template_id: TemplateIdSchema,
  mechanic_name: z.string(),
  cta_url: z.string().url(),
  initial_state: z.object({
    playerHp: z.number().int().min(1).max(10),
    enemyHp: z.number().int().min(1).max(10),
    turnIndex: z.number().int().min(0),
    phase: z.string(),
  }),
  turn_order: z.array(z.object({ side: z.enum(["player", "enemy"]), slot: z.number().int() })),
  numeric_params: z.record(z.union([z.number(), z.string(), z.boolean()])),
  asset_role_map: z.array(RoleEntrySchema),
  util_picks: z.array(z.string()),
  rationale: z.string(),
});
export type GameSpec = z.infer<typeof GameSpecSchema>;
