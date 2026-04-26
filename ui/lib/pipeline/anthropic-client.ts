// Browser-side Anthropic-via-OpenRouter client. All requests go through
// /api/anthropic, which appends ANTHROPIC_API_KEY (server-only). The
// browser never sees the key. We use OpenRouter's OpenAI-compatible
// chat-completions API, which Claude responds to.

export const ANTHROPIC_MODELS = {
  opus:   'anthropic/claude-opus-4-7',
  sonnet: 'anthropic/claude-sonnet-4-6',
  haiku:  'anthropic/claude-haiku-4-5',
} as const

export type AnthropicModel = typeof ANTHROPIC_MODELS[keyof typeof ANTHROPIC_MODELS]

const DEFAULT_MODEL: AnthropicModel = ANTHROPIC_MODELS.sonnet

export type AnthropicOptions = {
  model?: AnthropicModel
  systemInstruction?: string
  responseMimeType?: 'application/json' | 'text/plain'
  temperature?: number
  maxTokens?: number
}

export type AnthropicResult<T = unknown> = {
  data: T
  text: string
  tokensIn: number
  tokensOut: number
  latencyMs: number
}

const SYSTEM_JSON_SUFFIX =
  '\n\nReturn ONLY a single JSON object that matches the schema described above. No markdown fences, no prose, no commentary.'

// Mirror of gemini-client's fetchWithRetry. OpenRouter occasionally
// returns 502/503 during upstream Anthropic blips; without retry a
// single transient failure aborts the whole pipeline.
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504])
async function anthropicFetchWithRetry(input: string, init: RequestInit, attempts = 6): Promise<Response> {
  let backoff = 1000
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(input, init)
      if (res.ok || !RETRYABLE_STATUSES.has(res.status) || i === attempts - 1) return res
      const retryAfter = res.headers.get('retry-after')
      const retryAfterMs = retryAfter && !Number.isNaN(Number(retryAfter)) ? Number(retryAfter) * 1000 : null
      const waitMs = Math.min(retryAfterMs ?? backoff, 30_000)
      await new Promise(r => setTimeout(r, waitMs))
      backoff *= 2
    } catch (err) {
      lastErr = err
      if (i === attempts - 1) throw err
      await new Promise(r => setTimeout(r, Math.min(backoff, 30_000)))
      backoff *= 2
    }
  }
  throw lastErr ?? new Error('anthropicFetchWithRetry: exhausted retries')
}

function extractJson(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) return fence[1].trim()
  // Fallback: find the first { or [ and the matching last } or ]
  const objStart = trimmed.indexOf('{')
  const arrStart = trimmed.indexOf('[')
  const start = Math.min(...[objStart, arrStart].filter(n => n >= 0))
  if (Number.isFinite(start) && start > 0) return trimmed.slice(start).trim()
  return trimmed
}

export async function anthropicGenerate<T = unknown>(
  userText: string,
  opts: AnthropicOptions = {},
): Promise<AnthropicResult<T>> {
  const model = opts.model ?? DEFAULT_MODEL
  const wantsJson = opts.responseMimeType === 'application/json'
  const system = opts.systemInstruction
    ? (wantsJson ? opts.systemInstruction + SYSTEM_JSON_SUFFIX : opts.systemInstruction)
    : undefined

  const body = {
    model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: userText },
    ],
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 8192,
  }

  const t0 = performance.now()
  const res = await anthropicFetchWithRetry('/api/anthropic', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const latencyMs = performance.now() - t0

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Anthropic ${model} HTTP ${res.status}: ${errText.slice(0, 400)}`)
  }
  const raw = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const text = raw.choices?.[0]?.message?.content ?? ''
  const tokensIn = raw.usage?.prompt_tokens ?? 0
  const tokensOut = raw.usage?.completion_tokens ?? 0

  let data: T
  if (wantsJson) {
    try {
      data = JSON.parse(extractJson(text)) as T
    } catch {
      throw new Error(`Anthropic returned non-JSON when JSON requested. First 200 chars: ${text.slice(0, 200)}`)
    }
  } else {
    data = text as unknown as T
  }
  return { data, text, tokensIn, tokensOut, latencyMs }
}
