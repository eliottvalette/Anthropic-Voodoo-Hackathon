import { z } from "zod";

const HudElementSchema = z
  .object({
    element: z.string(),
    location: z.string(),
    purpose: z.string(),
    evidence_timestamps: z.array(z.string()),
  })
  .passthrough();

const ScreenSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    evidence_timestamps: z.array(z.string()),
  })
  .passthrough();

const CharOrPropSchema = z
  .object({
    label: z.string(),
    role_guess: z.string(),
    evidence_timestamps: z.array(z.string()),
  })
  .passthrough();

export const VisualUiSchema = z
  .object({
    art_style: z.string(),
    palette_hex: z.array(z.string()),
    hud: z.array(HudElementSchema),
    vfx: z.array(z.string()),
    screens: z.array(ScreenSchema),
    characters_or_props: z.array(CharOrPropSchema),
  })
  .passthrough();

export type VisualUi = z.infer<typeof VisualUiSchema>;
