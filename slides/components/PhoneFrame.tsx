'use client'

import { useCallback, useEffect, useState } from 'react'

const GAME_W = 360
const GAME_H = 640
const PHONE_SIDE = 12
const PHONE_TOP = 8
const PHONE_BOTTOM = 8
const PHONE_W = GAME_W + 2 * PHONE_SIDE
const PHONE_H = GAME_H + PHONE_TOP + PHONE_BOTTOM

type Props = {
  src: string
  title?: string
  badge?: string
}

export function PhoneFrame({ src, title = 'Playable', badge }: Props) {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)

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
      const next = Math.max(0.1, Math.min(w / PHONE_W, h / PHONE_H))
      setScale((prev) => (Math.abs(prev - next) > 0.001 ? next : prev))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(containerEl)
    return () => ro.disconnect()
  }, [containerEl])

  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full items-center justify-center overflow-hidden">
      <div style={{ width: PHONE_W * scale, height: PHONE_H * scale, position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <PhoneBody src={src} title={title} badge={badge} />
        </div>
      </div>
    </div>
  )
}

function PhoneBody({ src, title, badge }: { src: string; title: string; badge?: string }) {
  return (
    <div
      data-slot="phone-body"
      style={{
        width: PHONE_W,
        height: PHONE_H,
        position: 'relative',
        background: 'linear-gradient(160deg, #2e2e30 0%, #1a1a1c 100%)',
        borderRadius: 50,
        boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 40px 90px -25px rgba(0,0,0,0.55)',
      }}
    >
      <div style={{ position: 'absolute', left: -4, top: 128, width: 4, height: 22, background: '#3a3a3c', borderRadius: '3px 0 0 3px', zIndex: 40 }} />
      <div style={{ position: 'absolute', left: -4, top: 160, width: 4, height: 36, background: '#3a3a3c', borderRadius: '3px 0 0 3px', zIndex: 40 }} />
      <div style={{ position: 'absolute', left: -4, top: 198, width: 4, height: 36, background: '#3a3a3c', borderRadius: '3px 0 0 3px', zIndex: 40 }} />
      <div style={{ position: 'absolute', right: -4, top: 170, width: 4, height: 60, background: '#3a3a3c', borderRadius: '0 3px 3px 0', zIndex: 40 }} />

      <div
        style={{
          position: 'absolute',
          top: PHONE_TOP,
          left: PHONE_SIDE,
          width: GAME_W,
          height: GAME_H,
          borderRadius: 32,
          overflow: 'hidden',
          background: '#000',
          zIndex: 0,
          isolation: 'isolate',
        }}
      >
        <iframe
          src={src}
          title={title}
          style={{ width: GAME_W, height: GAME_H, border: 'none', display: 'block', position: 'relative', zIndex: 0 }}
          allow="autoplay; fullscreen"
          loading="eager"
        />
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

      {badge && (
        <div
          style={{
            position: 'absolute',
            top: 28,
            left: PHONE_SIDE + 10,
            zIndex: 35,
          }}
          className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-white backdrop-blur"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-75" />
            <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-brand" />
          </span>
          {badge}
        </div>
      )}
    </div>
  )
}
