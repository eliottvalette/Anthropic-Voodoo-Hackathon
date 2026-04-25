import { NextRequest, NextResponse } from 'next/server'

import { finalizeRunUpload } from '@/utils/sandboxBackend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const runId = typeof body?.run_id === 'string' ? body.run_id : null
    if (!runId) return NextResponse.json({ error: 'run_id required' }, { status: 400 })
    const job = finalizeRunUpload(runId)
    return NextResponse.json({ run_id: runId, job })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to finalize upload'
    console.error('[api/sandbox/runs/finalize] failed:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
