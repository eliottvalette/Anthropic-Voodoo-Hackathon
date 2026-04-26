import { z } from "zod";

export const VideoMetaSchema = z.object({
  path: z.string(),
  durationSec: z.number().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  codec: z.string(),
});
export type VideoMeta = z.infer<typeof VideoMetaSchema>;

export const RigPartSchema = z.object({
  id: z.string(),
  file: z.string(),
  pivot: z.object({ x: z.number(), y: z.number() }).strict(),
  draw_order: z.number().int(),
});
export type RigPart = z.infer<typeof RigPartSchema>;

export const ImageAssetSchema = z.object({
  filename: z.string(),
  relpath: z.string(),
  kind: z.literal("image"),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  rig: z
    .object({
      asset_id: z.string(),
      anchor: z.object({ x: z.number(), y: z.number() }).strict(),
      parts: z.array(RigPartSchema),
      parts_dir_relpath: z.string(),
    })
    .strict()
    .optional(),
});
export type ImageAsset = z.infer<typeof ImageAssetSchema>;

export const AudioAssetSchema = z.object({
  filename: z.string(),
  relpath: z.string(),
  kind: z.literal("audio"),
  durationSec: z.number().nonnegative(),
  bytes: z.number().int().nonnegative(),
});
export type AudioAsset = z.infer<typeof AudioAssetSchema>;

export const AssetSchema = z.discriminatedUnion("kind", [
  ImageAssetSchema,
  AudioAssetSchema,
]);
export type Asset = z.infer<typeof AssetSchema>;

export const ProbeReportSchema = z.object({
  video: VideoMetaSchema,
  assetsDir: z.string(),
  assets: z.array(AssetSchema),
  generatedAt: z.string(),
});
export type ProbeReport = z.infer<typeof ProbeReportSchema>;
