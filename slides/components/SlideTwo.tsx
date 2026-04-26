'use client'

import { useEffect, useState } from 'react'
import { SlideChrome } from './SlideChrome'

type Stage = {
  title: string
  caption: string
  artifact: string
}

const STAGES: Stage[] = [
  { title: 'Video', caption: 'Any gameplay clip', artifact: '30s · MP4' },
  { title: 'Multi-pass Gemini', caption: 'Timeline · Mechanics · Visual UI', artifact: 'JSON spec' },
  { title: 'Asset cascade', caption: 'Bank → Scenario → SVG fallback', artifact: '12 sprites' },
  { title: 'Codegen', caption: 'Gemini fills the template', artifact: 'HTML + JS' },
  { title: 'Verify', caption: 'Headless Playwright loop', artifact: '0 errors' },
  { title: 'HTML', caption: 'Single file, ≤5 MB', artifact: 'MRAID 2.0' },
]

export function SlideTwo({ active, index, total }: { active: boolean; index: number; total: number }) {
  const [lit, setLit] = useState(0)

  useEffect(() => {
    if (!active) {
      setLit(0)
      return
    }
    setLit(0)
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 0; i <= STAGES.length; i++) {
      timers.push(setTimeout(() => setLit(i), 320 + i * 380))
    }
    return () => timers.forEach(clearTimeout)
  }, [active])

  return (
    <SlideChrome index={index} total={total} eyebrow="02 — Pipeline">
      <div className="flex h-full flex-col">
        <div className="max-w-[60%]">
          <h1 className="font-display text-[72px] font-semibold leading-[0.95] tracking-tightest text-ink">
            One pipeline,
            <br />
            <span className="brand-underline">any gameplay video.</span>
          </h1>
          <p className="mt-6 max-w-[52ch] text-xl font-light leading-snug tracking-tight text-ink/75">
            Six stages, fully automated. Gemini reads the video, decides the
            mechanic, resolves assets through a cascade, generates the code,
            and verifies the output before we ship.
          </p>
        </div>

        <div className="mt-auto pb-4">
          <div className="flex items-stretch gap-3">
            {STAGES.map((stage, i) => (
              <Stage
                key={stage.title}
                stage={stage}
                index={i}
                isLast={i === STAGES.length - 1}
                lit={lit > i}
                arrowLit={lit > i + 1}
              />
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between text-[11px] uppercase tracking-[0.28em] text-muted">
            <span>Input</span>
            <span className="font-display text-brand">no human in the loop</span>
            <span>Output</span>
          </div>
        </div>
      </div>
    </SlideChrome>
  )
}

function Stage({
  stage,
  index,
  isLast,
  lit,
  arrowLit,
}: {
  stage: Stage
  index: number
  isLast: boolean
  lit: boolean
  arrowLit: boolean
}) {
  return (
    <>
      <div
        data-slot="stage-card"
        data-lit={lit}
        className="stage-card flex flex-1 flex-col rounded-xl border border-line bg-surface px-5 py-4"
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted">
            0{index + 1}
          </span>
          <span className="rounded-full bg-brand-soft px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-brand">
            {stage.artifact}
          </span>
        </div>
        <div className="mt-3 font-display text-xl font-semibold tracking-tight text-ink">
          {stage.title}
        </div>
        <div className="mt-1 text-xs leading-snug text-muted">
          {stage.caption}
        </div>
      </div>
      {!isLast && (
        <div
          data-slot="arrow"
          data-lit={arrowLit}
          className="arrow-pulse flex w-5 items-center justify-center"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke={arrowLit ? 'var(--brand)' : 'var(--line)'} strokeWidth={2} strokeLinecap="round">
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </div>
      )}
    </>
  )
}
