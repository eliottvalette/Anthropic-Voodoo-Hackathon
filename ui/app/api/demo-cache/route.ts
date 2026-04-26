// Demo cache: save / load a known-good run for live demos.
//
// POST  /api/demo-cache  body: { html: string, meta: RunMeta }
//   → writes ui/public/demo-cache/last-good/{playable.html, meta.json}
//
// GET   /api/demo-cache
//   → returns { html: string, meta: RunMeta } from disk, or 404 if none.
//
// At demo time, runReal catches any pipeline error and falls back to GET
// here; if a cache exists, it replays the stages with simulated timing
// and shows the cached HTML at the end. Without this fallback, an
// upstream Gemini / Anthropic outage during a live demo aborts the
// whole pipeline and shows a red error banner.

import { NextRequest, NextResponse } from 'next/server'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_DIR = path.resolve(process.cwd(), 'public', 'demo-cache', 'last-good')
const HTML_PATH = path.join(CACHE_DIR, 'playable.html')
const META_PATH = path.join(CACHE_DIR, 'meta.json')

const MAX_HTML_BYTES = 10 * 1024 * 1024 // hard upper bound; playables should be <5MB
const MAX_META_BYTES = 2 * 1024 * 1024

export async function GET() {
  try {
    if (!existsSync(HTML_PATH) || !existsSync(META_PATH)) {
      return NextResponse.json({ error: 'No demo cache present' }, { status: 404 })
    }
    const html = readFileSync(HTML_PATH, 'utf8')
    const meta = JSON.parse(readFileSync(META_PATH, 'utf8'))
    return NextResponse.json({ html, meta }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to read demo cache' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { html?: unknown; meta?: unknown }
    if (typeof body.html !== 'string' || !body.html.trim()) {
      return NextResponse.json({ error: 'html is required' }, { status: 400 })
    }
    if (!body.meta || typeof body.meta !== 'object') {
      return NextResponse.json({ error: 'meta is required (object)' }, { status: 400 })
    }
    const htmlBytes = Buffer.byteLength(body.html, 'utf8')
    if (htmlBytes > MAX_HTML_BYTES) {
      return NextResponse.json({ error: `html too large: ${htmlBytes} bytes` }, { status: 413 })
    }
    const metaJson = JSON.stringify(body.meta)
    if (metaJson.length > MAX_META_BYTES) {
      return NextResponse.json({ error: `meta too large: ${metaJson.length} bytes` }, { status: 413 })
    }

    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(HTML_PATH, body.html, 'utf8')
    writeFileSync(META_PATH, metaJson, 'utf8')

    return NextResponse.json({ ok: true, htmlBytes, metaBytes: metaJson.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save demo cache' },
      { status: 500 },
    )
  }
}
