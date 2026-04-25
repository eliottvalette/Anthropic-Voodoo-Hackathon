'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import DropZone from '@/components/DropZone'
import PipelineStepper, { Step, StepStatus } from '@/components/PipelineStepper'
import ReviewPanel from '@/components/ReviewPanel'
import PlayableViewer from '@/components/PlayableViewer'
import HistoryView from '@/components/HistoryView'
import { createClient } from '@/utils/supabase/client'

type View = 'generator' | 'history'

const INITIAL_STEPS: Step[] = [
  { id: 'metadata', label: 'Metadata + Asset Inventory', estimate: '~0s',  status: 'idle' },
  { id: 'upload',   label: 'Upload to Gemini',           estimate: '~16s', status: 'idle' },
  { id: 'analysis', label: 'Video Analysis',             estimate: '~24s', status: 'idle' },
  { id: 'codegen',  label: 'Feature Spec + HTML',        estimate: '~23s', status: 'idle' },
]

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

type ReviewDecision = { action: 'accept' } | { action: 'retry' } | { action: 'correct'; text: string }

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

function SidebarItem({ icon, active = false, onClick }: { icon: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150 ${
        active
          ? 'bg-[#0055FF] text-white'
          : 'dot-grid border border-gray-100 bg-[#F6F9FC] text-gray-300 hover:text-[#0F141C] hover:border-gray-200'
      }`}
    >
      {icon}
    </div>
  )
}

export default function Home() {
  const [videoFiles, setVideoFiles]       = useState<File[]>([])
  const [assetFiles, setAssetFiles]       = useState<File[]>([])
  const [steps, setSteps]                 = useState<Step[]>(INITIAL_STEPS)
  const [isRunning, setIsRunning]         = useState(false)
  const [hasRun, setHasRun]               = useState(false)
  const [playableHtml, setPlayableHtml]   = useState<string | null>(null)
  const [autoMode, setAutoMode]           = useState(false)
  const [isAwaiting, setIsAwaiting]       = useState(false)
  const [reviewContent, setReviewContent] = useState<Record<string, React.ReactNode>>({})
  const [fullscreen, setFullscreen]       = useState(false)
  const [view, setView]                   = useState<View>('generator')
  const [userEmail, setUserEmail]         = useState<string | null>(null)

  const autoModeRef       = useRef(false)
  const reviewResolverRef = useRef<((d: ReviewDecision) => void) | null>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null)
    })
  }, [])

  const handleLogout = async () => {
    await createClient().auth.signOut()
    window.location.href = '/login'
  }

  const handleAutoToggle = () => {
    const next = !autoMode
    setAutoMode(next)
    autoModeRef.current = next
  }

  const updateStep = useCallback((id: string, updates: Partial<Step>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
  }, [])

  const activateStep = useCallback((id: string) => {
    updateStep(id, { status: 'active' as StepStatus, startedAt: Date.now(), output: undefined })
  }, [updateStep])

  const completeStep = useCallback((id: string, output: React.ReactNode) => {
    updateStep(id, { status: 'done' as StepStatus, doneAt: Date.now(), output })
  }, [updateStep])

  const awaitStep = useCallback((id: string, output: React.ReactNode) => {
    updateStep(id, { status: 'awaiting' as StepStatus, doneAt: Date.now(), output })
  }, [updateStep])

  const acceptStep = useCallback((id: string) => {
    updateStep(id, { status: 'done' as StepStatus })
  }, [updateStep])

  const waitForReview = useCallback((): Promise<ReviewDecision> => {
    if (autoModeRef.current) return Promise.resolve({ action: 'accept' as const })
    setIsAwaiting(true)
    return new Promise(resolve => { reviewResolverRef.current = resolve })
  }, [])

  const handleAccept = useCallback(() => {
    setIsAwaiting(false)
    reviewResolverRef.current?.({ action: 'accept' })
    reviewResolverRef.current = null
  }, [])

  const handleRetry = useCallback(() => {
    setIsAwaiting(false)
    reviewResolverRef.current?.({ action: 'retry' })
    reviewResolverRef.current = null
  }, [])

  const handleCorrect = useCallback((text: string) => {
    setIsAwaiting(false)
    reviewResolverRef.current?.({ action: 'correct', text })
    reviewResolverRef.current = null
  }, [])

  const handleRun = useCallback(async () => {
    if (!videoFiles.length || !assetFiles.length || isRunning) return

    setIsRunning(true)
    setHasRun(true)
    setPlayableHtml(null)
    setSteps(INITIAL_STEPS)
    setReviewContent({})
    setIsAwaiting(false)
    reviewResolverRef.current = null

    const videoFile = videoFiles[0]

    // ── Step 1: Metadata ─────────────────────────────────────────────
    let decision: ReviewDecision
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
        <span><span className="font-semibold text-[#0F141C]">{videoFile.name}</span></span>
        <span>{duration} · {resolution}</span>
        <span><span className="font-semibold text-[#0F141C]">{assetFiles.length}</span> assets · {totalSizeMB.toFixed(0)} MB total</span>
      </div>
    ))

    // ── Step 2: Upload ───────────────────────────────────────────────
    activateStep('upload')
    await delay(2000)
    completeStep('upload', (
      <span>Video uploaded · File state <span className="font-semibold text-[#0F141C]">ACTIVE</span></span>
    ))

    // ── Step 3: Analysis ─────────────────────────────────────────────
    do {
      activateStep('analysis')
      await delay(2500)

      awaitStep('analysis', (
        <div>
          <div>
            <span className="font-semibold text-[#0F141C]">Castle Clashers</span>
            <span className="ml-2 text-gray-400">Arcade · Portrait</span>
          </div>
          <div className="mt-1 text-gray-500">Aim and fire projectiles to destroy the enemy castle</div>
          <Tags items={['Ballistic arc', 'Drag to aim', 'Health system', 'Auto-fire enemy', 'Particle FX']} />
        </div>
      ))
      setReviewContent(prev => ({
        ...prev,
        analysis: (
          <div className="space-y-5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Video analysis</p>
            <div>
              <div className="text-2xl font-bold text-[#0F141C]">Castle Clashers</div>
              <div className="text-sm text-gray-400 mt-0.5">Arcade · Portrait · 30s session</div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Aim and fire projectiles to destroy the enemy castle before the timer runs out.
            </p>
            <div className="space-y-2">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Detected mechanics</div>
              <div className="flex flex-wrap gap-1.5">
                {['Ballistic arc', 'Drag to aim', 'Health system', 'Auto-fire enemy', 'Particle FX'].map(tag => (
                  <span key={tag} className="px-3 py-1 rounded-full bg-[#0F141C] text-white text-[11px] font-medium">{tag}</span>
                ))}
              </div>
            </div>
          </div>
        ),
      }))

      decision = await waitForReview()
      if (decision.action === 'correct') {
        const correction = decision.text
        setReviewContent(prev => ({
          ...prev,
          analysis: (
            <div className="space-y-5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Video analysis</p>
              <div>
                <div className="text-2xl font-bold text-[#0F141C]">Castle Clashers</div>
                <div className="text-sm text-gray-400 mt-0.5">Arcade · Portrait · corrected</div>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{correction}</p>
            </div>
          ),
        }))
      }
    } while (decision.action === 'retry')
    acceptStep('analysis')

    // ── Step 4: Codegen ──────────────────────────────────────────────
    activateStep('codegen')
    await delay(2000)
    const mockHtml = await fetch('/mock-playable.html').then(r => r.text())
    setPlayableHtml(mockHtml)
    completeStep('codegen', (
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span><span className="font-semibold text-[#0F141C]">Castle_Clashers_Playable</span> · 360×640</span>
        <span>player_damage <span className="font-semibold text-[#0F141C]">34</span></span>
        <span>gravity <span className="font-semibold text-[#0F141C]">900</span></span>
        <span>session <span className="font-semibold text-[#0F141C]">30s</span></span>
      </div>
    ))

    setIsRunning(false)
  }, [videoFiles, assetFiles, isRunning, activateStep, completeStep, awaitStep, acceptStep, waitForReview])

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

  const rightPanelTitle = playableHtml && steps.every(s => s.status === 'done')
    ? 'Result'
    : isAwaiting
      ? 'Review'
      : 'Output'

  return (
    <div className="flex h-[100dvh] overflow-hidden" style={{ background: '#F6F9FC' }}>

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="hidden md:flex w-[60px] bg-white border-r border-gray-100 flex-col items-center py-5 shrink-0 z-10">
        <div className="w-8 h-8 rounded-lg bg-[#0F141C] flex items-center justify-center mb-6">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 11.5L7 2L12 11.5H2z" fill="white" />
          </svg>
        </div>

        <div className="flex flex-col gap-2">
          {/* Generator */}
          <SidebarItem
            active={view === 'generator'}
            onClick={() => setView('generator')}
            icon={
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M7.5 2v7M4.5 6l3-3 3 3M2 12.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          />
          {/* History */}
          <SidebarItem
            active={view === 'history'}
            onClick={() => setView('history')}
            icon={
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <circle cx="7.5" cy="7.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M7.5 5v2.5l1.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          />
        </div>

        {/* User avatar + logout */}
        <div className="mt-auto flex flex-col items-center gap-2">
          {userEmail && (
            <button
              onClick={handleLogout}
              title="Sign out"
              className="w-9 h-9 rounded-xl bg-[#F6F9FC] border border-gray-100 flex items-center justify-center text-xs font-bold text-[#0F141C] hover:bg-gray-100 hover:border-gray-200 transition-all"
            >
              {userEmail[0].toUpperCase()}
            </button>
          )}
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">

        {/* Header */}
        <header className="h-[52px] bg-white border-b border-gray-100 flex items-center px-4 sm:px-6 gap-2 shrink-0">
          <span className="text-xs text-gray-400 font-medium">Voodoo</span>
          <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
            <path d="M1 1l4 4-4 4" stroke="#D1D5DB" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-xs font-semibold text-[#0F141C]">
            {view === 'history' ? 'History' : 'Playable Generator'}
          </span>

          <div className="ml-auto flex items-center gap-3">
            {/* Auto toggle */}
            <button
              onClick={handleAutoToggle}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                autoMode
                  ? 'bg-[#0055FF] text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M5.5 1v2M5.5 8v2M1 5.5h2M8 5.5h2M2.6 2.6l1.4 1.4M7 7l1.4 1.4M2.6 8.4l1.4-1.4M7 4l1.4-1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              Auto
            </button>

            {isRunning && (
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#0055FF] pulse-dot" />
                <span className="text-xs text-[#0055FF] font-medium hidden sm:block">Pipeline running</span>
              </div>
            )}
            {isAwaiting && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="text-xs text-amber-600 font-medium hidden sm:block">Awaiting review</span>
              </div>
            )}
            {steps.every(s => s.status === 'done') && !isRunning && hasRun && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-xs text-gray-500 font-medium hidden sm:block">Ready</span>
              </div>
            )}
            <span className="text-xs text-gray-300 hidden sm:block">{today}</span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-hidden p-3 sm:p-5 dot-grid">

          {view === 'history' ? (
            <HistoryView />
          ) : (
            <>
              {/* ── Pre-run: centered upload ── */}
              {!hasRun && (
                <div className="h-full flex items-center justify-center">
                  <div className="w-full max-w-xl">{uploadCard}</div>
                </div>
              )}

              {/* ── Focus mode: phone centered, no split ── */}
              {hasRun && fullscreen && playableHtml && (
                <div className="h-full">
                  <PlayableViewer
                    html={playableHtml}
                    isFullscreen
                    onToggleFullscreen={() => setFullscreen(false)}
                  />
                </div>
              )}

              {/* ── Split layout ── */}
              {hasRun && !fullscreen && (
                <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4">

                  {/* Left — scrollable */}
                  <div className="lg:overflow-auto space-y-4 pb-4 lg:pb-0">
                    {uploadCard}
                    {pipelineCard}
                  </div>

                  {/* Right — fixed height */}
                  <div className="flex min-h-0 flex-col overflow-hidden min-h-[420px] lg:min-h-0">
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col flex-1 min-h-0 overflow-hidden">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-4 shrink-0">
                        {steps.every(s => s.status === 'done') && playableHtml ? 'Result' : isAwaiting ? 'Review' : 'Output'}
                      </p>
                      <div className="flex-1 min-h-0 overflow-hidden">
                        <ReviewPanel
                          steps={steps}
                          reviewContent={reviewContent}
                          playableHtml={playableHtml}
                          isAwaiting={isAwaiting}
                          onAccept={handleAccept}
                          onRetry={handleRetry}
                          onCorrect={handleCorrect}
                          onToggleFullscreen={playableHtml ? () => setFullscreen(true) : undefined}
                        />
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </>
          )}

        </main>
      </div>
    </div>
  )
}
