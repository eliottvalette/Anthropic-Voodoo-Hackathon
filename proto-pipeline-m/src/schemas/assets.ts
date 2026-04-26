import { z } from "zod";

export const AssetRoleSchema = z
  .object({
    role: z.string().regex(/^[a-z][a-z0-9_]*$/, "role must be snake_case"),
    description: z.string(),
    filename: z.string().nullable(),
    match_confidence: z.enum(["low", "medium", "high"]),
    note: z.string().optional(),
  })
  .passthrough();

export const AssetMappingSchema = z
  .object({
    roles: z.array(AssetRoleSchema),
    cta_url: z.string().url().optional(),
  })
  .passthrough();

export const DEFAULT_CTA_URL =
  "https://play.google.com/store/apps/details?id=com.epicoro.castleclashers";

export type AssetRole = z.infer<typeof AssetRoleSchema>;
export type AssetMapping = z.infer<typeof AssetMappingSchema>;

export const AssetDescriptionSchema = z
  .object({
    description: z.string().min(1),
    category: z.enum([
      "character",
      "prop",
      "background",
      "projectile",
      "vfx",
      "ui",
      "tile",
      "weapon",
      "vehicle",
      "other",
    ]),
    dominant_colors_hex: z.array(z.string()),
    orientation: z.enum(["up", "down", "left", "right", "none"]),
    transparent_background: z.boolean(),
  })
  .passthrough();
export type AssetDescription = z.infer<typeof AssetDescriptionSchema>;

export const DescribedAssetSchema = z.object({
  filename: z.string(),
  relpath: z.string(),
  kind: z.enum(["image", "audio"]),
  width: z.number().int().nonnegative().optional(),
  height: z.number().int().nonnegative().optional(),
  durationSec: z.number().nonnegative().optional(),
  bytes: z.number().int().nonnegative(),
  description: AssetDescriptionSchema.nullable(),
});
export type DescribedAsset = z.infer<typeof DescribedAssetSchema>;

export const DescribedAssetsSchema = z.object({
  assets: z.array(DescribedAssetSchema),
});
export type DescribedAssets = z.infer<typeof DescribedAssetsSchema>;
