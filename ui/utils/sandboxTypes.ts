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
