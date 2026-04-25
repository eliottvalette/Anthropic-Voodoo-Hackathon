import { NextRequest, NextResponse } from 'next/server'

import { readCoverageReport, startCoverageJob, uploadCoverageImports } from '@/utils/sandboxBackend'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const runId = request.nextUrl.searchParams.get('run')
    return NextResponse.json({ report: readCoverageReport(runId) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read coverage report' },
      { status: 400 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const runId = typeof form.get('run_id') === 'string' ? (form.get('run_id') as string) : null
    const filesEntry = form.getAll('files').filter((entry): entry is File => entry instanceof File)
    if (filesEntry.length === 0) {
      return NextResponse.json({ error: 'At least one imported file is required (field name: "files")' }, { status: 400 })
    }
    const written = await uploadCoverageImports(runId, filesEntry)
    const job = startCoverageJob(runId)
    return NextResponse.json({ job, written })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start coverage matching' },
      { status: 400 },
    )
  }
}
