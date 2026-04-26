import { z } from "zod";

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
    drift_severity: z.enum(["none", "minor", "major"]),
    missing_concepts: z.array(z.string()),
  })
  .passthrough();
export type P3Roundtrip = z.infer<typeof P3RoundtripSchema>;
