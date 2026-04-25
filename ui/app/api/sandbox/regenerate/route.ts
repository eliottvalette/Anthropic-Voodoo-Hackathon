import { NextRequest, NextResponse } from 'next/server'

import { startRegenerateJob } from '@/utils/sandboxBackend'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body?.asset_id || typeof body.asset_id !== 'string') {
      return NextResponse.json({ error: 'asset_id is required' }, { status: 400 })
    }

    const job = startRegenerateJob({
      runId: typeof body.run_id === 'string' ? body.run_id : undefined,
      assetId: body.asset_id,
      additionalPrompt: typeof body.additional_prompt === 'string' ? body.additional_prompt : '',
      resolution: typeof body.resolution === 'string' ? body.resolution : '1K',
    })

    return NextResponse.json(job)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start regeneration' },
      { status: 400 },
    )
  }
}
