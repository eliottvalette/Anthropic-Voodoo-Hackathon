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
  const res = await fetch(proxyUrl(path), {
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

export async function uploadFile(file: Blob, displayName: string): Promise<UploadedFile> {
  const startRes = await fetch(proxyUrl('/upload/v1beta/files'), {
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

  const finRes = await fetch(proxyUrl(uploadPath, uploadQuery), {
    method: 'POST',
    headers: {
      'content-type': file.type || 'application/octet-stream',
      'x-goog-upload-command': 'upload, finalize',
      'x-goog-upload-offset': '0',
    },
    body: file,
  })
  if (!finRes.ok) {
    throw new Error(`Files upload finalize failed: ${finRes.status} ${await finRes.text()}`)
  }
  const json = await finRes.json()
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
    current = { ...current, state: j.state }
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
