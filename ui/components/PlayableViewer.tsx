'use client'

import { useEffect, useRef, useState } from 'react'

const GAME_W = 360
const GAME_H = 640

interface PlayableViewerProps {
  html: string
}

function htmlForPreview(html: string): string {
  return html.replace(
    /window\.location\.href\s*=\s*"https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.epicoro\.castleclashers";/g,
    'window.parent.postMessage({type:"playable-preview-cta", url:"https://play.google.com/store/apps/details?id=com.epicoro.castleclashers"},"*");'
  )
}

export default function PlayableViewer({ html }: PlayableViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string>('')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const blob = new Blob([htmlForPreview(html)], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [html])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        typeof event.data === 'object' &&
        event.data !== null &&
        event.data.type === 'playable-preview-cta' &&
        typeof event.data.url === 'string'
      ) {
        window.open(event.data.url, '_blank', 'noopener,noreferrer')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const widthScale = entry.contentRect.width / GAME_W
      const heightScale = entry.contentRect.height / GAME_H
      setScale(Math.min(1, widthScale, heightScale))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleDownload = () => {
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'playable.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#0F141C]">Playable Preview</h2>
          <p className="text-xs text-gray-400 mt-0.5">Self-contained · runs offline</p>
        </div>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F141C] text-white text-xs font-semibold hover:bg-[#1e2a3a] active:scale-95 transition-all duration-150"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 2v6M4 6.5l2.5 2.5L9 6.5M1.5 10.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Download HTML
        </button>
      </div>

      <div
        ref={wrapperRef}
        className="relative mx-auto w-full max-w-[360px] flex-1 overflow-hidden rounded-2xl border border-gray-100 bg-black shadow-sm"
        style={{ aspectRatio: `${GAME_W} / ${GAME_H}` }}
      >
        {blobUrl && (
          <iframe
            src={blobUrl}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: GAME_W,
              height: GAME_H,
              border: 'none',
              display: 'block',
              transform: `translate(-50%, -50%) scale(${scale})`,
              transformOrigin: 'center center',
            }}
            title="Playable Preview"
            sandbox="allow-scripts allow-same-origin"
          />
        )}
      </div>
    </div>
  )
}
