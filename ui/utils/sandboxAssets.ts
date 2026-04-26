// Browser helper that turns the assetsGen-stage outputs (PNGs sitting on
// disk under nico-sandbox/runs/<id>/final-assets/) back into File objects so
// the rest of the pipeline (p2-assets, p3-aggregator, p4-codegen) sees them
// alongside the user's original imports. Without this, the coworker's
// pipeline only knows about the user-dropped files and is blind to anything
// our Scenario stage produced.

import type { SandboxManifest } from './sandboxTypes'

export type GeneratedAssetMetadata = {
  asset_id: string
  filename: string         // matches the corresponding File.name in the returned files[]
  name?: string            // human display name, e.g. "Main Background Plate"
  category?: string
  visual_description?: string
}

export type HydratedAssets = {
  files: File[]
  metadata: GeneratedAssetMetadata[]   // 1:1 ordering with files
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

function inferMime(url: string, fallback: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? fallback
}

function filenameFromAsset(assetId: string, sourceUrl: string): string {
  // Use asset_id as the base name so downstream role-mapping has a stable
  // identifier independent of Scenario's generated path. Preserve the
  // original extension when possible.
  const ext = sourceUrl.split('?')[0].split('.').pop()?.toLowerCase()
  const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : 'png'
  return `${assetId}.${safeExt}`
}

export async function fetchGeneratedAssetFiles(runId: string): Promise<HydratedAssets> {
  const response = await fetch(
    `/api/sandbox/manifest?run=${encodeURIComponent(runId)}`,
    { cache: 'no-store' },
  )
  if (!response.ok) throw new Error(`manifest fetch failed: ${response.status} ${await response.text()}`)
  const manifest = (await response.json()) as SandboxManifest

  const targets = manifest.assets.filter(asset => asset.status === 'done' && !!asset.final_url)
  if (targets.length === 0) return { files: [], metadata: [] }

  const entries = await Promise.all(
    targets.map(async asset => {
      const url = asset.final_url as string
      const fetchResp = await fetch(url, { cache: 'no-store' })
      if (!fetchResp.ok) {
        throw new Error(`asset fetch failed for ${asset.asset_id}: ${fetchResp.status}`)
      }
      const blob = await fetchResp.blob()
      const filename = filenameFromAsset(asset.asset_id, url)
      const type = blob.type || inferMime(url, 'image/png')
      const file = new File([blob], filename, { type })
      const metadata: GeneratedAssetMetadata = {
        asset_id: asset.asset_id,
        filename,
        name: asset.name,
        category: asset.category,
        visual_description: asset.visual_description,
      }
      return { file, metadata }
    }),
  )
  return {
    files: entries.map(e => e.file),
    metadata: entries.map(e => e.metadata),
  }
}

// User-imported files take precedence over generated ones with the same
// filename, so the user can override a generation by uploading their own.
export function mergeAssetFiles(
  userFiles: File[],
  hydrated: HydratedAssets,
): { files: File[]; metadata: GeneratedAssetMetadata[] } {
  const seen = new Set(userFiles.map(f => f.name.toLowerCase()))
  const keep: File[] = []
  const keepMeta: GeneratedAssetMetadata[] = []
  for (let i = 0; i < hydrated.files.length; i++) {
    if (seen.has(hydrated.files[i].name.toLowerCase())) continue
    keep.push(hydrated.files[i])
    keepMeta.push(hydrated.metadata[i])
  }
  return { files: [...userFiles, ...keep], metadata: keepMeta }
}
