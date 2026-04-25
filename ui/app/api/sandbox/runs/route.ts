import { NextRequest, NextResponse } from 'next/server'

import { createRunFromStream, listSandboxRuns } from '@/utils/sandboxBackend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ runs: listSandboxRuns() })
}

export async function POST(request: NextRequest) {
  try {
    const filename =
      request.headers.get('x-filename') ||
      request.nextUrl.searchParams.get('filename') ||
      'source.mp4'
    const { runId, job } = await createRunFromStream({
      filename,
      body: request.body,
    })
    return NextResponse.json({ run_id: runId, job })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start analysis'
    const stack = error instanceof Error ? error.stack : undefined
    console.error('[api/sandbox/runs] POST failed:', message, stack)
    return NextResponse.json({ error: message, stack }, { status: 400 })
  }
}
