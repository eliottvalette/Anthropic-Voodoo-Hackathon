import { NextRequest, NextResponse } from 'next/server'

import { appendChunkToRun } from '@/utils/sandboxBackend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const runId = request.nextUrl.searchParams.get('run_id')
    const offsetRaw = request.nextUrl.searchParams.get('offset') || '0'
    const offset = Number(offsetRaw)
    if (!runId) return NextResponse.json({ error: 'run_id required' }, { status: 400 })
    const totalBytes = await appendChunkToRun(runId, offset, request.body)
    return NextResponse.json({ run_id: runId, total_bytes: totalBytes })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to append chunk'
    console.error('[api/sandbox/runs/chunk] failed:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
