import { z } from "zod";

export const TimelineEventSchema = z
  .object({
    time_range: z.string(),
    observation: z.string(),
    gameplay_meaning: z.string(),
    confidence: z.enum(["low", "medium", "high"]),
    disambiguation_needed: z.boolean().optional(),
  })
  .passthrough();

export const TimelineSchema = z
  .object({
    events: z.array(TimelineEventSchema),
  })
  .passthrough();

export type Timeline = z.infer<typeof TimelineSchema>;
