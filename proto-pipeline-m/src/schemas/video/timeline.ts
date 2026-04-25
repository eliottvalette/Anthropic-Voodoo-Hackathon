import { z } from "zod";

export const TimelineEventSchema = z
  .object({
    time_range: z.string(),
    observation: z.string(),
    gameplay_meaning: z.string(),
    confidence: z
      .union([z.enum(["low", "medium", "high"]), z.string(), z.number()])
      .transform((v) => {
        const s = String(v).toLowerCase();
        if (s === "low" || s === "medium" || s === "high") return s;
        const n = Number(v);
        if (Number.isFinite(n)) return n >= 0.8 ? "high" : n >= 0.5 ? "medium" : "low";
        return "medium";
      }),
    disambiguation_needed: z.boolean().optional(),
  })
  .passthrough();

export const TimelineSchema = z
  .object({
    events: z.array(TimelineEventSchema),
  })
  .passthrough();

export type Timeline = z.infer<typeof TimelineSchema>;
