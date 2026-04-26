// Serves the latest castle_clashers_gold target build as the mock playable.
// We read directly from filesystem so any rebuild of the target shows up
// immediately in the dashboard without copying or symlinking.

import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TARGET_HTML = resolve(
  process.cwd(),
  '..',
  'proto-pipeline-e/targets/castle_clashers_gold/dist/playable.html'
)

export async function GET() {
  try {
    const info = await stat(TARGET_HTML)
    const html = await readFile(TARGET_HTML, 'utf8')
    return new NextResponse(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'last-modified': info.mtime.toUTCString(),
      },
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Target playable not found',
        path: TARGET_HTML,
        detail: err instanceof Error ? err.message : String(err),
        hint: 'Run: cd proto-pipeline-e/targets/castle_clashers_gold && node build.mjs',
      },
      { status: 404 }
    )
  }
}
