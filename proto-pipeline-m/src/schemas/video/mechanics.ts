import { z } from "zod";

const ControlSchema = z
  .object({
    name: z.string(),
    gesture: z.string(),
    result: z.string(),
    evidence_timestamps: z.array(z.string()),
    confidence: z.union([z.string(), z.number()]).transform((v) => String(v)),
  })
  .passthrough();

const MechanicSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    evidence_timestamps: z.array(z.string()),
    implementation_priority: z.enum(["must", "should", "could"]),
  })
  .passthrough();

const ContradictionSchema = z
  .object({
    topic: z.string(),
    observations: z.array(z.string()),
    resolution_needed: z.boolean(),
  })
  .passthrough();

export const MechanicsSchema = z
  .object({
    controls: z.array(ControlSchema),
    mechanics: z.array(MechanicSchema),
    win_condition: z.string(),
    loss_condition: z.string(),
    contradictions: z.array(ContradictionSchema),
  })
  .passthrough();

export type Mechanics = z.infer<typeof MechanicsSchema>;
