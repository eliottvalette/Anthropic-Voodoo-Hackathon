// P1 fallback — when Gemini's Files API is unavailable (503 outages,
// timeouts), sample frames from the video in the browser and send them
// to Claude (Sonnet 4.6) via the /api/anthropic proxy.
//
// Returns the same VideoAnalysis shape as runP1Video so the orchestrator
// can consume it via precomputedVideoAnalysis transparently.
//
// Model choice: Sonnet 4.6 over Opus 4.7 — for "describe these N frames
// in JSON" Sonnet is plenty capable, ~5x faster, ~10x cheaper. Opus
// would be overkill here.

import type { SubCallEvent, VideoAnalysis } from './types'

const FRAME_COUNT = 8
const FRAME_MAX_WIDTH = 1280
const FRAME_QUALITY = 0.85
const MODEL = 'anthropic/claude-sonnet-4-6'

const SYSTEM_PROMPT = `You are analyzing frames sampled chronologically from a short mobile gameplay video. Produce a structured analysis matching this schema:

{
  "timeline": { "events": [{ "t_seconds": number, "what": string }] },
  "mechanics": { "core_loop": string, "input": string, "win_condition": string, "loss_condition": string },
  "visualUi": { "layout": string, "hud_elements": [string] },
  "merged": {
    "summary_one_sentence": string,
    "defining_hook": string,
    "genre": string,
    "tags": [string]
  },
  "alternate": {
    "fits_evidence_better": boolean,
    "alternate_genre": string,
    "rationale": string
  }
}

Frames are presented in chronological order. Be concrete and concise. Use the visible HUD, sprite movements, and player input cues to infer the mechanic. The summary_one_sentence and defining_hook MUST be specific to what you observe — never generic ("a casual mobile game").`

const SYSTEM_JSON_SUFFIX = '\n\nReturn ONLY a single JSON object that matches the schema described above. No markdown fences, no prose, no commentary.'

async function loadVideo(file: File): Promise<HTMLVideoElement> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.src = url
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve()
    video.onerror = () => reject(new Error('Failed to load video metadata'))
  })
  return video
}

async function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve() }
    const onError = () => { video.removeEventListener('error', onError); reject(new Error(`seek to ${t} failed`)) }
    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', onError, { once: true })
    video.currentTime = t
  })
}

async function extractFrames(file: File, count: number): Promise<Array<{ blob: Blob; t: number }>> {
  const video = await loadVideo(file)
  try {
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1
    const scale = Math.min(1, FRAME_MAX_WIDTH / Math.max(1, video.videoWidth))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2D context unavailable')

    const frames: Array<{ blob: Blob; t: number }> = []
    for (let i = 0; i < count; i++) {
      const t = (duration * (i + 0.5)) / count
      await seekTo(video, t)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas.toBlob returned null')), 'image/jpeg', FRAME_QUALITY)
      })
      frames.push({ blob, t })
    }
    return frames
  } finally {
    URL.revokeObjectURL(video.src)
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

function extractJson(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) return fence[1].trim()
  const objStart = trimmed.indexOf('{')
  if (objStart > 0) return trimmed.slice(objStart).trim()
  return trimmed
}

export async function runP1VideoClaude(
  videoFile: File,
  onProgress: (calls: SubCallEvent[]) => void = () => {},
): Promise<{ analysis: VideoAnalysis; subCalls: SubCallEvent[] }> {
  const calls: SubCallEvent[] = [
    { id: 'cl_extract', label: `Extract ${FRAME_COUNT} frames`, status: 'idle' },
    { id: 'cl_analyze', label: 'Claude vision analysis (Sonnet 4.6)', status: 'idle' },
  ]
  const emit = () => onProgress(calls.map(c => ({ ...c })))

  // Stage 1: extract frames in-browser
  calls[0].status = 'active'; emit()
  const tE = performance.now()
  const frames = await extractFrames(videoFile, FRAME_COUNT)
  calls[0].status = 'done'; calls[0].durationMs = performance.now() - tE; emit()

  // Stage 2: send to Claude
  calls[1].status = 'active'; emit()
  const tA = performance.now()

  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: `Here are ${frames.length} frames from a short gameplay video, in chronological order. Analyze and return JSON.` },
  ]
  for (const { blob, t } of frames) {
    const b64 = await blobToBase64(blob)
    content.push({ type: 'text', text: `Frame at t=${t.toFixed(2)}s:` })
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${b64}` },
    })
  }

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT + SYSTEM_JSON_SUFFIX },
      { role: 'user', content },
    ],
    temperature: 0.2,
    max_tokens: 4096,
  }

  const res = await fetch('/api/anthropic', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Claude P1 fallback HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`)
  }
  const raw = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const text = raw.choices?.[0]?.message?.content ?? ''
  const tokensIn = raw.usage?.prompt_tokens ?? 0
  const tokensOut = raw.usage?.completion_tokens ?? 0

  let analysis: VideoAnalysis
  try {
    analysis = JSON.parse(extractJson(text)) as VideoAnalysis
  } catch (parseErr) {
    throw new Error(`Claude P1 fallback returned non-JSON: ${(parseErr as Error).message}. First 200 chars: ${text.slice(0, 200)}`)
  }

  calls[1].status = 'done'
  calls[1].durationMs = performance.now() - tA
  calls[1].tokensIn = tokensIn
  calls[1].tokensOut = tokensOut
  emit()

  return { analysis, subCalls: calls }
}
