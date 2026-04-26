// Thin transparent proxy for the Gemini API.
//
// The browser pipeline calls fetch("/api/gemini?path=...&...", { method, body, headers })
// — the path + query are forwarded verbatim to https://generativelanguage.googleapis.com,
// the GEMINI_API_KEY (server-only env var) is appended, and the body is streamed in/out.
//
// Anything goes through here: generateContent JSON, file uploads (multipart), models list, etc.
// The browser never sees the API key.

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const GEMINI_BASE = 'https://generativelanguage.googleapis.com'

const FORWARD_HEADERS = new Set([
  'content-type',
  'x-goog-upload-command',
  'x-goog-upload-header-content-length',
  'x-goog-upload-header-content-type',
  'x-goog-upload-protocol',
  'x-goog-upload-offset',
])

async function proxy(req: NextRequest): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY missing in server env' },
      { status: 503 }
    )
  }

  const url = new URL(req.url)
  const targetPath = url.searchParams.get('path')
  if (!targetPath || !targetPath.startsWith('/')) {
    return NextResponse.json(
      { error: 'Missing or invalid "path" query param (must start with /)' },
      { status: 400 }
    )
  }

  // Build target URL: clone all query params except `path`, append the API key.
  const target = new URL(GEMINI_BASE + targetPath)
  url.searchParams.forEach((value, key) => {
    if (key === 'path') return
    target.searchParams.set(key, value)
  })
  target.searchParams.set('key', apiKey)

  // Forward only the headers Gemini cares about.
  const headers = new Headers()
  req.headers.forEach((value, key) => {
    if (FORWARD_HEADERS.has(key.toLowerCase())) headers.set(key, value)
  })

  const init: RequestInit & { duplex?: 'half' } = {
    method: req.method,
    headers,
    // Propagate client cancellation to the upstream fetch. Without this,
    // when the client aborts (e.g. our 180s timeout in fetchWithRetry),
    // the upstream POST keeps running, succeeds server-side, and the
    // client never sees the response — leading to retry storms that
    // re-upload the same chunk against an upload Gemini already accepted.
    signal: req.signal,
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body as ReadableStream<Uint8Array> | null
    init.duplex = 'half'
  }

  let upstream: Response
  try {
    upstream = await fetch(target.toString(), init)
  } catch (err) {
    return NextResponse.json(
      { error: 'Upstream fetch failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }

  // Pipe response back. Strip any header that might leak the upstream URL.
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

export async function GET(req: NextRequest) { return proxy(req) }
export async function POST(req: NextRequest) { return proxy(req) }
export async function PUT(req: NextRequest) { return proxy(req) }
export async function PATCH(req: NextRequest) { return proxy(req) }
export async function DELETE(req: NextRequest) { return proxy(req) }
