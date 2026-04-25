'use client'

import { useEffect, useRef, useState } from 'react'

const GAME_W = 360
const GAME_H = 640

interface PlayableViewerProps {
  html: string
}

export default function PlayableViewer({ html }: PlayableViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string>('')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [html])

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / GAME_W))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = 'playable.html'
    a.click()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
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
        className="w-full overflow-hidden rounded-2xl border border-gray-100 shadow-sm bg-black"
        style={{ height: GAME_H * scale }}
      >
        {blobUrl && (
          <iframe
            src={blobUrl}
            style={{
              width: GAME_W,
              height: GAME_H,
              border: 'none',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              display: 'block',
            }}
            title="Playable Preview"
            sandbox="allow-scripts allow-same-origin"
          />
        )}
      </div>
    </div>
  )
}
