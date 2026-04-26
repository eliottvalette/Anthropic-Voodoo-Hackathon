// P1 — Video analysis (browser port of pipeline-m/src/pipeline/p1_video.ts).
//
// Multi-pass:
//   1) Upload video to Gemini Files API + wait for ACTIVE
//   2) In parallel: timeline, mechanics, visual_ui  (1a/1b/1c)
//   3) Sequential: critic → merge → rewriter (1d block)
//   4) (Optional) contact_sheet (1e) — skipped in browser if no canvas extraction
//   5) Alternate (1f)
//
// Returns the merged video analysis + sub-call telemetry suitable for the UI.

import { generateContent, uploadFile, waitUntilActive, fileDataPart } from './gemini-client'
import type { ContentPart } from './gemini-client'
import { loadPrompt } from './prompts'
import type { VideoAnalysis, SubCallEvent } from './types'

export type P1Progress = (calls: SubCallEvent[]) => void

export async function runP1Video(
  videoFile: File,
  variant: string,
  onProgress: P1Progress
): Promise<{ analysis: VideoAnalysis; subCalls: SubCallEvent[] }> {
  const calls: SubCallEvent[] = [
    { id: '1_upload',     label: 'Upload to Gemini Files API', status: 'idle' },
    { id: '1a_timeline',  label: 'Timeline pass',              status: 'idle', group: 'video-pass' },
    { id: '1b_mechanics', label: 'Mechanics pass',             status: 'idle', group: 'video-pass' },
    { id: '1c_visual_ui', label: 'Visual UI pass',             status: 'idle', group: 'video-pass' },
    { id: '1d_critic',    label: 'Critic',                     status: 'idle' },
    { id: '1d_merge',     label: 'Merge',                      status: 'idle' },
    { id: '1f_alternate', label: 'Alternate genre check',      status: 'idle' },
  ]
  const emit = () => onProgress(calls.map(c => ({ ...c })))

  const startCall = (id: string) => {
    const c = calls.find(x => x.id === id); if (c) c.status = 'active'
    emit()
  }
  const finishCall = (id: string, durationMs: number, tokensIn?: number, tokensOut?: number) => {
    const c = calls.find(x => x.id === id); if (c) { c.status = 'done'; c.durationMs = durationMs; c.tokensIn = tokensIn; c.tokensOut = tokensOut }
    emit()
  }

  // 1. Upload
  startCall('1_upload')
  const t0 = performance.now()
  const file = await uploadFile(videoFile, videoFile.name)
  const active = await waitUntilActive(file)
  finishCall('1_upload', performance.now() - t0)

  const videoPart: ContentPart = fileDataPart(active.uri, active.mimeType)

  // 2. Parallel passes
  const passes = [
    { id: '1a_timeline',  prompt: '1a_timeline.md' },
    { id: '1b_mechanics', prompt: '1b_mechanics.md' },
    { id: '1c_visual_ui', prompt: '1c_visual_ui.md' },
  ]
  passes.forEach(p => startCall(p.id))
  const passResults = await Promise.all(passes.map(async p => {
    const sys = await loadPrompt(variant, p.prompt)
    const t = performance.now()
    const r = await generateContent<unknown>(
      [videoPart, { text: 'Analyze the gameplay video per the schema.' }],
      { systemInstruction: sys, responseMimeType: 'application/json' }
    )
    finishCall(p.id, performance.now() - t, r.tokensIn, r.tokensOut)
    return { id: p.id, data: r.data, text: r.text }
  }))

  const timeline = passResults.find(r => r.id === '1a_timeline')?.data
  const mechanics = passResults.find(r => r.id === '1b_mechanics')?.data
  const visualUi = passResults.find(r => r.id === '1c_visual_ui')?.data

  // 3. Critic + merge (sequential)
  startCall('1d_critic')
  const sysCritic = await loadPrompt(variant, '1d_critic.md')
  const tC = performance.now()
  const critic = await generateContent<unknown>(
    [{ text: JSON.stringify({ timeline, mechanics, visual_ui: visualUi }) }],
    { systemInstruction: sysCritic, responseMimeType: 'application/json' }
  )
  finishCall('1d_critic', performance.now() - tC, critic.tokensIn, critic.tokensOut)

  startCall('1d_merge')
  const sysMerge = await loadPrompt(variant, '1d_merge.md')
  const tM = performance.now()
  const merged = await generateContent<{ summary_one_sentence: string; defining_hook: string; [k: string]: unknown }>(
    [{ text: JSON.stringify({ timeline, mechanics, visual_ui: visualUi, critic: critic.data }) }],
    { systemInstruction: sysMerge, responseMimeType: 'application/json' }
  )
  finishCall('1d_merge', performance.now() - tM, merged.tokensIn, merged.tokensOut)

  // 4. Alternate
  startCall('1f_alternate')
  const sysAlt = await loadPrompt(variant, '1f_alternate.md')
  const tA = performance.now()
  const alt = await generateContent<{ fits_evidence_better: boolean; alternate_genre: string; rationale: string }>(
    [{ text: JSON.stringify({ merged: merged.data }) }],
    { systemInstruction: sysAlt, responseMimeType: 'application/json' }
  )
  finishCall('1f_alternate', performance.now() - tA, alt.tokensIn, alt.tokensOut)

  return {
    analysis: {
      timeline,
      mechanics,
      visualUi,
      merged: merged.data,
      alternate: alt.data,
    },
    subCalls: calls,
  }
}
