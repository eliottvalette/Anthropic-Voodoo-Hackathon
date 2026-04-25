// P3 — Aggregator: combines video analysis + asset mapping into a typed GameSpec.

import { generateContent } from './gemini-client'
import { loadPrompt } from './prompts'
import type { AssetMapping, GameSpec, SubCallEvent, VideoAnalysis } from './types'

export type P3Progress = (calls: SubCallEvent[]) => void

export async function runP3Aggregator(
  videoAnalysis: VideoAnalysis,
  assetMapping: AssetMapping,
  variant: string,
  onProgress: P3Progress
): Promise<{ gameSpec: GameSpec; subCalls: SubCallEvent[] }> {
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
  const res = await generateContent<GameSpec>(
    [{ text: JSON.stringify({ video: videoAnalysis.merged, alternate: videoAnalysis.alternate, assets: assetMapping }) }],
    { systemInstruction: sys, responseMimeType: 'application/json' }
  )
  done(performance.now() - t, res.tokensIn, res.tokensOut)
  return { gameSpec: res.data, subCalls: calls }
}
