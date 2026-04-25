import { z } from "zod";

export const SubsystemHintsSchema = z
  .object({
    input: z.string().optional(),
    physics: z.string().optional(),
    render: z.string().optional(),
    state: z.string().optional(),
    winloss: z.string().optional(),
  })
  .strict();
export type SubsystemHints = z.infer<typeof SubsystemHintsSchema>;

export const TemplateModuleSchema = z
  .object({
    id: z.string(),
    description: z.string(),
    subsystem_hints: SubsystemHintsSchema,
  })
  .strict();
export type TemplateModule = z.infer<typeof TemplateModuleSchema>;
