'use client'

import { useCallback, useEffect, useState } from 'react'

const GAME_W = 360
const GAME_H = 640

const PHONE_SIDE   = 12
/** Minimal top bezel; island sits over the first pixels of the screen. */
const PHONE_TOP    = 8
/** Minimal bottom bezel; home bar sits over the last pixels. */
const PHONE_BOTTOM = 8
const PHONE_W = GAME_W + 2 * PHONE_SIDE
const PHONE_H = GAME_H + PHONE_TOP + PHONE_BOTTOM

function htmlForPreview(html: string): string {
  return html.replace(
    /window\.location\.href\s*=\s*"https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.epicoro\.castleclashers";/g,
    'window.parent.postMessage({type:"playable-preview-cta",url:"https://play.google.com/store/apps/details?id=com.epicoro.castleclashers"},"*");'
  )
}

interface PlayableViewerProps {
  html: string
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

export default function PlayableViewer({ html, isFullscreen, onToggleFullscreen }: PlayableViewerProps) {
  const [blobUrl, setBlobUrl] = useState('')
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const blob = new Blob([htmlForPreview(html)], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [html])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'playable-preview-cta' && typeof e.data.url === 'string')
        window.open(e.data.url, '_blank', 'noopener,noreferrer')
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  // Callback ref so the ResizeObserver re-attaches when the container element
  // changes (focus toggle remounts the inner container).
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    setContainerEl(el)
  }, [])

  useEffect(() => {
    if (!containerEl) return
    const measure = () => {
      const r = containerEl.getBoundingClientRect()
      const w = r.width
      const h = r.height
      if (!w || !h) return
      // Uniform scale: phone aspect ratio fixed (PHONE_W × PHONE_H), sized to fit the container.
      // No upper cap — phone scales up when container is bigger so it hugs content tightly.
      const next = Math.max(0.1, Math.min(w / PHONE_W, h / PHONE_H))
      setScale(prev => (Math.abs(prev - next) > 0.001 ? next : prev))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(containerEl)
    return () => ro.disconnect()
  }, [containerEl])

  const handleDownload = () => {
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'playable.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Phone body at NATURAL size (384×PHONE_H). The outer wrapper applies a uniform
  // CSS scale so the phone hugs its content with consistent bezels — bezels
  // never stretch independently of the canvas.
  const phoneBody = (
    <div style={{
      width: PHONE_W, height: PHONE_H, position: 'relative',
      background: 'linear-gradient(160deg, #2e2e30 0%, #1a1a1c 100%)',
      borderRadius: 50,
      // Outer edge only; inner rim is the z-index 20 layer so the border sits in front of the game.
      boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
    }}>
      {/* Side buttons — above frame overlays so the chassis stays in front. */}
      <div style={{ position: 'absolute', left: -4, top: 128, width: 4, height: 22, background: '#3a3a3c', borderRadius: '3px 0 0 3px', zIndex: 40 }} />
      <div style={{ position: 'absolute', left: -4, top: 160, width: 4, height: 36, background: '#3a3a3c', borderRadius: '3px 0 0 3px', zIndex: 40 }} />
      <div style={{ position: 'absolute', left: -4, top: 198, width: 4, height: 36, background: '#3a3a3c', borderRadius: '3px 0 0 3px', zIndex: 40 }} />
      <div style={{ position: 'absolute', right: -4, top: 170, width: 4, height: 60, background: '#3a3a3c', borderRadius: '0 3px 3px 0', zIndex: 40 }} />
      {/* Screen + iframe; inner glass on top. */}
      <div style={{
        position: 'absolute', top: PHONE_TOP, left: PHONE_SIDE,
        width: GAME_W, height: GAME_H,
        borderRadius: 32, overflow: 'hidden', background: '#000',
        zIndex: 0,
        isolation: 'isolate',
      }}>
        {blobUrl && (
          <iframe
            src={blobUrl}
            style={{ width: GAME_W, height: GAME_H, border: 'none', display: 'block', position: 'relative', zIndex: 0 }}
            title="Playable Preview"
            sandbox="allow-scripts allow-same-origin"
          />
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 32,
            zIndex: 1,
            pointerEvents: 'none',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 0 0 2px rgba(0,0,0,0.5)',
          }}
        />
      </div>
      {/* Outer chassis rim: drawn above the game (transparent center), below notch/home. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 50,
          zIndex: 20,
          pointerEvents: 'none',
          background: 'transparent',
          boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.11), inset 0 0 0 2.5px rgba(0,0,0,0.5)',
        }}
      />
      {/* Notch + home: above rim + glass. */}
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 86,
          height: 20,
          background: '#000',
          borderRadius: 12,
          zIndex: 30,
          pointerEvents: 'none',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 2,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 108,
          height: 3,
          background: 'rgba(255,255,255,0.5)',
          borderRadius: 2,
          zIndex: 30,
          pointerEvents: 'none',
        }}
      />
    </div>
  )

  const ActionButtons = (
    <div className="flex items-center gap-2">
      {onToggleFullscreen && (
        <button
          onClick={onToggleFullscreen}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/95 border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-white active:scale-95 transition-all shadow-sm"
        >
          {isFullscreen ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4.5 1H1v3.5M7.5 1H11v3.5M4.5 11H1V7.5M7.5 11H11V7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 4.5V1h3.5M7.5 1H11v3.5M1 7.5V11h3.5M11 7.5V11H7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          {isFullscreen ? 'Exit' : 'Focus'}
        </button>
      )}
      <button
        onClick={handleDownload}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F141C] text-white text-xs font-semibold hover:bg-[#1e2a3a] active:scale-95 transition-all shadow-sm"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M6.5 2v6M4 6.5l2.5 2.5L9 6.5M1.5 10.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Download
      </button>
    </div>
  )

  return (
    <div className="relative flex flex-col h-full min-h-0 gap-4">
      {!isFullscreen && (
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[#0F141C]">Playable Preview</h2>
            <p className="text-xs text-gray-400 mt-0.5">Self-contained · runs offline</p>
          </div>
          {ActionButtons}
        </div>
      )}

      {isFullscreen && (
        <div className="absolute top-0 right-0 z-20">
          {ActionButtons}
        </div>
      )}

      <div ref={containerRef} className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        {/* Outer wrapper sized to scaled phone dimensions so flex centers it correctly. */}
        <div style={{ width: PHONE_W * scale, height: PHONE_H * scale, position: 'relative', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            {phoneBody}
          </div>
        </div>
      </div>
    </div>
  )
}
