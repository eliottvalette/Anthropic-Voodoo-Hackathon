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
  })
  .passthrough();

export type AssetRole = z.infer<typeof AssetRoleSchema>;
export type AssetMapping = z.infer<typeof AssetMappingSchema>;
