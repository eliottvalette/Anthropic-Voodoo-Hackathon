// P2 — Asset roles. Browser port of pipeline-m/src/pipeline/p2_assets.ts.
//
// For each asset image: describe (small Gemini call) → role mapping aggregator.
// Loose port: we batch image descriptions in a single call when possible.

import { generateContent, inlineDataPart } from './gemini-client'
import { loadPrompt } from './prompts'
import type { AssetMapping, SubCallEvent, VideoAnalysis } from './types'

export type P2Progress = (calls: SubCallEvent[]) => void

export async function runP2Assets(
  assets: File[],
  videoAnalysis: VideoAnalysis,
  variant: string,
  onProgress: P2Progress
): Promise<{ mapping: AssetMapping; subCalls: SubCallEvent[] }> {
  const calls: SubCallEvent[] = [
    { id: '2_describe', label: `Describe ${assets.length} assets`, status: 'idle' },
    { id: '2_aggregate', label: 'Map roles to filenames', status: 'idle' },
  ]
  const emit = () => onProgress(calls.map(c => ({ ...c })))
  const startCall = (id: string) => { const c = calls.find(x => x.id === id); if (c) c.status = 'active'; emit() }
  const finishCall = (id: string, durationMs: number, tokensIn?: number, tokensOut?: number) => {
    const c = calls.find(x => x.id === id); if (c) { c.status = 'done'; c.durationMs = durationMs; c.tokensIn = tokensIn; c.tokensOut = tokensOut }
    emit()
  }

  startCall('2_describe')
  const sysDescribe = await loadPrompt(variant, '2_asset_describe.md')
  // Inline images as base64 for description in a single multi-part call.
  const tD = performance.now()
  const parts = [
    { text: 'Describe each provided asset. Return JSON keyed by filename.' },
    ...await Promise.all(assets.map(async a => ({
      ...await inlineDataPart(a),
      // Prepend filename so the model can key its response
    } as const))),
  ]
  // Mix in filename labels as text parts (one per asset) so the model knows the names
  const interleaved = []
  for (let i = 0; i < assets.length; i++) {
    interleaved.push({ text: `--- ${assets[i].name} ---` })
    interleaved.push(await inlineDataPart(assets[i]))
  }
  const describeRes = await generateContent<{ descriptions: Record<string, string> }>(
    [{ text: 'Describe each asset image. Use filenames as keys.' }, ...interleaved],
    { systemInstruction: sysDescribe, responseMimeType: 'application/json' }
  )
  finishCall('2_describe', performance.now() - tD, describeRes.tokensIn, describeRes.tokensOut)

  startCall('2_aggregate')
  const sysAssets = await loadPrompt(variant, '2_assets.md')
  const tA = performance.now()
  const aggRes = await generateContent<AssetMapping>(
    [{ text: JSON.stringify({ video: videoAnalysis.merged, descriptions: describeRes.data }) }],
    { systemInstruction: sysAssets, responseMimeType: 'application/json' }
  )
  finishCall('2_aggregate', performance.now() - tA, aggRes.tokensIn, aggRes.tokensOut)

  return { mapping: aggRes.data, subCalls: calls }
}
