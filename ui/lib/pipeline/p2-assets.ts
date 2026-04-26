// P2 — Asset roles. Browser port of pipeline-m/src/pipeline/p2_assets.ts.
//
// For each asset image: describe (small Gemini call) → role mapping aggregator.
// Loose port: we batch image descriptions in a single call when possible.

import { anthropicGenerate } from './anthropic-client'
import { fileDataPart, generateContent, uploadFile, waitUntilActive } from './gemini-client'
import type { ContentPart } from './gemini-client'
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
  // Upload assets through the Files API instead of inlining as base64. The
  // /api/gemini proxy sits behind a ~10 MB Route Handler body cap, and a
  // single describe call with 20+ asset images blew past it — the body got
  // truncated mid base64 string, and Gemini returned
  //   HTTP 400 "Invalid JSON payload received. Closing quote expected in string"
  // Files API uploads each asset in its own (chunked) request, so the size
  // ceiling is per-file, not per-batch. The describe call then references
  // the uploads by URI and stays small.
  const tD = performance.now()
  const uploaded = await Promise.all(
    assets.map(async asset => {
      const file = await uploadFile(asset, asset.name)
      return waitUntilActive(file)
    }),
  )
  const interleaved: ContentPart[] = []
  for (let i = 0; i < assets.length; i++) {
    interleaved.push({ text: `--- ${assets[i].name} ---` })
    interleaved.push(fileDataPart(uploaded[i].uri, uploaded[i].mimeType))
  }
  const describeRes = await generateContent<{ descriptions: Record<string, string> }>(
    [{ text: 'Describe each asset image. Use filenames as keys.' }, ...interleaved],
    { systemInstruction: sysDescribe, responseMimeType: 'application/json' }
  )
  finishCall('2_describe', performance.now() - tD, describeRes.tokensIn, describeRes.tokensOut)

  startCall('2_aggregate')
  const sysAssets = await loadPrompt(variant, '2_assets.md')
  const tA = performance.now()
  const aggRes = await anthropicGenerate<AssetMapping>(
    JSON.stringify({ video: videoAnalysis.merged, descriptions: describeRes.data }),
    { systemInstruction: sysAssets, responseMimeType: 'application/json' }
  )
  finishCall('2_aggregate', performance.now() - tA, aggRes.tokensIn, aggRes.tokensOut)

  return { mapping: aggRes.data, subCalls: calls }
}
