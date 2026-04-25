import { NextRequest, NextResponse } from 'next/server'

import { readSandboxAssetPrompt } from '@/utils/sandboxBackend'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assetId: string }> },
) {
  try {
    const { assetId } = await context.params
    return NextResponse.json(
      readSandboxAssetPrompt(request.nextUrl.searchParams.get('run'), decodeURIComponent(assetId)),
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read asset prompt' },
      { status: 404 },
    )
  }
}
