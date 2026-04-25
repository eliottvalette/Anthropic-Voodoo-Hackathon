'use client'

import { useState } from 'react'
import { Step } from './PipelineStepper'
import PlayableViewer from './PlayableViewer'

interface ReviewPanelProps {
  steps: Step[]
  reviewContent: Record<string, React.ReactNode>
  playableHtml: string | null
  isAwaiting: boolean
  onAccept: () => void
  onRetry: () => void
  onCorrect: (text: string) => void
}

function ReviewControls({ onAccept, onRetry, onCorrect }: {
  onAccept: () => void
  onRetry: () => void
  onCorrect: (text: string) => void
}) {
  const [mode, setMode] = useState<'idle' | 'correct'>('idle')
  const [text, setText] = useState('')

  if (mode === 'correct') {
    return (
      <div className="space-y-2">
        <textarea
          autoFocus
          placeholder="Describe what to change…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) {
              onCorrect(text); setMode('idle'); setText('')
            }
          }}
          className="w-full rounded-xl border border-gray-200 p-3 text-sm resize-none focus:outline-none focus:border-[#0055FF] text-[#0F141C] placeholder-gray-300 bg-white"
          rows={3}
        />
        <div className="flex gap-2">
          <button
            onClick={() => { onCorrect(text); setMode('idle'); setText('') }}
            disabled={!text.trim()}
            className="flex-1 py-2 rounded-xl bg-[#0055FF] text-white text-sm font-semibold disabled:opacity-30 hover:bg-[#0044DD] active:scale-[0.98] transition-all"
          >
            Apply
          </button>
          <button
            onClick={() => { setMode('idle'); setText('') }}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={onAccept}
        className="flex-1 py-2.5 rounded-xl bg-[#0F141C] text-white text-sm font-semibold hover:bg-[#1e2a3a] active:scale-[0.98] transition-all"
      >
        Accept
      </button>
      <button
        onClick={() => setMode('correct')}
        className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 active:scale-[0.98] transition-all"
      >
        Correct
      </button>
      <button
        onClick={onRetry}
        className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-400 hover:bg-gray-50 active:scale-[0.98] transition-all"
      >
        Retry
      </button>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-2 bg-gray-100 rounded-full w-20" />
      <div className="h-28 bg-gray-50 rounded-xl" />
      <div className="h-2 bg-gray-100 rounded-full w-3/4" />
      <div className="h-2 bg-gray-100 rounded-full w-1/2" />
    </div>
  )
}

export default function ReviewPanel({
  steps, reviewContent, playableHtml, isAwaiting, onAccept, onRetry, onCorrect,
}: ReviewPanelProps) {
  const activeStep  = steps.find(s => s.status === 'active' || s.status === 'awaiting') ?? null
  const isLoading   = activeStep?.status === 'active'
  const allDone     = steps.every(s => s.status === 'done') && !!playableHtml
  const hasContent  = activeStep || allDone

  if (!hasContent) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5.5" stroke="#D1D5DB" strokeWidth="1.5" />
              <path d="M8 5v3l2 1.5" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-xs text-gray-300 max-w-[160px] leading-relaxed mx-auto">
            Output appears here as the pipeline runs
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading ? (
          <Skeleton />
        ) : allDone ? (
          <div className="fade-slide-in h-full">
            <PlayableViewer html={playableHtml!} />
          </div>
        ) : activeStep ? (
          <div className="fade-slide-in space-y-5">
            {reviewContent[activeStep.id]}
            {activeStep.id === 'codegen' && playableHtml && (
              <PlayableViewer html={playableHtml} />
            )}
          </div>
        ) : null}
      </div>

      {/* Review controls */}
      {isAwaiting && activeStep && (
        <div className="shrink-0 border-t border-gray-100 pt-4 fade-slide-in">
          <ReviewControls onAccept={onAccept} onRetry={onRetry} onCorrect={onCorrect} />
        </div>
      )}
    </div>
  )
}
