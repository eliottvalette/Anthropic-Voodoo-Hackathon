import { z } from "zod";
import { ScreenLayoutSchema } from "./description.ts";

const ResolvedContradictionSchema = z
  .object({
    topic: z.string(),
    chosen: z.string(),
    discarded: z.string(),
    rationale: z.string(),
  })
  .passthrough();

export const MergedVideoSchema = z
  .object({
    summary_one_sentence: z.string(),
    core_loop: z.array(z.string()),
    primary_control: z
      .object({ name: z.string(), gesture: z.string() })
      .passthrough(),
    win_condition: z.string(),
    loss_condition: z.string(),
    screen_layout: ScreenLayoutSchema.optional(),
    tempo: z.enum(["real_time", "turn_based", "async"]),
    art_style: z.enum([
      "cartoon_2d",
      "pixel_art",
      "flat_vector",
      "photo_real",
      "low_poly_3d",
      "other",
    ]),
    camera_angle: z.enum([
      "side",
      "top_down",
      "iso",
      "first_person",
      "three_quarter",
    ]),
    palette_hex: z.array(z.string()),
    hud: z.array(z.string()),
    characters_or_props: z.array(z.string()),
    defining_hook: z.string().nullable(),
    defining_hook_evidence_timestamps: z.array(z.string()),
    resolved_contradictions: z.array(ResolvedContradictionSchema),
    open_questions: z.array(z.string()),
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
        message:
          "defining_hook is null; evidence timestamps must be empty",
      });
    }
    if (typeof v.defining_hook === "string" && v.defining_hook.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defining_hook"],
        message: "defining_hook must be null or a non-empty string",
      });
    }
  });

export type MergedVideo = z.infer<typeof MergedVideoSchema>;

export const ContactSheetAnalysisSchema = z
  .object({
    cells: z.array(
      z.object({ n: z.number(), description: z.string() }).passthrough(),
    ),
    temporal_change_summary: z.string(),
    visual_hook: z.string(),
    visual_hook_cells: z.array(z.number()),
    static_or_dynamic: z.enum(["static", "dynamic"]),
  })
  .passthrough();
export type ContactSheetAnalysis = z.infer<typeof ContactSheetAnalysisSchema>;

export const AlternateInterpretationSchema = z
  .object({
    alternate_genre: z.string(),
    rationale: z.string(),
    fits_evidence_better: z.boolean(),
  })
  .passthrough();
export type AlternateInterpretation = z.infer<
  typeof AlternateInterpretationSchema
>;

export const P1dCritiqueSchema = z
  .object({
    factual_flaws: z.array(z.string()),
    missing_or_weak_fields: z.array(z.string()),
    overall_severity: z.enum(["none", "minor", "major"]),
  })
  .passthrough();
export type P1dCritique = z.infer<typeof P1dCritiqueSchema>;
