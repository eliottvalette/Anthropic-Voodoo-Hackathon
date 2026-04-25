'use client'

import { useEffect, useRef, useState } from 'react'

const GAME_W = 360
const GAME_H = 640

// Phone frame dimensions (body around the screen)
const PHONE_SIDE   = 12
const PHONE_TOP    = 14
const PHONE_BOTTOM = 14
const PHONE_W = GAME_W + 2 * PHONE_SIDE   // 384
const PHONE_H = GAME_H + PHONE_TOP + PHONE_BOTTOM  // 668

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
  const [blobUrl, setBlobUrl]   = useState('')
  const containerRef            = useRef<HTMLDivElement>(null)
  const [scale, setScale]       = useState(1)

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

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setScale(Math.min(1, width / PHONE_W, height / PHONE_H))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleDownload = () => {
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'playable.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-base font-semibold text-[#0F141C]">Playable Preview</h2>
          <p className="text-xs text-gray-400 mt-0.5">Self-contained · runs offline</p>
        </div>
        <div className="flex items-center gap-2">
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold hover:bg-gray-50 active:scale-95 transition-all"
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
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F141C] text-white text-xs font-semibold hover:bg-[#1e2a3a] active:scale-95 transition-all"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 2v6M4 6.5l2.5 2.5L9 6.5M1.5 10.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Download
          </button>
        </div>
      </div>

      {/* ── Phone frame ── */}
      {/*
        The trick: outer wrapper has width/height = PHONE_W/H * scale (the visual size).
        Flex centers this wrapper. Inside, the natural-size phone is scaled with top-left origin.
        This avoids the CSS transform layout-size problem.
      */}
      <div ref={containerRef} className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        <div style={{ width: PHONE_W * scale, height: PHONE_H * scale, position: 'relative', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: PHONE_W, height: PHONE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>

            {/* Phone body */}
            <div style={{
              width: PHONE_W, height: PHONE_H, position: 'relative',
              background: 'linear-gradient(160deg, #2e2e30 0%, #1a1a1c 100%)',
              borderRadius: 50,
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 0 0 2.5px rgba(0,0,0,0.55), 0 32px 80px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.3)',
            }}>

              {/* Left: mute */}
              <div style={{ position: 'absolute', left: -4, top: 82,  width: 4, height: 22, background: '#3a3a3c', borderRadius: '3px 0 0 3px' }} />
              {/* Left: vol+ */}
              <div style={{ position: 'absolute', left: -4, top: 118, width: 4, height: 34, background: '#3a3a3c', borderRadius: '3px 0 0 3px' }} />
              {/* Left: vol- */}
              <div style={{ position: 'absolute', left: -4, top: 162, width: 4, height: 34, background: '#3a3a3c', borderRadius: '3px 0 0 3px' }} />
              {/* Right: power */}
              <div style={{ position: 'absolute', right: -4, top: 130, width: 4, height: 60, background: '#3a3a3c', borderRadius: '0 3px 3px 0' }} />

              {/* Screen */}
              <div style={{
                position: 'absolute', top: PHONE_TOP, left: PHONE_SIDE,
                width: GAME_W, height: GAME_H,
                borderRadius: 40, overflow: 'hidden', background: '#000',
              }}>
                {blobUrl && (
                  <iframe
                    src={blobUrl}
                    style={{ width: GAME_W, height: GAME_H, border: 'none', display: 'block' }}
                    title="Playable Preview"
                    sandbox="allow-scripts allow-same-origin"
                  />
                )}

                {/* Dynamic Island */}
                <div style={{
                  position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
                  width: 120, height: 34, background: '#000', borderRadius: 20,
                  zIndex: 10, pointerEvents: 'none',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.04)',
                }} />

                {/* Home indicator */}
                <div style={{
                  position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                  width: 130, height: 5, background: 'rgba(255,255,255,0.42)', borderRadius: 3,
                  zIndex: 10, pointerEvents: 'none',
                }} />
              </div>
            </div>

          </div>
        </div>
      </div>

    </div>
  )
}
