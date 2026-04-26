// Voxtral transcription proxy.
// The browser POSTs multipart/form-data with `file` (audio blob).
// We forward to Mistral's audio/transcriptions endpoint server-side so the
// MISTRAL_API_KEY never reaches the browser.

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MISTRAL_URL = 'https://api.mistral.ai/v1/audio/transcriptions'
const DEFAULT_MODEL = 'voxtral-mini-latest'

export async function POST(req: NextRequest): Promise<Response> {
  const apiKey = process.env.MISTRAL_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'MISTRAL_API_KEY missing in server env' }, { status: 503 })
  }

  let incoming: FormData
  try {
    incoming = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with a "file" field' }, { status: 400 })
  }

  const file = incoming.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Missing "file" field' }, { status: 400 })
  }

  const model = (incoming.get('model') as string | null) ?? DEFAULT_MODEL
  const language = (incoming.get('language') as string | null) ?? undefined

  const upstream = new FormData()
  const filename = (incoming.get('filename') as string | null) ?? (file as File).name ?? 'audio.webm'
  upstream.append('file', file, filename)
  upstream.append('model', model)
  if (language) upstream.append('language', language)

  const t0 = Date.now()
  const res = await fetch(MISTRAL_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: upstream,
  })
  const ms = Date.now() - t0

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return NextResponse.json(
      { error: 'Voxtral upstream error', status: res.status, detail: text.slice(0, 1000) },
      { status: res.status }
    )
  }

  const data = await res.json().catch(() => null) as { text?: string; language?: string } | null
  if (!data || typeof data.text !== 'string') {
    return NextResponse.json({ error: 'Unexpected Voxtral response shape' }, { status: 502 })
  }

  return NextResponse.json({ text: data.text, language: data.language ?? null, latencyMs: ms })
}
