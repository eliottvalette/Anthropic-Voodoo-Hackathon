import { NextRequest, NextResponse } from 'next/server'

import { readSandboxManifest } from '@/utils/sandboxBackend'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const runId = request.nextUrl.searchParams.get('run')
    return NextResponse.json(readSandboxManifest(runId))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read sandbox manifest' },
      { status: 400 },
    )
  }
}
