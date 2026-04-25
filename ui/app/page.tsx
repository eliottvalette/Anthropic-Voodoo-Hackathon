'use client'

import { useState, useCallback } from 'react'
import DropZone from '@/components/DropZone'
import PipelineStepper, { Step, StepStatus } from '@/components/PipelineStepper'
import PlayableViewer from '@/components/PlayableViewer'

const INITIAL_STEPS: Step[] = [
  { id: 'metadata', label: 'Metadata + Asset Inventory', estimate: '~0s',  status: 'idle' },
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

function SidebarItem({ icon, active = false }: { icon: React.ReactNode; active?: boolean }) {
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150 ${
      active ? 'bg-[#0055FF] text-white' : 'text-gray-300 hover:text-[#0F141C] hover:bg-gray-50'
    }`}>
      {icon}
    </div>
  )
}

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
  const [videoFiles, setVideoFiles]     = useState<File[]>([])
  const [assetFiles, setAssetFiles]     = useState<File[]>([])
  const [steps, setSteps]               = useState<Step[]>(INITIAL_STEPS)
  const [isRunning, setIsRunning]       = useState(false)
  const [hasRun, setHasRun]             = useState(false)
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

    const duration    = videoEl.duration   ? `${Math.round(videoEl.duration)}s`               : '?'
    const resolution  = videoEl.videoWidth ? `${videoEl.videoWidth}×${videoEl.videoHeight}` : '?'
    const totalSizeMB = [...videoFiles, ...assetFiles].reduce((acc, f) => acc + f.size, 0) / 1024 / 1024

    completeStep('metadata', (
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span><span className="text-[#0F141C] font-semibold">{videoFile.name}</span></span>
        <span>{duration} · {resolution}</span>
        <span><span className="text-[#0F141C] font-semibold">{assetFiles.length}</span> assets · {totalSizeMB.toFixed(0)} MB total</span>
      </div>
    ))

    activateStep('upload')
    await delay(2000)
    completeStep('upload', (
      <span>Video uploaded · File state <span className="text-[#0F141C] font-semibold">ACTIVE</span></span>
    ))

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
  const today  = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const uploadCard = (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Input</p>
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
        className={`mt-4 w-full py-3 rounded-xl text-sm font-semibold tracking-wide transition-all duration-150 ${
          canRun
            ? 'bg-[#0055FF] text-white hover:bg-[#0044DD] active:scale-[0.985] shadow-[0_4px_20px_rgba(0,85,255,0.25)]'
            : 'bg-gray-100 text-gray-300 cursor-not-allowed'
        }`}
      >
        {isRunning ? 'Generating…' : 'Generate Playable'}
      </button>
    </div>
  )

  const pipelineCard = hasRun ? (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 fade-slide-in">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-5">Pipeline</p>
      <PipelineStepper steps={steps} />
    </div>
  ) : null

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F6F9FC' }}>

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="w-[60px] bg-white border-r border-gray-100 flex flex-col items-center py-5 shrink-0 z-10">
        <div className="w-8 h-8 rounded-lg bg-[#0F141C] flex items-center justify-center mb-6">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 11.5L7 2L12 11.5H2z" fill="white" />
          </svg>
        </div>

        <div className="flex flex-col gap-2 items-center">
          <SidebarItem active icon={
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 2v7M4.5 6l3-3 3 3M2 12.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          } />
          <SidebarItem icon={
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <circle cx="7.5" cy="7.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7.5 5v2.5l1.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          } />
        </div>

        <div className="mt-auto flex flex-col items-center gap-2">
          <SidebarItem icon={
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M7.5 1.5v1.5M7.5 12v1.5M1.5 7.5H3M12 7.5h1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          } />
        </div>
      </aside>

      {/* ── Main column ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="h-[52px] bg-white border-b border-gray-100 flex items-center px-6 gap-2 shrink-0">
          <span className="text-xs text-gray-400 font-medium">Voodoo</span>
          <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
            <path d="M1 1l4 4-4 4" stroke="#D1D5DB" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-xs font-semibold text-[#0F141C]">Playable Generator</span>

          <div className="ml-auto flex items-center gap-5">
            {isRunning && (
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#0055FF] pulse-dot" />
                <span className="text-xs text-[#0055FF] font-medium">Pipeline running</span>
              </div>
            )}
            {playableHtml && !isRunning && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-xs text-gray-500 font-medium">Ready</span>
              </div>
            )}
            <span className="text-xs text-gray-300">{today}</span>
          </div>
        </header>

        {/* Dot-grid content */}
        <main className="flex-1 overflow-auto p-6 dot-grid">
          {playableHtml ? (
            <div
              className="grid gap-5 items-start mx-auto"
              style={{ gridTemplateColumns: 'minmax(0,1fr) 416px', maxWidth: 1100 }}
            >
              <div className="space-y-5">
                {uploadCard}
                {pipelineCard}
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 fade-slide-in sticky top-0">
                <PlayableViewer html={playableHtml} />
              </div>
            </div>
          ) : (
            <div className="max-w-xl mx-auto space-y-5">
              {uploadCard}
              {pipelineCard}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
