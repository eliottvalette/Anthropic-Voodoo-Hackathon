'use client'

import { useState, useCallback } from 'react'
import DropZone from '@/components/DropZone'
import PipelineStepper, { Step, StepStatus } from '@/components/PipelineStepper'
import PlayableViewer from '@/components/PlayableViewer'

const INITIAL_STEPS: Step[] = [
  { id: 'metadata', label: 'Metadata + Asset Inventory', estimate: '~0s', status: 'idle' },
  { id: 'upload',   label: 'Upload to Gemini',           estimate: '~16s', status: 'idle' },
  { id: 'analysis', label: 'Video Analysis',             estimate: '~24s', status: 'idle' },
  { id: 'codegen',  label: 'Feature Spec + HTML',        estimate: '~23s', status: 'idle' },
]

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function VideoIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
      <rect x="3" y="8" width="22" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M25 13l6-4v16l-6-4V13z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M11 13.5l6 3.5-6 3.5V13.5z" fill="currentColor" />
    </svg>
  )
}

function AssetsIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
      <rect x="3" y="11" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="7" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="15" y="13" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

// Chips row for the analysis output
function Tags({ items }: { items: string[] }) {
  return (
    <div className="flex gap-1.5 flex-wrap mt-2">
      {items.map(item => (
        <span key={item} className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-[#0F141C] font-medium text-[11px]">
          {item}
        </span>
      ))}
    </div>
  )
}

export default function Home() {
  const [videoFiles, setVideoFiles]   = useState<File[]>([])
  const [assetFiles, setAssetFiles]   = useState<File[]>([])
  const [steps, setSteps]             = useState<Step[]>(INITIAL_STEPS)
  const [isRunning, setIsRunning]     = useState(false)
  const [hasRun, setHasRun]           = useState(false)
  const [playableHtml, setPlayableHtml] = useState<string | null>(null)

  const updateStep = useCallback((id: string, updates: Partial<Step>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
  }, [])

  const activateStep = useCallback((id: string) => {
    updateStep(id, { status: 'active' as StepStatus, startedAt: Date.now() })
  }, [updateStep])

  const completeStep = useCallback((id: string, output: React.ReactNode) => {
    updateStep(id, { status: 'done' as StepStatus, doneAt: Date.now(), output })
  }, [updateStep])

  const handleRun = useCallback(async () => {
    if (!videoFiles.length || !assetFiles.length || isRunning) return

    setIsRunning(true)
    setHasRun(true)
    setPlayableHtml(null)
    setSteps(INITIAL_STEPS)

    const videoFile = videoFiles[0]

    // ── Step 1: Metadata (browser APIs, near-instant) ──────────────────────
    activateStep('metadata')
    const videoEl = document.createElement('video')
    videoEl.preload = 'metadata'
    const objectUrl = URL.createObjectURL(videoFile)
    videoEl.src = objectUrl
    await new Promise<void>(r => {
      videoEl.onloadedmetadata = () => r()
      videoEl.onerror = () => r()
    })
    URL.revokeObjectURL(objectUrl)

    const duration   = videoEl.duration ? `${Math.round(videoEl.duration)}s` : '?'
    const resolution = videoEl.videoWidth ? `${videoEl.videoWidth}×${videoEl.videoHeight}` : '?'
    const totalSizeMB = [...videoFiles, ...assetFiles]
      .reduce((acc, f) => acc + f.size, 0) / 1024 / 1024

    completeStep('metadata', (
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span><span className="text-[#0F141C] font-semibold">{videoFile.name}</span></span>
        <span>{duration} · {resolution}</span>
        <span><span className="text-[#0F141C] font-semibold">{assetFiles.length}</span> assets · {totalSizeMB.toFixed(0)}MB total</span>
      </div>
    ))

    // ── Step 2: Upload to Gemini (~16s real, 2s mock) ──────────────────────
    activateStep('upload')
    await delay(2000)
    completeStep('upload', (
      <span>Video uploaded · File state <span className="text-[#0F141C] font-semibold">ACTIVE</span></span>
    ))

    // ── Step 3: Video Analysis (~24s real, 2.5s mock) ──────────────────────
    activateStep('analysis')
    await delay(2500)
    completeStep('analysis', (
      <div>
        <div>
          <span className="text-[#0F141C] font-semibold">Castle Clashers</span>
          <span className="ml-2 text-gray-400">Arcade · Portrait</span>
        </div>
        <div className="mt-1 text-gray-500">Aim and fire projectiles to destroy the enemy castle before the timer runs out</div>
        <Tags items={['Ballistic arc', 'Drag to aim', 'Health system', 'Auto-fire enemy', 'Particle FX']} />
      </div>
    ))

    // ── Step 4: Feature Spec + HTML (~23s real, 2s mock) ──────────────────
    activateStep('codegen')
    await delay(2000)

    const mockHtml = await fetch('/mock-playable.html').then(r => r.text())

    completeStep('codegen', (
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span><span className="text-[#0F141C] font-semibold">Castle_Clashers_Playable</span> · 360×640</span>
        <span>player_damage <span className="text-[#0F141C] font-semibold">34</span></span>
        <span>gravity <span className="text-[#0F141C] font-semibold">900</span></span>
        <span>session <span className="text-[#0F141C] font-semibold">30s</span></span>
      </div>
    ))

    setPlayableHtml(mockHtml)
    setIsRunning(false)
  }, [videoFiles, assetFiles, isRunning, activateStep, completeStep])

  const canRun = videoFiles.length > 0 && assetFiles.length > 0 && !isRunning

  return (
    <main className="min-h-screen bg-[#F6F9FC] px-4 py-12 pb-24">
      <div className="max-w-xl mx-auto space-y-6">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md bg-[#0055FF] flex items-center justify-center">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M2 10L6.5 3L11 10H2z" fill="white" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Playable Generator</span>
          </div>
          <h1 className="text-2xl font-bold text-[#0F141C] leading-tight">
            Gameplay → HTML Ad
          </h1>
          <p className="text-sm text-gray-400 mt-1.5">
            Drop a video and game assets — the pipeline analyses, specs, and ships a playable.
          </p>
        </div>

        {/* Upload panel */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <DropZone
              label="Gameplay Video"
              sublabel=".mp4 · drop or browse"
              accept=".mp4,.mov,.webm"
              onFiles={setVideoFiles}
              files={videoFiles}
              icon={<VideoIcon />}
            />
            <DropZone
              label="Game Assets"
              sublabel="Drop a folder or files"
              accept=".png,.jpg,.jpeg,.ogg,.wav,.mp3"
              folder
              onFiles={setAssetFiles}
              files={assetFiles}
              icon={<AssetsIcon />}
            />
          </div>

          <button
            onClick={handleRun}
            disabled={!canRun}
            className={`
              w-full py-3 rounded-xl text-sm font-semibold tracking-wide transition-all duration-150
              ${canRun
                ? 'bg-[#0055FF] text-white hover:bg-[#0044DD] active:scale-[0.985] shadow-[0_4px_20px_rgba(0,85,255,0.25)]'
                : 'bg-gray-100 text-gray-300 cursor-not-allowed'
              }
            `}
          >
            {isRunning ? 'Generating…' : 'Generate Playable'}
          </button>
        </div>

        {/* Pipeline stepper — appears on first run */}
        {hasRun && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 fade-slide-in">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-6">Pipeline</p>
            <PipelineStepper steps={steps} />
          </div>
        )}

        {/* Playable output */}
        {playableHtml && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 fade-slide-in">
            <PlayableViewer html={playableHtml} />
          </div>
        )}

      </div>
    </main>
  )
}
