import { z } from "zod";
import { SharedStateShapeSchema } from "./gameSpec.ts";

const BriefSchema = z
  .object({
    name: z.string(),
    brief: z.string().min(20),
    reads_state_fields: z.array(z.string()),
    writes_state_fields: z.array(z.string()),
    notes: z.string().optional(),
  })
  .passthrough();

export const SubsystemBriefsSchema = z
  .object({
    shared_state_shape: SharedStateShapeSchema,
    briefs: z.object({
      input: BriefSchema,
      physics: BriefSchema,
      render: BriefSchema,
      state: BriefSchema,
      winloss: BriefSchema,
    }),
  })
  .passthrough();
export type SubsystemBriefs = z.infer<typeof SubsystemBriefsSchema>;

export const P3CritiqueSchema = z
  .object({
    factual_flaws: z.array(z.string()),
    missing_or_weak_fields: z.array(z.string()),
    overall_severity: z.enum(["none", "minor", "major"]),
  })
  .passthrough();
export type P3Critique = z.infer<typeof P3CritiqueSchema>;

export const P3RoundtripSchema = z
  .object({
    reconstructed_summary: z.string(),
    matches_original_intent: z.boolean(),
    missing_concepts: z.array(z.string()),
    drift_severity: z.enum(["none", "minor", "major"]),
  })
  .passthrough();
export type P3Roundtrip = z.infer<typeof P3RoundtripSchema>;
