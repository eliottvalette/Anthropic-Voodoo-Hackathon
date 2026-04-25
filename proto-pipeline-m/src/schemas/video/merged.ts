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
    art_style: z.string(),
    palette_hex: z.array(z.string()),
    hud: z.array(z.string()),
    characters_or_props: z.array(z.string()),
    resolved_contradictions: z.array(ResolvedContradictionSchema),
    open_questions: z.array(z.string()),
  })
  .passthrough();

export type MergedVideo = z.infer<typeof MergedVideoSchema>;
