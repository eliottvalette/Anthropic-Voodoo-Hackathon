// Browser pipeline types.  Subset of pipeline-m types kept loose so the UI can
// degrade gracefully if a stage returns partial data.

export type StageId = 'probe' | 'video' | 'assets' | 'gameSpec' | 'codegen'

export type ProbeReport = {
  video: {
    name: string
    sizeBytes: number
    durationSec: number
    width: number
    height: number
    mimeType: string
  }
  assets: Array<{ name: string; sizeBytes: number; mimeType: string }>
}

export type VideoAnalysis = {
  timeline?: unknown
  mechanics?: unknown
  visualUi?: unknown
  merged: {
    summary_one_sentence: string
    defining_hook: string
    [k: string]: unknown
  }
  alternate?: { fits_evidence_better: boolean; alternate_genre: string; rationale: string }
  contactSheet?: unknown
}

export type AssetMapping = {
  roles: Array<{ role: string; filename: string | null; match_confidence: 'high' | 'medium' | 'low' }>
}

export type GameSpec = {
  source_video: string
  game_identity: { observed_title: string | null; genre: string; visual_style: string }
  render_mode: '2d' | '3d'
  mechanic_name: string
  template_id: string | null
  core_loop_one_sentence: string
  defining_hook: string
  not_this_game: string[]
  first_5s_script: string
  tutorial_loss_at_seconds: number
  asset_role_map: Record<string, string | null>
  params: Record<string, unknown>
  creative_slot_prompt: string
  [k: string]: unknown
}

export type GeneratedAssetMetadata = {
  asset_id: string
  filename: string
  name?: string
  category?: string
  visual_description?: string
}

export type VerifyReport = {
  runs: boolean
  sizeOk: boolean
  consoleErrors: string[]
  canvasNonBlank: boolean
  mraidOk: boolean
  mechanicStringMatch: boolean
  interactionStateChange: boolean
  htmlBytes?: number
}

export type CodegenResult = {
  html: string
  verify: VerifyReport
  retries: number
  monolithicFallbackUsed?: boolean
  subsystemFailCounts?: Record<string, number>
}

export type SubCallEvent = {
  id: string
  label: string
  status: 'idle' | 'active' | 'done' | 'error'
  group?: string
  durationMs?: number
  tokensIn?: number
  tokensOut?: number
}

export type StageEvent =
  | { type: 'stage_start'; stage: StageId }
  | { type: 'stage_progress'; stage: StageId; subCalls: SubCallEvent[] }
  | { type: 'stage_done'; stage: StageId; payload: unknown }
  | { type: 'stage_error'; stage: StageId; error: string }

export type RunMeta = {
  runId: string
  startedAt: string
  endedAt: string
  totalLatencyMs: number
  totalTokensIn: number
  totalTokensOut: number
  probe?: ProbeReport
  videoAnalysis?: VideoAnalysis
  assetMapping?: AssetMapping
  gameSpec?: GameSpec
  codegen?: CodegenResult
}
