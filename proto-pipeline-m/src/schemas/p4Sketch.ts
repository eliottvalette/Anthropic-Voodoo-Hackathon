import { z } from "zod";
import { SceneElementNameSchema } from "./p4Plan.ts";

export const P4SketchSchema = z
  .object({
    element: SceneElementNameSchema,
    js: z.string().min(20),
    uses_engine: z.array(z.string()),
    notes: z.string().optional(),
  })
  .strict();

export type P4Sketch = z.infer<typeof P4SketchSchema>;
