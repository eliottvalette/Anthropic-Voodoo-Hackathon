'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { SlideOne } from '@/components/SlideOne'
import { SlideTwo } from '@/components/SlideTwo'
import { SlideThree } from '@/components/SlideThree'

const TOTAL = 3

export default function Page() {
  const [current, setCurrent] = useState(0)
  const touchStartX = useRef<number | null>(null)

  const go = useCallback((delta: number) => {
    setCurrent((c) => Math.max(0, Math.min(TOTAL - 1, c + delta)))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault()
        go(1)
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        go(-1)
      } else if (e.key === 'Home') {
        setCurrent(0)
      } else if (e.key === 'End') {
        setCurrent(TOTAL - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('iframe') || target.closest('[data-no-advance]')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width * 0.25) go(-1)
    else if (x > rect.width * 0.6) go(1)
  }

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }
  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current == null) return
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
    touchStartX.current = null
  }

  return (
    <div className="deck-stage" onClick={onClick} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="deck-frame">
        <Slide active={current === 0}>
          <SlideOne index={0} total={TOTAL} />
        </Slide>
        <Slide active={current === 1}>
          <SlideTwo active={current === 1} index={1} total={TOTAL} />
        </Slide>
        <Slide active={current === 2}>
          <SlideThree index={2} total={TOTAL} />
        </Slide>

        <NavHud current={current} total={TOTAL} onGo={(i) => setCurrent(i)} />
      </div>
    </div>
  )
}

function Slide({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div className="slide" data-active={active}>
      {children}
    </div>
  )
}

function NavHud({
  current,
  total,
  onGo,
}: {
  current: number
  total: number
  onGo: (i: number) => void
}) {
  return (
    <div
      data-no-advance
      className="nav-hud absolute bottom-[3%] left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-bg/80 px-3 py-2 backdrop-blur"
      onClick={(e) => e.stopPropagation()}
    >
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          aria-label={`Go to slide ${i + 1}`}
          onClick={() => onGo(i)}
          className={`h-1.5 rounded-full transition-all ${
            i === current ? 'w-8 bg-brand' : 'w-2 bg-line hover:bg-muted'
          }`}
        />
      ))}
    </div>
  )
}
