import { z } from "zod";

export const StateFieldSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/, "field must be camelCase or snake_case"),
    type: z.string(),
    description: z.string(),
    initial: z.unknown(),
  })
  .passthrough();
export type StateField = z.infer<typeof StateFieldSchema>;

export const SharedStateShapeSchema = z
  .object({
    fields: z.array(StateFieldSchema),
  })
  .passthrough();
export type SharedStateShape = z.infer<typeof SharedStateShapeSchema>;

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
    template_id: z.string().nullable(),
    core_loop_one_sentence: z.string(),
    defining_hook: z.string().nullable(),
    defining_hook_evidence_timestamps: z.array(z.string()),
    not_this_game: z.array(z.string()),
    first_5s_script: z.string().min(1),
    tutorial_loss_at_seconds: z.number().positive().max(60).nullable(),
    tutorial_loss_evidence_timestamps: z.array(z.string()),
    asset_role_map: z.record(z.string(), z.string().nullable()),
    numeric_params: z.record(z.string(), z.number()),
    win_condition: z.string(),
    loss_condition: z.string(),
    cta_url: z.string().url(),
    open_questions: z.array(z.string()),
    shared_state_shape: SharedStateShapeSchema,
  })
  .passthrough()
  .superRefine((v, ctx) => {
    if (v.defining_hook !== null && v.defining_hook_evidence_timestamps.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defining_hook_evidence_timestamps"],
        message:
          "defining_hook is non-null; at least one evidence timestamp range is required",
      });
    }
    if (v.defining_hook === null && v.defining_hook_evidence_timestamps.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defining_hook_evidence_timestamps"],
        message: "defining_hook is null; evidence timestamps must be empty",
      });
    }
    if (typeof v.defining_hook === "string" && v.defining_hook.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defining_hook"],
        message: "defining_hook must be null or a non-empty string",
      });
    }
    if (v.tutorial_loss_at_seconds !== null && v.tutorial_loss_evidence_timestamps.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tutorial_loss_evidence_timestamps"],
        message:
          "tutorial_loss_at_seconds is non-null; at least one evidence timestamp range is required",
      });
    }
    if (v.tutorial_loss_at_seconds === null && v.tutorial_loss_evidence_timestamps.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tutorial_loss_evidence_timestamps"],
        message: "tutorial_loss_at_seconds is null; evidence timestamps must be empty",
      });
    }
  });

export type GameSpec = z.infer<typeof GameSpecSchema>;

export const AggregatorOutputSchema = z
  .object({
    game_spec: GameSpecSchema,
    codegen_prompt: z.string().min(50),
  })
  .passthrough();

export type AggregatorOutput = z.infer<typeof AggregatorOutputSchema>;
