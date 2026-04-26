// Thin proxy for Anthropic-via-OpenRouter chat-completions.
//
// The browser pipeline POSTs an OpenAI-compatible chat-completions body to
// /api/anthropic; this handler forwards it verbatim to OpenRouter and appends
// the server-side ANTHROPIC_API_KEY (which holds an OpenRouter token). The
// browser never sees the key.
//
// We use this instead of the Gemini proxy for the codegen-heavy stages
// (P2-aggregate, P3, P4) because Gemini gemini-2.5-pro has been returning
// upstream 502s on long codegen calls and a separate provider isolates that
// failure mode.

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export async function POST(req: NextRequest): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY missing in server env' },
      { status: 503 }
    )
  }

  const init: RequestInit & { duplex?: 'half' } = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/Anthropic-Voodoo-Hackathon',
      'X-Title': 'voodoo-hackathon-ui',
    },
    body: req.body as ReadableStream<Uint8Array> | null,
    duplex: 'half',
  }

  let upstream: Response
  try {
    upstream = await fetch(OPENROUTER_URL, init)
  } catch (err) {
    return NextResponse.json(
      { error: 'Upstream fetch failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }

  const respHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    const k = key.toLowerCase()
    if (k === 'content-encoding' || k === 'transfer-encoding' || k === 'connection') return
    respHeaders.set(key, value)
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  })
}
