import { z } from "zod";

export const SnapshotSchema = z.record(z.unknown()).nullable();
export type Snapshot = z.infer<typeof SnapshotSchema>;

export const RuntimeTrajectorySchema = z.object({
  initial: SnapshotSchema,
  afterFirstInput: SnapshotSchema,
  final: SnapshotSchema,
  phasesSeen: z.array(z.string()),
  turnIndicesSeen: z.array(z.number()),
  inputsTotal: z.number().int().nonnegative(),
  hpDeltaPlayer: z.number().nullable(),
  hpDeltaEnemy: z.number().nullable(),
});
export type RuntimeTrajectory = z.infer<typeof RuntimeTrajectorySchema>;

export const VerifyReportSchema = z.object({
  sizeBytes: z.number().int().nonnegative(),
  sizeOk: z.boolean(),
  consoleErrors: z.array(z.string()),
  canvasNonBlank: z.boolean(),
  mraidOk: z.boolean(),
  mechanicStringMatch: z.boolean(),
  interactionStateChange: z.boolean(),
  turnLoopObserved: z.boolean(),
  hpDecreasesOnHit: z.boolean(),
  ctaReachable: z.boolean(),
  behavioralNotes: z.array(z.string()).default([]),
  trajectory: RuntimeTrajectorySchema.optional(),
  runs: z.boolean(),
});

export type VerifyReport = z.infer<typeof VerifyReportSchema>;
