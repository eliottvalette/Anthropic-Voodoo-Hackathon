// P4 — Codegen + assemble + verify (browser).
//
// Loose port: a single Gemini call produces the full self-contained playable
// HTML, then the iframe verifier runs the 6 binary asserts. Up to N retries.
// Pipeline-m has a more sophisticated subsystems-by-subsystems strategy with
// monolithic fallback; this V1 keeps it simple and treats P4 as one call,
// surfaces the same VerifyReport shape so the UI is identical.

import { buildAssetsBlock, injectAssets } from './assemble'
import { fileDataPart, generateContent, uploadFile, waitUntilActive } from './gemini-client'
import type { ContentPart } from './gemini-client'
import { loadPrompt } from './prompts'
import { verifyInIframe } from './verify-iframe'
import type { CodegenResult, GameSpec, SubCallEvent } from './types'

export type P4Progress = (calls: SubCallEvent[]) => void

const MAX_RETRIES = 2

export async function runP4Codegen(
  gameSpec: GameSpec,
  assets: File[],
  variant: string,
  onProgress: P4Progress
): Promise<CodegenResult> {
  const calls: SubCallEvent[] = [
    { id: '4_codegen', label: 'Codegen (HTML)', status: 'idle' },
    { id: '4_verify', label: 'Verify (6 asserts)', status: 'idle' },
  ]
  const emit = () => onProgress(calls.map(c => ({ ...c })))
  const startCall = (id: string) => { const c = calls.find(x => x.id === id); if (c) c.status = 'active'; emit() }
  const finishCall = (id: string, durationMs: number, tokensIn?: number, tokensOut?: number, status: 'done' | 'error' = 'done') => {
    const c = calls.find(x => x.id === id); if (c) { c.status = status; c.durationMs = durationMs; c.tokensIn = tokensIn; c.tokensOut = tokensOut }
    emit()
  }

  const sysCodegen = await loadPrompt(variant, '4_codegen_legacy.md').catch(() => loadPrompt(variant, '4_render.md'))

  // Reference assets via Files API URIs instead of inlining base64. With the
  // hydrated generated-asset set the inlined body blew past the /api/gemini
  // proxy's ~10 MB Route Handler cap and Gemini returned
  //   HTTP 400 "Invalid JSON payload received. Closing quote expected in string"
  // Same fix as p2-assets.ts: each upload is its own (chunked) request, the
  // codegen call only sends URIs.
  const sliced = assets.slice(0, 16)
  const uploaded = await Promise.all(
    sliced.map(async a => {
      const f = await uploadFile(a, a.name)
      return waitUntilActive(f)
    }),
  )
  const assetParts: ContentPart[] = []
  for (let i = 0; i < sliced.length; i++) {
    assetParts.push({ text: `--- asset: ${sliced[i].name} ---` })
    assetParts.push(fileDataPart(uploaded[i].uri, uploaded[i].mimeType))
  }

  let html = ''
  let report: Awaited<ReturnType<typeof verifyInIframe>> = {
    runs: false, sizeOk: false, consoleErrors: [], canvasNonBlank: false,
    mraidOk: false, mechanicStringMatch: false, interactionStateChange: false, htmlBytes: 0,
  }

  let attempt = 0
  while (attempt <= MAX_RETRIES) {
    attempt++
    // Reset rows for retry
    if (attempt > 1) {
      calls[0].status = 'idle'; calls[0].durationMs = undefined
      calls[1].status = 'idle'; calls[1].durationMs = undefined
      calls[0].label = `Codegen (retry ${attempt - 1})`
      emit()
    }

    startCall('4_codegen')
    const tC = performance.now()
    const userPayload = JSON.stringify({
      game_spec: gameSpec,
      retry_attempt: attempt,
      previous_failures: attempt > 1 ? buildFailureContext(report) : undefined,
    })
    const r = await generateContent<unknown>(
      [{ text: userPayload }, ...assetParts],
      { systemInstruction: sysCodegen, responseMimeType: 'text/plain' }
    )
    finishCall('4_codegen', performance.now() - tC, r.tokensIn, r.tokensOut)

    html = extractHtml(r.text)

    // Codegen prompt instructs the model to emit a `/* ASSETS_BASE64 */`
    // placeholder; the runtime is responsible for swapping it for a real
    // `const A = { role: "data:image/png;base64,..." }` block. Without this,
    // the playable's JS references undefined `A.<role>` symbols → blank
    // canvas → verify fails. Ported from proto-pipeline-m/assemble.ts.
    try {
      const assetsBlock = await buildAssetsBlock(gameSpec.asset_role_map, assets)
      html = injectAssets(html, assetsBlock)
    } catch (err) {
      console.warn('[p4] asset injection failed; HTML may have undefined A.<role> refs:', err)
    }

    startCall('4_verify')
    const tV = performance.now()
    report = await verifyInIframe(html, gameSpec.mechanic_name)
    finishCall('4_verify', performance.now() - tV, undefined, undefined, report.runs ? 'done' : 'error')

    if (report.runs) break
  }

  return {
    html,
    verify: report,
    retries: Math.max(0, attempt - 1),
  }
}

function extractHtml(raw: string): string {
  // Strip code fences if the model wrapped output
  const fence = raw.match(/```html\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i)
  if (fence) return fence[1].trim()
  return raw.trim()
}

function buildFailureContext(r: { sizeOk: boolean; consoleErrors: string[]; canvasNonBlank: boolean; mraidOk: boolean; mechanicStringMatch: boolean; interactionStateChange: boolean }): Record<string, string> {
  const ctx: Record<string, string> = {}
  if (!r.sizeOk) ctx.size = 'HTML exceeded 5 MB; reduce inline assets'
  if (r.consoleErrors.length) ctx.console_errors = r.consoleErrors.slice(0, 3).join(' | ')
  if (!r.canvasNonBlank) ctx.canvas = 'Canvas was blank after 1.2s — make sure rendering starts in the first frame'
  if (!r.mraidOk) ctx.mraid = 'mraid.open( missing — every CTA must call mraid.open(STORE_URL) inside the click handler'
  if (!r.mechanicStringMatch) ctx.mechanic = 'mechanic_name string must literally appear in the JS source'
  if (!r.interactionStateChange) ctx.interaction = 'Engine state must change in response to a pointerdown+drag sequence'
  return ctx
}
