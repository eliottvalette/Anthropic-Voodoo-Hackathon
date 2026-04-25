// Browser-side verify. Loads the generated HTML in a sandboxed iframe and runs
// the same 6 binary asserts that pipeline-m's Playwright verifier checks.

import type { VerifyReport } from './types'

const SETTLE_MS = 1200
const INTERACT_DELAY_MS = 250

export async function verifyInIframe(html: string, mechanicName: string): Promise<VerifyReport> {
  const htmlBytes = new Blob([html]).size
  const sizeOk = htmlBytes <= 5 * 1024 * 1024
  const mraidOk = /\bmraid\.open\s*\(/.test(html)
  const mechanicStringMatch = mechanicName ? html.includes(mechanicName) : true

  const { canvasNonBlank, consoleErrors, interactionStateChange } = await runIframeAsserts(html)

  const report: VerifyReport = {
    sizeOk,
    consoleErrors,
    canvasNonBlank,
    mraidOk,
    mechanicStringMatch,
    interactionStateChange,
    htmlBytes,
    runs: false,
  }
  report.runs =
    report.sizeOk &&
    report.consoleErrors.length === 0 &&
    report.canvasNonBlank &&
    report.mraidOk &&
    report.mechanicStringMatch &&
    report.interactionStateChange
  return report
}

async function runIframeAsserts(html: string): Promise<{
  canvasNonBlank: boolean
  consoleErrors: string[]
  interactionStateChange: boolean
}> {
  return new Promise((resolve) => {
    const consoleErrors: string[] = []
    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin')
    iframe.style.position = 'fixed'
    iframe.style.left = '-10000px'
    iframe.style.top = '-10000px'
    iframe.style.width = '360px'
    iframe.style.height = '640px'
    iframe.srcdoc = html
    document.body.appendChild(iframe)

    const cleanup = () => {
      try { document.body.removeChild(iframe) } catch {}
    }

    iframe.addEventListener('load', async () => {
      type IframeWindow = Window & {
        __engineState?: { snapshot: () => unknown }
        console: Console
      }
      const win = iframe.contentWindow as IframeWindow | null
      const doc = iframe.contentDocument

      // Hook errors
      try {
        if (win) {
          const origErr = win.console.error.bind(win.console)
          win.console.error = (...args: unknown[]) => {
            consoleErrors.push(args.map(a => safeStringify(a)).join(' '))
            origErr(...(args as never[]))
          }
          win.addEventListener('error', e => consoleErrors.push(`${(e as ErrorEvent).message}`))
          win.addEventListener('unhandledrejection', e => {
            const reason = (e as PromiseRejectionEvent).reason
            consoleErrors.push(`unhandled: ${safeStringify(reason)}`)
          })
        }
      } catch {}

      // Wait for the playable to settle
      await sleep(SETTLE_MS)

      // Canvas non-blank check
      let canvasNonBlank = false
      try {
        const canvas = doc?.querySelector('canvas') as HTMLCanvasElement | null
        if (canvas) {
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (ctx) {
            const w = canvas.width
            const h = canvas.height
            const data = ctx.getImageData(0, 0, w, h).data
            // Count non-transparent / non-uniform pixels
            let lit = 0
            const sample = Math.min(2000, Math.floor(data.length / 4))
            for (let i = 0; i < sample; i++) {
              const idx = Math.floor((i / sample) * (data.length / 4)) * 4
              if (data[idx + 3] > 0 && (data[idx] !== 0 || data[idx + 1] !== 0 || data[idx + 2] !== 0)) lit++
            }
            canvasNonBlank = lit / sample > 0.05
          }
        }
      } catch (e) {
        consoleErrors.push(`canvas-probe: ${e instanceof Error ? e.message : String(e)}`)
      }

      // Interaction → state change
      let interactionStateChange = false
      try {
        const before = safeStringify(win?.__engineState?.snapshot?.() ?? null)
        const canvas = doc?.querySelector('canvas') as HTMLCanvasElement | null
        if (canvas && win) {
          dispatchPointer(win, canvas, 'pointerdown', 100, 320)
          await sleep(50)
          dispatchPointer(win, canvas, 'pointermove', 80, 380)
          await sleep(50)
          dispatchPointer(win, canvas, 'pointermove', 60, 440)
          await sleep(50)
          dispatchPointer(win, canvas, 'pointerup', 60, 440)
          await sleep(INTERACT_DELAY_MS)
        }
        const after = safeStringify(win?.__engineState?.snapshot?.() ?? null)
        interactionStateChange = before !== after && after !== 'null'
      } catch (e) {
        consoleErrors.push(`interaction-probe: ${e instanceof Error ? e.message : String(e)}`)
      }

      cleanup()
      resolve({ canvasNonBlank, consoleErrors, interactionStateChange })
    })

    // Hard timeout fallback
    setTimeout(() => { cleanup(); resolve({ canvasNonBlank: false, consoleErrors: ['verify timeout'], interactionStateChange: false }) }, SETTLE_MS + 4000)
  })
}

function dispatchPointer(win: Window, target: Element, type: string, x: number, y: number) {
  const rect = target.getBoundingClientRect()
  const ev = new (win as Window & { PointerEvent: typeof PointerEvent }).PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'touch',
    clientX: rect.left + x,
    clientY: rect.top + y,
    buttons: type === 'pointerup' ? 0 : 1,
  })
  target.dispatchEvent(ev)
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v) } catch { return String(v) }
}
