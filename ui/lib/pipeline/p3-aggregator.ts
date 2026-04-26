// P3 — Aggregator: combines video analysis + asset mapping into a typed GameSpec.

import { anthropicGenerate } from './anthropic-client'
import { loadPrompt } from './prompts'
import type { AssetMapping, GameSpec, SubCallEvent, VideoAnalysis } from './types'

export type P3Progress = (calls: SubCallEvent[]) => void

// The 3_aggregator.md prompt instructs the model to output
//   { game_spec: GameSpec, codegen_prompt: string }
// Earlier versions of this file typed the response as GameSpec and stored
// the whole envelope raw, so every downstream `.mechanic_name`,
// `.template_id`, `.asset_role_map` was reading undefined off the wrapper
// instead of the nested game_spec. That made P4's codegen emit empty
// shells. We now unwrap explicitly and surface the codegen scaffold to
// the orchestrator so P4 can use it as the user message.
type AggregatorResponse = {
  game_spec?: GameSpec
  codegen_prompt?: string
} & Partial<GameSpec>

export async function runP3Aggregator(
  videoAnalysis: VideoAnalysis,
  assetMapping: AssetMapping,
  variant: string,
  onProgress: P3Progress,
  userBrief?: string
): Promise<{ gameSpec: GameSpec; codegenPrompt?: string; subCalls: SubCallEvent[] }> {
  const calls: SubCallEvent[] = [
    { id: '3_aggregate', label: 'Aggregate to GameSpec', status: 'idle' },
  ]
  const emit = () => onProgress(calls.map(c => ({ ...c })))
  const start = () => { calls[0].status = 'active'; emit() }
  const done = (durationMs: number, tokensIn?: number, tokensOut?: number) => {
    calls[0].status = 'done'; calls[0].durationMs = durationMs; calls[0].tokensIn = tokensIn; calls[0].tokensOut = tokensOut
    emit()
  }

  start()
  const sys = await loadPrompt(variant, '3_aggregator.md')
  const t = performance.now()
  const payload: Record<string, unknown> = {
    video: videoAnalysis.merged,
    alternate: videoAnalysis.alternate,
    assets: assetMapping,
  }
  if (userBrief && userBrief.trim()) payload.user_brief = userBrief.trim()
  const res = await anthropicGenerate<AggregatorResponse>(
    JSON.stringify(payload),
    { systemInstruction: sys, responseMimeType: 'application/json' }
  )
  done(performance.now() - t, res.tokensIn, res.tokensOut)
  // Accept either the documented envelope or a flat GameSpec (older variants).
  const gameSpec = (res.data.game_spec ?? (res.data as GameSpec)) as GameSpec
  const codegenPrompt = res.data.codegen_prompt
  return { gameSpec, codegenPrompt, subCalls: calls }
}
