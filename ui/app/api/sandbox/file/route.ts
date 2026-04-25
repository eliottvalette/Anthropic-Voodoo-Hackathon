import { NextRequest, NextResponse } from 'next/server'

import { readSandboxFile } from '@/utils/sandboxBackend'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const file = await readSandboxFile(
      searchParams.get('run'),
      searchParams.get('kind'),
      searchParams.get('path'),
    )
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        'Content-Type': file.contentType,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read sandbox file' },
      { status: 404 },
    )
  }
}
