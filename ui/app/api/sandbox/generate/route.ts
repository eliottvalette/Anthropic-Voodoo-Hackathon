import { NextRequest, NextResponse } from 'next/server'

import { startGenerationJob } from '@/utils/sandboxBackend'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const assetIds = Array.isArray(body?.asset_ids) ? (body.asset_ids as unknown[]).map(String).filter(Boolean) : []
    if (assetIds.length === 0) {
      return NextResponse.json({ error: 'asset_ids must be a non-empty array' }, { status: 400 })
    }
    const job = startGenerationJob({
      runId: typeof body.run_id === 'string' ? body.run_id : null,
      assetIds,
      resolution: typeof body.resolution === 'string' ? body.resolution : '1K',
      numOutputs: typeof body.num_outputs === 'number' ? body.num_outputs : 1,
    })
    return NextResponse.json(job)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start generation' },
      { status: 400 },
    )
  }
}
