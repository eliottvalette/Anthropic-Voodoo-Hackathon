// Browser port of proto-pipeline-m/src/pipeline/assemble.ts.
//
// The codegen prompt (4_codegen_legacy.md) tells the model to emit a
// `/* ASSETS_BASE64 */` placeholder; the runtime then replaces it with a
// `const A = { role: "data:image/png;base64,..." }` block. Without this
// runtime step the generated HTML references `A.background` etc. which are
// undefined → blank canvas, dead playable.
//
// The CLI version reads from disk; we operate on the in-memory File[] that
// runReal already has hydrated.

import type { GameSpec } from './types'

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
}

const MAX_BYTES = 5 * 1024 * 1024

function inferMime(filename: string): string | undefined {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext]
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  // Build a binary string in chunks to avoid the call-stack-size limit on
  // String.fromCharCode.apply with large arrays.
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

export async function buildAssetsBlock(
  assetRoleMap: GameSpec['asset_role_map'],
  assets: File[],
): Promise<string> {
  const byName = new Map<string, File>()
  for (const f of assets) byName.set(f.name, f)

  const entries: string[] = []
  for (const [role, filename] of Object.entries(assetRoleMap)) {
    if (!filename) continue
    const file = byName.get(filename)
    if (!file) {
      console.warn(`[assemble] role ${role}: file ${filename} not in assets[]`)
      continue
    }
    const mime = inferMime(filename) ?? file.type ?? 'image/png'
    const b64 = await fileToBase64(file)
    entries.push(`  ${JSON.stringify(role)}: "data:${mime};base64,${b64}"`)
  }
  return `const A = {\n${entries.join(',\n')}\n};`
}

const MARKER_PAT = /\/\*\s*ASSETS_BASE64\s*\*\//
const CONST_A_PAT = /const\s+A\s*=\s*\{[\s\S]*?\};?/m

export function injectAssets(html: string, assetsBlock: string): string {
  let out = html
  if (MARKER_PAT.test(out)) {
    out = out.replace(MARKER_PAT, assetsBlock)
    while (CONST_A_PAT.test(out.replace(assetsBlock, ''))) {
      const without = out.replace(assetsBlock, '__ASSETS_PLACEHOLDER__')
      const stripped = without.replace(CONST_A_PAT, '')
      out = stripped.replace('__ASSETS_PLACEHOLDER__', assetsBlock)
    }
    return out
  }
  if (CONST_A_PAT.test(out)) return out.replace(CONST_A_PAT, assetsBlock)
  return out.replace(
    /(<script>)/i,
    `$1\n/* assets injected by runtime */\n${assetsBlock}\n`,
  )
}

export function assertSize(html: string): void {
  const bytes = new Blob([html]).size
  if (bytes > MAX_BYTES) {
    throw new Error(`Assembled HTML ${bytes} bytes exceeds limit ${MAX_BYTES} bytes`)
  }
}
