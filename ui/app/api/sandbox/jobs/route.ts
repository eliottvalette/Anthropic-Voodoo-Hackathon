import { NextRequest, NextResponse } from 'next/server'

import { getSandboxJobs } from '@/utils/sandboxBackend'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get('run')
  return NextResponse.json({ jobs: getSandboxJobs(runId) })
}
