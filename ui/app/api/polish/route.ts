// POST /api/polish
//   body: { playableSource: string, gestures: Gesture[] }
//   → returns text/html (the patched playable, with hand-tutorial
//     runtime + matchers + fade-out spliced in before </body>).
//
// The route is stateless. The client persists the polished HTML
// via the existing saveRun() + /api/demo-cache flow once it gets
// the response back, so the polished HTML replaces the upstream
// playable in storage and demo-cache without divergent paths.

import { NextRequest, NextResponse } from 'next/server'
import { isGesture, type Gesture } from '@/utils/polishTypes'
import { buildInjection, loadAssets, splicePlayable } from '@/lib/polishInjection'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Inlined-base64 playables can land in the 10-15 MB range (background +
// 18 sprites at 1K). Default Next.js body limit is 1 MB; we bump via
// streamed body parsing below.
export const maxDuration = 60

// Limits tuned to the size of polished playables that ship inline base64
// for the entire asset set: 13 MB observed, headroom for 32 MB.
const MAX_INPUT_BYTES = 32 * 1024 * 1024
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024
const MAX_GESTURES = 32

async function readBodyAsString(req: NextRequest): Promise<string> {
  // Manually drain the request stream so we bypass Next's default
  // ~1 MB body cap on req.json(). Bounded by MAX_INPUT_BYTES below.
  const reader = req.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > MAX_INPUT_BYTES + 1024) {
        try { reader.cancel() } catch { /* ignore */ }
        throw new Error(`request body too large: ${total} bytes`)
      }
      chunks.push(value)
    }
  }
  let offset = 0
  const merged = new Uint8Array(total)
  for (const c of chunks) { merged.set(c, offset); offset += c.byteLength }
  return new TextDecoder('utf-8').decode(merged)
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await readBodyAsString(req)
    let body: { playableSource?: unknown; gestures?: unknown }
    try {
      body = JSON.parse(rawBody) as { playableSource?: unknown; gestures?: unknown }
    } catch (parseErr) {
      return NextResponse.json(
        { error: `invalid JSON body: ${parseErr instanceof Error ? parseErr.message : 'parse failed'}` },
        { status: 400 },
      )
    }

    if (typeof body.playableSource !== 'string' || !body.playableSource.trim()) {
      return NextResponse.json({ error: 'playableSource is required (non-empty string)' }, { status: 400 })
    }
    const inputBytes = Buffer.byteLength(body.playableSource, 'utf8')
    if (inputBytes > MAX_INPUT_BYTES) {
      return NextResponse.json({ error: `playableSource too large: ${inputBytes} bytes` }, { status: 413 })
    }

    if (!Array.isArray(body.gestures) || body.gestures.length === 0) {
      return NextResponse.json({ error: 'gestures must be a non-empty array' }, { status: 400 })
    }
    if (body.gestures.length > MAX_GESTURES) {
      return NextResponse.json({ error: `too many gestures: ${body.gestures.length} (max ${MAX_GESTURES})` }, { status: 400 })
    }
    for (const g of body.gestures) {
      if (!isGesture(g)) {
        return NextResponse.json({ error: 'invalid gesture shape' }, { status: 400 })
      }
    }
    const gestures = body.gestures as Gesture[]

    const { runtimeSource, handImgDataUrl } = await loadAssets()
    const injection = buildInjection({ runtimeSource, gestures, handImgDataUrl })
    const patched = splicePlayable(body.playableSource, injection)

    const outputBytes = Buffer.byteLength(patched, 'utf8')
    if (outputBytes > MAX_OUTPUT_BYTES) {
      return NextResponse.json({ error: `polished html too large: ${outputBytes} bytes` }, { status: 413 })
    }

    return new NextResponse(patched, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Polish-Output-Bytes': String(outputBytes),
        'X-Polish-Gesture-Count': String(gestures.length),
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to polish playable' },
      { status: 500 },
    )
  }
}
