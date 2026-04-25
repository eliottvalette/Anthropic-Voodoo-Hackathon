import { z } from "zod";

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
    defining_hook: z.string().min(1),
    defining_hook_evidence_timestamps: z.array(z.string()).min(1),
    resolved_contradictions: z.array(ResolvedContradictionSchema),
    open_questions: z.array(z.string()),
  })
  .passthrough();

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
