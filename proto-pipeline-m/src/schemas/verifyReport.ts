import { z } from "zod";

export const VerifyReportSchema = z.object({
  sizeBytes: z.number().int().nonnegative(),
  sizeOk: z.boolean(),
  consoleErrors: z.array(z.string()),
  canvasNonBlank: z.boolean(),
  mraidOk: z.boolean(),
  mechanicStringMatch: z.boolean(),
  interactionStateChange: z.boolean(),
  runs: z.boolean(),
});

export type VerifyReport = z.infer<typeof VerifyReportSchema>;
