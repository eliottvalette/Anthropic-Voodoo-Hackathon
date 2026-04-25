import { NextRequest, NextResponse } from 'next/server'

import { createEmptyRun } from '@/utils/sandboxBackend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const filename = typeof body?.filename === 'string' ? body.filename : 'source.mp4'
    const { runId } = createEmptyRun(filename)
    return NextResponse.json({ run_id: runId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start chunked upload'
    console.error('[api/sandbox/runs/start] failed:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
