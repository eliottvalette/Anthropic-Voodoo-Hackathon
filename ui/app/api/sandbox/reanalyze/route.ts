import { NextRequest, NextResponse } from 'next/server'

import { startReanalyzeJob } from '@/utils/sandboxBackend'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const hint = typeof body?.hint === 'string' ? body.hint : ''
    if (!hint.trim()) {
      return NextResponse.json({ error: 'hint is required' }, { status: 400 })
    }
    const job = startReanalyzeJob({
      runId: typeof body.run_id === 'string' ? body.run_id : null,
      hint,
    })
    return NextResponse.json(job)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start reanalysis' },
      { status: 400 },
    )
  }
}
