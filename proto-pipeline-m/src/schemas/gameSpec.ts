import { z } from "zod";

export const GameSpecSchema = z
  .object({
    source_video: z.string(),
    game_identity: z
      .object({
        observed_title: z.string().nullable(),
        genre: z.string(),
        visual_style: z.string(),
      })
      .passthrough(),
    render_mode: z.enum(["2d", "3d"]),
    mechanic_name: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/, "mechanic_name must be snake_case"),
    core_loop_one_sentence: z.string(),
    asset_role_map: z.record(z.string(), z.string().nullable()),
    numeric_params: z.record(z.string(), z.number()),
    win_condition: z.string(),
    loss_condition: z.string(),
    cta_url: z.string().url(),
    open_questions: z.array(z.string()),
  })
  .passthrough();

export type GameSpec = z.infer<typeof GameSpecSchema>;

export const AggregatorOutputSchema = z
  .object({
    game_spec: GameSpecSchema,
    codegen_prompt: z.string().min(50),
  })
  .passthrough();

export type AggregatorOutput = z.infer<typeof AggregatorOutputSchema>;
