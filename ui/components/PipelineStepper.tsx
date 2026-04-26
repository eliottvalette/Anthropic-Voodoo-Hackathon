'use client'

import { useEffect, useRef, useState } from 'react'

export type StepStatus = 'idle' | 'active' | 'awaiting' | 'done' | 'error'

export interface Step {
  id: string
  label: string
  estimate: string
  status: StepStatus
  startedAt?: number
  doneAt?: number
  output?: React.ReactNode
}

function StepDot({ status }: { status: StepStatus }) {
  if (status === 'done') {
    return (
      <div className="w-6 h-6 rounded-full bg-[#0F141C] flex items-center justify-center flex-shrink-0 z-10">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M2 5.5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }

  if (status === 'active') {
    return (
      <div className="w-6 h-6 rounded-full bg-[#0055FF] flex-shrink-0 z-10 pulse-dot" />
    )
  }

  if (status === 'awaiting') {
    return (
      <div className="w-6 h-6 rounded-full border-2 border-[#0055FF] bg-white flex items-center justify-center flex-shrink-0 z-10">
        <div className="w-1.5 h-1.5 rounded-full bg-[#0055FF]" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 z-10">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 2l6 6M8 2l-6 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    )
  }

  return (
    <div className="w-6 h-6 rounded-full border-2 border-gray-200 bg-white flex-shrink-0 z-10" />
  )
}

function ElapsedTimer({ startedAt, doneAt, estimate, status }: {
  startedAt?: number
  doneAt?: number
  estimate: string
  status: StepStatus
}) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (status !== 'active' || !startedAt) return
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [status, startedAt])

  if (status === 'idle') {
    return <span className="text-xs text-gray-300 tabular-nums">{estimate}</span>
  }
  if (status === 'active') {
    return <span className="text-xs text-[#0055FF] font-mono tabular-nums">{elapsed}s</span>
  }
  if ((status === 'done' || status === 'awaiting' || status === 'error') && startedAt && doneAt) {
    return (
      <span className="text-xs text-gray-400 font-mono tabular-nums">
        {((doneAt - startedAt) / 1000).toFixed(1)}s
      </span>
    )
  }
  return null
}

export default function PipelineStepper({ steps }: { steps: Step[] }) {
  const activeIdx = steps.findIndex(s => s.status === 'active' || s.status === 'awaiting')
  const refs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (activeIdx < 0) return
    const el = refs.current[steps[activeIdx].id]
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIdx, steps])

  return (
    <div className="flex flex-col">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1
        const lineColor = step.status === 'done' ? '#0F141C' : step.status === 'awaiting' || step.status === 'active' ? '#0055FF' : '#E5E7EB'

        return (
          <div
            key={step.id}
            ref={el => { refs.current[step.id] = el }}
            className="flex gap-4 scroll-mt-4"
          >
            {/* Dot + connecting line */}
            <div className="flex flex-col items-center" style={{ width: 24 }}>
              <StepDot status={step.status} />
              {!isLast && (
                <div
                  className="w-px flex-1 mt-1 transition-colors duration-500"
                  style={{ backgroundColor: lineColor, minHeight: 40 }}
                />
              )}
            </div>

            {/* Label + output */}
            <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-6'}`}>
              <div className="flex items-center justify-between" style={{ minHeight: 24 }}>
                <span className={`text-sm font-semibold transition-colors duration-200 ${
                  step.status === 'idle' ? 'text-gray-300'
                  : step.status === 'active' || step.status === 'awaiting' ? 'text-[#0055FF]'
                  : 'text-[#0F141C]'
                }`}>
                  {step.label}
                </span>
                <ElapsedTimer
                  startedAt={step.startedAt}
                  doneAt={step.doneAt}
                  estimate={step.estimate}
                  status={step.status}
                />
              </div>

              {step.output && (
                <div className="mt-3 fade-slide-in">
                  <div className="rounded-lg border border-gray-100 bg-[#F6F9FC] px-4 py-3 text-xs text-gray-500 leading-relaxed">
                    {step.output}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
