import type { RequiredAsset } from './assetCoverage'

export type SandboxAssetStatus = 'pending' | 'done' | 'error'

export type SandboxAsset = RequiredAsset & {
  asset_id: string
  status: SandboxAssetStatus
  route?: string
  error?: string
  final_url?: string
  crop_url?: string
  last_user_refinement?: string
  visual_description?: string
}

export type SandboxArtStyle = {
  summary?: string
  rendering?: string
  palette?: string
  anti_styles?: string[]
}

export type SandboxManifest = {
  run_id: string
  run_dir: string
  status?: string
  updated_at?: string
  completed_assets?: number
  failed_assets?: number
  planned_assets?: number
  art_style?: SandboxArtStyle | null
  // True once the Python pipeline has written
  // manifests/03_extracted_assets_manifest.json. Until then, the asset list
  // is empty by design — exposing the raw gemini inventory before
  // extraction completes lets the user click Generate during the gap, and
  // run_full_asset_pipeline.py crashes with FileNotFoundError because
  // --skip-extraction expects 03_*.json to exist.
  extraction_complete?: boolean
  assets: SandboxAsset[]
}

export type SandboxJobStatus = 'running' | 'done' | 'error'

export type SandboxJobKind = 'regenerate' | 'analyze' | 'generate' | 'reanalyze' | 'coverage'

export type SandboxJob = {
  job_id: string
  run_id: string
  kind: SandboxJobKind
  asset_id?: string
  status: SandboxJobStatus
  started_at: number
  additional_prompt?: string
  finished_at?: number
  exit_code?: number | null
  error?: string
  stdout?: string
  stderr?: string
  details?: Record<string, unknown>
}

export type SandboxCoverageMatch = {
  asset_id: string
  name?: string
  category?: string
  coverage: 'provided' | 'missing'
  matched_kind?: 'import' | 'library' | null
  matched_file: string | null
  confidence: number
  reasoning: string
}

export type SandboxCoverageReport = {
  summary: { total: number; provided: number; missing: number }
  matches: SandboxCoverageMatch[]
}
