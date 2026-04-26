// Browser-side Gemini client. All requests go through /api/gemini, which appends
// the server-side GEMINI_API_KEY. No keys live in the browser.

export const MODELS = {
  pro: 'gemini-2.5-pro',
  flash: 'gemini-2.5-flash',
} as const

export type GeminiModel = typeof MODELS[keyof typeof MODELS]

export type ContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } }

export type GenerateOptions = {
  model?: GeminiModel
  systemInstruction?: string
  responseMimeType?: 'application/json' | 'text/plain'
  responseSchema?: unknown
  temperature?: number
  topK?: number
  topP?: number
}

export type GenerateResult<T = unknown> = {
  data: T
  text: string
  tokensIn: number
  tokensOut: number
  latencyMs: number
  raw: unknown
}

const DEFAULT_MODEL: GeminiModel = MODELS.pro

function proxyUrl(path: string, query: Record<string, string> = {}): string {
  const sp = new URLSearchParams({ path, ...query })
  return `/api/gemini?${sp.toString()}`
}

// Retry transient upstream failures (5xx + 429) with exponential backoff.
// Useful when Gemini is degraded — we've seen Files API responses go
// 50s+ then return 503 on the very next chunk during outage windows.
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504])
// Hard ceiling per individual fetch attempt. During Gemini outages we've
// observed single requests hanging 80+ seconds before returning a 5xx —
// 6 retries × 80s = 8 minutes of demo-killing wait. Aborting at 30s lets
// the retry loop move on and total time becomes bounded.
const PER_ATTEMPT_TIMEOUT_MS = 30_000
async function fetchWithRetry(input: string, init: RequestInit, attempts = 6): Promise<Response> {
  let backoff = 1000
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), PER_ATTEMPT_TIMEOUT_MS)
    try {
      const res = await fetch(input, { ...init, signal: ctrl.signal })
      clearTimeout(timer)
      if (res.ok || !RETRYABLE_STATUSES.has(res.status) || i === attempts - 1) return res
      const retryAfter = res.headers.get('retry-after')
      const retryAfterMs = retryAfter && !Number.isNaN(Number(retryAfter)) ? Number(retryAfter) * 1000 : null
      const waitMs = Math.min(retryAfterMs ?? backoff, 30_000)
      await new Promise(r => setTimeout(r, waitMs))
      backoff *= 2
    } catch (err) {
      clearTimeout(timer)
      lastErr = err
      if (i === attempts - 1) throw err
      await new Promise(r => setTimeout(r, Math.min(backoff, 30_000)))
      backoff *= 2
    }
  }
  throw lastErr ?? new Error('fetchWithRetry: exhausted retries')
}

export async function generateContent<T = unknown>(
  parts: ContentPart[],
  opts: GenerateOptions = {}
): Promise<GenerateResult<T>> {
  const model = opts.model ?? DEFAULT_MODEL
  const path = `/v1beta/models/${model}:generateContent`

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      ...(opts.responseMimeType ? { responseMimeType: opts.responseMimeType } : {}),
      ...(opts.responseSchema ? { responseSchema: opts.responseSchema } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.topK !== undefined ? { topK: opts.topK } : {}),
      ...(opts.topP !== undefined ? { topP: opts.topP } : {}),
    },
  }
  if (opts.systemInstruction) {
    body.systemInstruction = { role: 'system', parts: [{ text: opts.systemInstruction }] }
  }

  const t0 = performance.now()
  const res = await fetchWithRetry(proxyUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const latencyMs = performance.now() - t0

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini ${model} HTTP ${res.status}: ${errText.slice(0, 400)}`)
  }
  const raw = await res.json()
  const text: string =
    raw?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
  const tokensIn = raw?.usageMetadata?.promptTokenCount ?? 0
  const tokensOut = raw?.usageMetadata?.candidatesTokenCount ?? 0

  let data: T
  try {
    data = (opts.responseMimeType === 'application/json' ? JSON.parse(text) : text) as T
  } catch {
    throw new Error(`Gemini returned non-JSON when JSON requested. First 200 chars: ${text.slice(0, 200)}`)
  }
  return { data, text, tokensIn, tokensOut, latencyMs, raw }
}

// ── Files API (for video upload) ────────────────────────────────────────────────
//
// 2-step "resumable" upload:
//   1) POST /upload/v1beta/files with x-goog-upload-protocol: resumable, start
//      → returns an upload session URL in the X-Goog-Upload-URL header
//   2) POST that URL with the bytes and x-goog-upload-command: upload, finalize
//      → returns { file: { uri, mimeType, ... } }
//
// In the browser, step 2 needs to be done via the proxy too (since upload URLs are
// served from the same generativelanguage.googleapis.com host and the API key is
// server-only). We extract the path from the upload URL and forward it.

export type UploadedFile = {
  uri: string
  mimeType: string
  name: string
  sizeBytes: number
  state?: string
}

// Next.js route handlers buffer the request body up to ~10 MiB before the
// stream is forwarded upstream, so we send the file in chunks below that bound
// using Gemini's resumable-upload protocol (one POST per chunk, "finalize" on
// the last one).
const UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024

export async function uploadFile(file: Blob, displayName: string): Promise<UploadedFile> {
  const startRes = await fetchWithRetry(proxyUrl('/upload/v1beta/files'), {
    method: 'POST',
    headers: {
      'x-goog-upload-protocol': 'resumable',
      'x-goog-upload-command': 'start',
      'x-goog-upload-header-content-length': String(file.size),
      'x-goog-upload-header-content-type': file.type || 'application/octet-stream',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ file: { displayName } }),
  })
  if (!startRes.ok) {
    throw new Error(`Files upload start failed: ${startRes.status} ${await startRes.text()}`)
  }
  const uploadUrl = startRes.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new Error('No x-goog-upload-url header in start response')
  const uploadPath = new URL(uploadUrl).pathname
  const uploadQuery: Record<string, string> = {}
  new URL(uploadUrl).searchParams.forEach((v, k) => { uploadQuery[k] = v })

  const contentType = file.type || 'application/octet-stream'
  let offset = 0
  let lastResponse: Response | null = null

  while (offset < file.size || file.size === 0) {
    const end = Math.min(offset + UPLOAD_CHUNK_SIZE, file.size)
    const isLast = end >= file.size
    const chunk = file.slice(offset, end)

    const res = await fetchWithRetry(proxyUrl(uploadPath, uploadQuery), {
      method: 'POST',
      headers: {
        'content-type': contentType,
        'x-goog-upload-command': isLast ? 'upload, finalize' : 'upload',
        'x-goog-upload-offset': String(offset),
      },
      body: chunk,
    })
    if (!res.ok) {
      throw new Error(`Files upload chunk @${offset} failed: ${res.status} ${await res.text()}`)
    }
    lastResponse = res
    offset = end
    if (isLast) break
  }

  if (!lastResponse) throw new Error('Files upload: no chunk was sent')
  const json = await lastResponse.json()
  const f = json.file
  return { uri: f.uri, mimeType: f.mimeType, name: f.name, sizeBytes: Number(f.sizeBytes ?? file.size), state: f.state }
}

// Poll until the uploaded file moves from PROCESSING → ACTIVE.
export async function waitUntilActive(
  file: UploadedFile,
  opts: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<UploadedFile> {
  const { intervalMs = 1500, timeoutMs = 5 * 60_000 } = opts
  const t0 = Date.now()
  let current = file
  while (current.state !== 'ACTIVE') {
    if (Date.now() - t0 > timeoutMs) throw new Error('uploadFile: timeout waiting for ACTIVE')
    await new Promise(r => setTimeout(r, intervalMs))
    const path = '/' + (current.name.startsWith('files/') ? `v1beta/${current.name}` : current.name.replace(/^\//, ''))
    const res = await fetch(proxyUrl(path))
    if (!res.ok) throw new Error(`Files get failed: ${res.status}`)
    const j = await res.json()
    let nextState = j.state as string | undefined
    // Images are typically ACTIVE on first response; if Gemini omits the
    // state field for an image, treat it as active to avoid hanging on
    // the 5-minute timeout.
    if (!nextState && (current.mimeType ?? '').startsWith('image/')) {
      nextState = 'ACTIVE'
    }
    current = { ...current, state: nextState }
  }
  return current
}

// Helper to build a part referencing an uploaded file (for video).
export function fileDataPart(uri: string, mimeType: string): ContentPart {
  return { fileData: { fileUri: uri, mimeType } }
}

// Helper to inline-encode a small image as base64 (for assets).
export async function inlineDataPart(blob: Blob): Promise<ContentPart> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  const data = btoa(bin)
  return { inlineData: { mimeType: blob.type || 'application/octet-stream', data } }
}
