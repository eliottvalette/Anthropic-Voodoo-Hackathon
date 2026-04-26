import { z } from "zod";

export const ScreenLayoutSchema = z
  .object({
    player_side: z.enum(["left", "right", "top", "bottom", "center", "unknown"]),
    enemy_side: z.enum(["left", "right", "top", "bottom", "center", "none", "unknown"]),
    evidence: z.string(),
  })
  .passthrough();

export const HpBarLayoutSchema = z
  .object({
    player_bar_position: z.string(),
    enemy_bar_position: z.string(),
    bars_visible: z.boolean(),
  })
  .passthrough();

export const KeyMomentSchema = z
  .object({
    time_range: z.string(),
    actor: z.enum(["player", "enemy", "both", "neutral", "ui"]),
    plain_action: z.string(),
  })
  .passthrough();

export const VideoDescriptionSchema = z
  .object({
    screen_layout: ScreenLayoutSchema,
    hp_bar_layout: HpBarLayoutSchema,
    narrative: z.string(),
    key_moments: z.array(KeyMomentSchema),
    color_grounding: z.array(
      z
        .object({
          subject: z.string(),
          color_observed: z.string(),
          source: z.enum(["sprite", "ui_bar", "vfx", "text", "background", "other"]),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type VideoDescription = z.infer<typeof VideoDescriptionSchema>;
