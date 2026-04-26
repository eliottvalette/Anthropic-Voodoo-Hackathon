'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import DropZone from '@/components/DropZone'
import PipelineStepper, { Step, StepStatus } from '@/components/PipelineStepper'
import ReviewPanel from '@/components/ReviewPanel'
import PlayableViewer from '@/components/PlayableViewer'
import PolishPanel from '@/components/PolishPanel'
import HistoryView from '@/components/HistoryView'
import UtilsView from '@/components/UtilsView'
import MockToggle from '@/components/MockToggle'
import GameSpecCard, { GameSpecLite } from '@/components/GameSpecCard'
import VerifyReportCard, { VerifyReportLite } from '@/components/VerifyReportCard'
import MultiPassStepper, { SubCall } from '@/components/MultiPassStepper'
import RoleTable from '@/components/RoleTable'
import MicCapture from '@/components/MicCapture'
import AssetReviewPanel from '@/components/AssetReviewPanel'
import BlockBlastFakePanel, { type BlockBlastFixtureManifest } from '@/components/BlockBlastFakePanel'
import { createClient } from '@/utils/supabase/client'
import { runPipeline } from '@/lib/pipeline/orchestrator'
import { runP1Video } from '@/lib/pipeline/p1-video'
import { runP1VideoClaude } from '@/lib/pipeline/p1-video-claude'
import { saveRun } from '@/lib/runs/store'
import type { ProbeReport, VideoAnalysis, AssetMapping, GameSpec, CodegenResult, RunMeta, StageId, GeneratedAssetMetadata } from '@/lib/pipeline/types'
import type { ImportedAssetFile } from '@/utils/assetCoverage'
import { fetchGeneratedAssetFiles, mergeAssetFiles } from '@/utils/sandboxAssets'
import type { SandboxManifest } from '@/utils/sandboxTypes'

type View = 'generator' | 'history' | 'library'

// 6 stages: our asset-generation node first (chunked upload + Gemini coverage +
// optional Scenario regen, gated on user accept), then the coworker's pipeline.
const INITIAL_STEPS: Step[] = [
  { id: 'assetsGen', label: 'Asset Generation (video → assets)', estimate: '~30-90s', status: 'idle' },
  { id: 'probe',    label: 'Probe (video + assets)',          estimate: '~1s',     status: 'idle' },
  { id: 'video',    label: 'Video Analysis (multi-pass)',     estimate: '~30-60s', status: 'idle' },
  { id: 'assets',   label: 'Asset Roles',                     estimate: '~10-20s', status: 'idle' },
  { id: 'gameSpec', label: 'Game Spec (aggregator)',          estimate: '~5-15s',  status: 'idle' },
  { id: 'codegen',  label: 'Codegen + Verify',                estimate: '~25-50s', status: 'idle' },
]

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const ANALYSIS_POLL_MS = 2500
const ANALYSIS_TIMEOUT_MS = 10 * 60 * 1000

const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024 // 4 MB — well under Next.js dev's ~10 MB Route-Handler stream cap.

async function uploadVideoForAnalysis(
  file: File,
  onProgress?: (bytes: number, total: number) => void,
): Promise<string> {
  const startResp = await fetch('/api/sandbox/runs/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name }),
  })
  if (!startResp.ok) throw new Error(await startResp.text())
  const { run_id: runId } = await startResp.json() as { run_id: string }
  if (!runId) throw new Error('start did not return a run_id')

  let offset = 0
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + UPLOAD_CHUNK_BYTES)
    const chunkResp = await fetch(
      `/api/sandbox/runs/chunk?run_id=${encodeURIComponent(runId)}&offset=${offset}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: chunk,
      },
    )
    if (!chunkResp.ok) throw new Error(await chunkResp.text())
    offset += chunk.size
    onProgress?.(offset, file.size)
  }

  const finalResp = await fetch('/api/sandbox/runs/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run_id: runId }),
  })
  if (!finalResp.ok) throw new Error(await finalResp.text())
  return runId
}

async function waitForAnalysisManifest(runId: string): Promise<SandboxManifest> {
  const deadline = Date.now() + ANALYSIS_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const manifest = await fetchSandboxManifest(runId)
      if (manifest.assets.length > 0) return manifest
    } catch {
      // retry
    }
    await delay(ANALYSIS_POLL_MS)
  }
  throw new Error('Timed out waiting for video analysis')
}

type ReviewDecision = { action: 'accept' } | { action: 'retry' } | { action: 'correct'; text: string }
type FileWithRelativePath = File & { webkitRelativePath?: string }

function toImportedAssetFiles(files: File[]): ImportedAssetFile[] {
  return files.map(file => {
    const withPath = file as FileWithRelativePath
    return {
      name: file.name,
      relativePath: withPath.webkitRelativePath || file.name,
      size: file.size,
    }
  })
}

async function fetchSandboxManifest(runId: string): Promise<SandboxManifest> {
  const response = await fetch(`/api/sandbox/manifest?run=${encodeURIComponent(runId)}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

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

function assetKind(name: string): { label: string; tag: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    return { label: 'IMG', tag: 'bg-indigo-50 text-indigo-700 border-indigo-100' }
  }
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
    return { label: 'SFX', tag: 'bg-violet-50 text-violet-700 border-violet-100' }
  }
  if (['mp4', 'mov', 'webm'].includes(ext)) {
    return { label: 'VID', tag: 'bg-emerald-50 text-emerald-700 border-emerald-100' }
  }
  return { label: ext.toUpperCase() || 'FILE', tag: 'bg-gray-50 text-gray-500 border-gray-100' }
}

function VideoAnalysisView({
  merged, alternate, tags,
}: {
  merged: { summary_one_sentence?: string; defining_hook?: string; genre?: string }
  alternate?: { fits_evidence_better: boolean; alternate_genre: string; rationale: string }
  tags: string[]
}) {
  const [showJson, setShowJson] = useState(false)
  const jsonRef = useRef<HTMLPreElement | null>(null)

  const toggleJson = () => {
    const next = !showJson
    setShowJson(next)
    if (next) {
      requestAnimationFrame(() => {
        jsonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    }
  }

  return (
    <div className="space-y-5 min-w-0">
      <header className="space-y-1 min-w-0">
        <h2 className="text-2xl font-bold text-[#0F141C] leading-tight">Video analysis</h2>
        <p className="text-sm text-gray-500">Merged summary across all passes</p>
      </header>

      {merged?.defining_hook && (
        <div className="rounded-xl bg-[#F6F9FC] border border-gray-100 p-3.5 min-w-0">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Defining hook</div>
          <p className="text-sm text-[#0F141C] leading-relaxed min-w-0 break-words">{merged.defining_hook}</p>
        </div>
      )}

      {merged?.summary_one_sentence && (
        <div className="rounded-xl bg-[#F6F9FC] border border-gray-100 p-3.5 min-w-0">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Summary</div>
          <p className="text-sm text-[#0F141C] leading-relaxed min-w-0 break-words">{merged.summary_one_sentence}</p>
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(t => (
            <span key={t} className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-[11px] font-medium text-indigo-700">
              {t}
            </span>
          ))}
        </div>
      )}

      {alternate?.fits_evidence_better && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 min-w-0">
          <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-widest mb-1">Alternate genre proposal</div>
          <p className="text-sm text-amber-900 leading-relaxed min-w-0 break-words">
            <span className="font-mono font-semibold">{alternate.alternate_genre}</span> — {alternate.rationale}
          </p>
        </div>
      )}

      <div className="pt-1">
        <button
          onClick={toggleJson}
          className="text-[11px] font-semibold text-[#0055FF] hover:underline inline-flex items-center gap-1"
        >
          {showJson ? 'Hide raw JSON' : 'Show raw JSON'}
          <span className={`transition-transform ${showJson ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {showJson && (
          <pre
            ref={jsonRef}
            className="mt-2 text-[10.5px] leading-snug font-mono bg-[#0e1320] text-[#e6e9f0] rounded-xl p-3 max-h-72 overflow-auto whitespace-pre-wrap break-all"
          >
            <code>{JSON.stringify(merged, null, 2)}</code>
          </pre>
        )}
      </div>
    </div>
  )
}

const SAMPLE_GAME_SPEC: GameSpec = {
  source_video: 'sample.mp4',
  game_identity: { observed_title: 'Castle Clashers', genre: 'arcade', visual_style: 'cartoon 2D, top-down portrait' },
  render_mode: '2d',
  mechanic_name: 'artillery_drag_shoot',
  template_id: 'artillery_drag_shoot',
  core_loop_one_sentence: 'Drag back to aim, release to fire a ballistic projectile, destroy the enemy castle before it destroys yours.',
  defining_hook: 'Pull-back-and-release artillery vs. an auto-firing enemy castle, decided in under 30s.',
  not_this_game: ['merge', 'idle clicker', 'puzzle'],
  first_5s_script: 'Camera shows both castles, a hand drag-cue points at the player\'s slot, an enemy projectile arcs in.',
  tutorial_loss_at_seconds: 18,
  asset_role_map: {
    background: 'Background.png',
    castle_player: 'Blue Castle.png',
    castle_enemy: 'Red Castle.png',
    projectile_player: 'proj_fireball.png',
    hero_a: 'char_cyclops_red.png',
    hero_b: 'char_ninja.png',
  },
  params: { gravity: 0.00078, hp: 3, session_seconds: 30 },
  creative_slot_prompt: 'Polish the FX layer (smoke, debris, screen shake) per the gold reference.',
}

const SAMPLE_PASS_VERIFY: VerifyReportLite = {
  runs: true,
  sizeOk: true,
  consoleErrors: [],
  canvasNonBlank: true,
  mraidOk: true,
  mechanicStringMatch: true,
  interactionStateChange: true,
  htmlBytes: 3_062_000,
  retries: 0,
  monolithicFallbackUsed: false,
  subsystemFailCounts: { input: 0, physics: 0, render: 0, state: 0, winloss: 0 },
}

export default function Home() {
  const [videoFiles, setVideoFiles]       = useState<File[]>([])
  const [assetFiles, setAssetFiles]       = useState<File[]>([])
  const [steps, setSteps]                 = useState<Step[]>(INITIAL_STEPS)
  const [isRunning, setIsRunning]         = useState(false)
  const [hasRun, setHasRun]               = useState(false)
  const [playableHtml, setPlayableHtml]   = useState<string | null>(null)
  const [autoMode, setAutoMode]           = useState(false)
  const [runId, setRunId]                 = useState<string | null>(null)
  const [mockMode, setMockMode]           = useState(true)
  const [isAwaiting, setIsAwaiting]       = useState(false)
  const [reviewContent, setReviewContent] = useState<Record<string, React.ReactNode>>({})
  const [fullscreen, setFullscreen]       = useState(false)
  const [polishMode, setPolishMode]       = useState(false)
  const [view, setView]                   = useState<View>('generator')
  const [userEmail, setUserEmail]         = useState<string | null>(null)
  const [subCallsByStage, setSubCallsByStage] = useState<Record<StageId, SubCall[]>>({
    probe: [], video: [], assets: [], gameSpec: [], codegen: [],
  })
  const [errorMsg, setErrorMsg]           = useState<string | null>(null)
  const [userBrief, setUserBrief]         = useState<string>('')

  const autoModeRef       = useRef(false)
  const mockModeRef       = useRef(true)
  const reviewResolverRef = useRef<((d: ReviewDecision) => void) | null>(null)

  // Restore preferences
  useEffect(() => {
    if (typeof window === 'undefined') return
    const m = window.localStorage.getItem('voodoo:mockMode')
    if (m !== null) {
      const v = m === 'true'
      setMockMode(v); mockModeRef.current = v
    }
    const a = window.localStorage.getItem('voodoo:autoMode')
    if (a !== null) {
      const v = a === 'true'
      setAutoMode(v); autoModeRef.current = v
    }
  }, [])

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
    setAutoMode(next); autoModeRef.current = next
    try { window.localStorage.setItem('voodoo:autoMode', String(next)) } catch {}
  }

  const handleMockToggle = () => {
    const next = !mockMode
    setMockMode(next); mockModeRef.current = next
    try { window.localStorage.setItem('voodoo:mockMode', String(next)) } catch {}
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

  const errorStep = useCallback((id: string) => {
    updateStep(id, { status: 'error' as StepStatus, doneAt: Date.now() })
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

  // ── Review content rendering per stage ──────────────────────────────────────
  const renderProbe = (p: ProbeReport): React.ReactNode => (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-2xl font-bold text-[#0F141C] leading-tight">{p.video.name}</h2>
        <p className="text-sm text-gray-500">
          {Math.round(p.video.durationSec)}s
          <span className="text-gray-300 mx-1.5">·</span>
          {p.video.width}×{p.video.height}
          <span className="text-gray-300 mx-1.5">·</span>
          {(p.video.sizeBytes / 1024 / 1024).toFixed(1)} MB
        </p>
      </header>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-[#0F141C]">Assets ({p.assets.length})</h3>
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          {p.assets.map((a, i) => {
            const t = assetKind(a.name)
            return (
              <div key={a.name} className={`flex items-center gap-3 px-3 py-2 text-xs ${i % 2 ? 'bg-[#FBFCFE]' : 'bg-white'}`}>
                <span className={`px-1.5 py-0.5 rounded-md text-[9.5px] font-semibold uppercase border shrink-0 ${t.tag}`}>
                  {t.label}
                </span>
                <span className="font-mono text-[#0F141C] truncate flex-1" title={a.name}>{a.name}</span>
                <span className="text-gray-400 tabular-nums shrink-0">{(a.sizeBytes / 1024).toFixed(0)} KB</span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )

  const renderVideoAnalysis = (v: VideoAnalysis): React.ReactNode => {
    const merged = v.merged as {
      summary_one_sentence?: string
      defining_hook?: string
      mechanics?: unknown[]
      tags?: string[]
      genre?: string
    }
    const tags = (merged?.tags ?? []).slice(0, 6)
    return <VideoAnalysisView merged={merged} alternate={v.alternate} tags={tags} />
  }

  const renderAssetMapping = (m: AssetMapping): React.ReactNode => {
    const total = m.roles.length
    const matched = m.roles.filter(r => r.filename).length
    const allMatched = matched === total
    return (
      <div className="space-y-5">
        <header className="space-y-1">
          <h2 className="text-2xl font-bold text-[#0F141C] leading-tight">Asset inventory</h2>
          <p className="text-sm text-gray-500">Inferred role for each uploaded file</p>
        </header>

        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
            allMatched
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-amber-50 text-amber-700 border-amber-100'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${allMatched ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {matched} / {total} roles matched
          </span>
          {!allMatched && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border border-red-100 bg-red-50 text-red-700">
              {total - matched} unmatched
            </span>
          )}
        </div>

        <RoleTable rows={m.roles} />
      </div>
    )
  }

  const renderCodegen = (c: CodegenResult): React.ReactNode => (
    <div className="space-y-4">
      <VerifyReportCard report={c.verify} />
    </div>
  )

  // ── Mock run ────────────────────────────────────────────────────────────────
  const runMock = useCallback(async (overrideAssets?: File[]) => {
    const videoFile = videoFiles[0]
    const effectiveAssets = overrideAssets ?? assetFiles
    let decision: ReviewDecision

    // Stage 0 — probe
    activateStep('probe')
    await delay(500)
    const probeReport: ProbeReport = {
      video: {
        name: videoFile.name,
        sizeBytes: videoFile.size,
        durationSec: 28,
        width: 1080,
        height: 1920,
        mimeType: videoFile.type || 'video/mp4',
      },
      assets: effectiveAssets.map(a => ({ name: a.name, sizeBytes: a.size, mimeType: a.type })),
    }
    setReviewContent(prev => ({ ...prev, probe: renderProbe(probeReport) }))
    completeStep('probe', (
      <span>video {Math.round(probeReport.video.durationSec)}s · {probeReport.assets.length} assets</span>
    ))

    // Stage 1 — video (multi-pass mock)
    do {
      activateStep('video')
      const SUBS: SubCall[] = [
        { id: 'a', label: 'Timeline pass', status: 'idle', group: 'video-pass' },
        { id: 'b', label: 'Mechanics pass', status: 'idle', group: 'video-pass' },
        { id: 'c', label: 'Visual UI pass', status: 'idle', group: 'video-pass' },
        { id: 'd', label: 'Critic', status: 'idle' },
        { id: 'e', label: 'Merge', status: 'idle' },
        { id: 'f', label: 'Alternate genre check', status: 'idle' },
      ]
      // Animate parallel: a/b/c active, then done in parallel
      SUBS[0].status = 'active'; SUBS[1].status = 'active'; SUBS[2].status = 'active'
      setSubCallsByStage(s => ({ ...s, video: [...SUBS] }))
      await delay(900)
      SUBS[0].status = 'done'; SUBS[0].durationMs = 920; SUBS[0].tokensIn = 4200; SUBS[0].tokensOut = 1500
      SUBS[1].status = 'done'; SUBS[1].durationMs = 880; SUBS[1].tokensIn = 4100; SUBS[1].tokensOut = 1300
      SUBS[2].status = 'done'; SUBS[2].durationMs = 950; SUBS[2].tokensIn = 4150; SUBS[2].tokensOut = 1400
      setSubCallsByStage(s => ({ ...s, video: [...SUBS] }))
      // Sequential
      for (const i of [3, 4, 5]) {
        SUBS[i].status = 'active'; setSubCallsByStage(s => ({ ...s, video: [...SUBS] }))
        await delay(500)
        SUBS[i].status = 'done'; SUBS[i].durationMs = 510; SUBS[i].tokensIn = 2200; SUBS[i].tokensOut = 700
        setSubCallsByStage(s => ({ ...s, video: [...SUBS] }))
      }

      const analysis: VideoAnalysis = {
        merged: {
          summary_one_sentence: 'Aim and fire projectiles to destroy the enemy castle before the timer runs out.',
          defining_hook: 'Pull-back-and-release artillery vs. an auto-firing enemy castle, decided in under 30s.',
        },
        alternate: { fits_evidence_better: false, alternate_genre: 'tower defense', rationale: 'Less friction with target audience, more match.' },
      }
      awaitStep('video', (
        <span>{(analysis.merged as { defining_hook: string }).defining_hook}</span>
      ))
      setReviewContent(prev => ({ ...prev, video: renderVideoAnalysis(analysis) }))
      decision = await waitForReview()
    } while (decision.action === 'retry')
    acceptStep('video')

    // Stage 2 — assets
    do {
      activateStep('assets')
      await delay(1100)
      const mapping: AssetMapping = {
        roles: [
          { role: 'background', filename: 'Background.png', match_confidence: 'high' },
          { role: 'castle_player', filename: 'Blue Castle.png', match_confidence: 'high' },
          { role: 'castle_enemy', filename: 'Red Castle.png', match_confidence: 'high' },
          { role: 'projectile_player', filename: 'proj_fireball.png', match_confidence: 'medium' },
          { role: 'hero_a', filename: 'char_cyclops_red.png', match_confidence: 'high' },
          { role: 'hero_b', filename: 'char_ninja.png', match_confidence: 'medium' },
          { role: 'hero_c', filename: null, match_confidence: 'low' },
        ],
      }
      awaitStep('assets', <span>{mapping.roles.filter(r => r.filename).length}/{mapping.roles.length} roles matched</span>)
      setReviewContent(prev => ({ ...prev, assets: renderAssetMapping(mapping) }))
      decision = await waitForReview()
    } while (decision.action === 'retry')
    acceptStep('assets')

    // Stage 3 — gameSpec
    do {
      activateStep('gameSpec')
      await delay(900)
      awaitStep('gameSpec', (
        <span>
          mechanic <span className="font-mono font-semibold text-[#0F141C]">{SAMPLE_GAME_SPEC.mechanic_name}</span> ·
          template <span className="font-mono font-semibold text-[#0F141C]"> {SAMPLE_GAME_SPEC.template_id}</span>
        </span>
      ))
      setReviewContent(prev => ({ ...prev, gameSpec: <GameSpecCard spec={SAMPLE_GAME_SPEC as GameSpecLite} /> }))
      decision = await waitForReview()
    } while (decision.action === 'retry')
    acceptStep('gameSpec')

    // Stage 4 — codegen + verify (mock)
    activateStep('codegen')
    await delay(1500)
    const html = await fetch('/api/mock-playable').then(r => r.text())
    setPlayableHtml(html)
    const codegen: CodegenResult = { html, verify: SAMPLE_PASS_VERIFY, retries: 0 }
    setReviewContent(prev => ({ ...prev, codegen: renderCodegen(codegen) }))
    completeStep('codegen', (
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span>verify <span className="font-semibold text-emerald-600">PASS</span></span>
        <span>size <span className="font-semibold text-[#0F141C]">{(codegen.verify.htmlBytes! / 1024).toFixed(0)} KB</span></span>
        <span>retries <span className="font-semibold text-[#0F141C]">{codegen.retries}</span></span>
      </div>
    ))

    // Save to history (mock run)
    try {
      await saveRun({
        runId: `mock-${Date.now()}`,
        createdAt: new Date().toISOString(),
        gameName: SAMPLE_GAME_SPEC.game_identity.observed_title ?? 'Untitled',
        genre: SAMPLE_GAME_SPEC.game_identity.genre,
        mechanic: SAMPLE_GAME_SPEC.mechanic_name,
        templateId: SAMPLE_GAME_SPEC.template_id,
        htmlBytes: codegen.verify.htmlBytes ?? html.length,
        verifyRuns: codegen.verify.runs,
        retries: codegen.retries,
        totalLatencyMs: 6000,
        totalTokensIn: 16000,
        totalTokensOut: 5400,
        html,
        meta: { mock: true, gameSpec: SAMPLE_GAME_SPEC, verify: SAMPLE_PASS_VERIFY },
      })
    } catch (e) { console.warn('saveRun mock failed', e) }
  }, [videoFiles, assetFiles, activateStep, completeStep, awaitStep, acceptStep, waitForReview])

  // ── Real run ────────────────────────────────────────────────────────────────
  const runReal = useCallback(async (
    overrideAssets?: File[],
    precomputedVideoAnalysis?: VideoAnalysis,
    generatedAssetMetadata?: GeneratedAssetMetadata[],
  ) => {
    const videoFile = videoFiles[0]
    const effectiveAssets = overrideAssets ?? assetFiles
    setErrorMsg(null)

    try {
      const meta = await runPipeline(
        { videoFile, assetFiles: effectiveAssets, variant: '_default', userBrief: userBrief.trim() || undefined, precomputedVideoAnalysis, generatedAssetMetadata },
        {
          onStageStart: (s) => activateStep(s),
          onStageProgress: (s, subs) => setSubCallsByStage(prev => ({ ...prev, [s]: subs })),
          onStageDone: (s, payload) => {
            // Build review content per stage
            if (s === 'probe')    setReviewContent(prev => ({ ...prev, probe: renderProbe(payload as ProbeReport) }))
            if (s === 'video')    setReviewContent(prev => ({ ...prev, video: renderVideoAnalysis(payload as VideoAnalysis) }))
            if (s === 'assets')   setReviewContent(prev => ({ ...prev, assets: renderAssetMapping(payload as AssetMapping) }))
            if (s === 'gameSpec') setReviewContent(prev => ({ ...prev, gameSpec: <GameSpecCard spec={payload as GameSpecLite} /> }))
            if (s === 'codegen') {
              const c = payload as CodegenResult
              setPlayableHtml(c.html)
              setReviewContent(prev => ({ ...prev, codegen: renderCodegen(c) }))
              completeStep('codegen', (
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <span>verify <span className={`font-semibold ${c.verify.runs ? 'text-emerald-600' : 'text-red-600'}`}>{c.verify.runs ? 'PASS' : 'FAIL'}</span></span>
                  <span>retries <span className="font-semibold text-[#0F141C]">{c.retries}</span></span>
                </div>
              ))
              return
            }
            // For pre-codegen stages, set short summary then let onAwaitReview promote to awaiting if needed
            completeStep(s, summarizeStage(s, payload))
          },
          onStageError: (s) => errorStep(s),
          onAwaitReview: async (s, payload) => {
            void payload
            // codegen has no review gate — pipeline handles its own retries.
            if ((s as StageId) === 'codegen') return 'accept'
            // Mark step as awaiting (replace 'done' with 'awaiting' for clarity)
            updateStep(s, { status: 'awaiting' as StepStatus })
            const dec = await waitForReview()
            if (dec.action === 'accept') { acceptStep(s); return 'accept' }
            if (dec.action === 'retry') return 'retry'
            return { type: 'correct', text: dec.text }
          },
        }
      )

      // Persist run
      if (meta.codegen) {
        try {
          await saveRun({
            runId: meta.runId,
            createdAt: meta.startedAt,
            gameName: meta.gameSpec?.game_identity.observed_title ?? meta.runId,
            genre: meta.gameSpec?.game_identity.genre ?? '',
            mechanic: meta.gameSpec?.mechanic_name ?? '',
            templateId: meta.gameSpec?.template_id ?? null,
            htmlBytes: meta.codegen.verify.htmlBytes ?? meta.codegen.html.length,
            verifyRuns: meta.codegen.verify.runs,
            retries: meta.codegen.retries,
            totalLatencyMs: meta.totalLatencyMs,
            totalTokensIn: meta.totalTokensIn,
            totalTokensOut: meta.totalTokensOut,
            html: meta.codegen.html,
            meta,
          })
        } catch (e) { console.warn('saveRun failed', e) }

        // Snapshot this successful run as the demo-cache fallback. If a
        // future run crashes (Gemini outage, etc.) we replay this one
        // instead of dead-ending. Only save if verify passed — we don't
        // want to enshrine a broken playable.
        if (meta.codegen.verify.runs) {
          try {
            await fetch('/api/demo-cache', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ html: meta.codegen.html, meta }),
            })
          } catch (e) { console.warn('demo-cache save failed', e) }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Live pipeline crashed (Gemini outage, OpenRouter blip, P4 verify
      // exhausted, etc.) — try the demo cache fallback. If a known-good
      // run was previously saved via /api/demo-cache, we replay its
      // stages with simulated timing and surface the cached HTML so the
      // demo doesn't dead-end on infrastructure failures.
      try {
        const cacheRes = await fetch('/api/demo-cache', { cache: 'no-store' })
        if (!cacheRes.ok) throw new Error('no-cache')
        const { html, meta } = await cacheRes.json() as { html: string; meta: RunMeta }
        setErrorMsg(`Live pipeline failed (${msg.slice(0, 100)}). Replaying last cached run.`)

        // Replay each stage with realistic timing. Mirrors the runReal
        // onStageDone wiring so the UI looks identical to a live run.
        const replayStage = async (
          id: StageId,
          payload: unknown,
          renderer: () => React.ReactNode,
          summary: React.ReactNode,
          delayMs: number,
        ) => {
          activateStep(id)
          await delay(delayMs)
          setReviewContent(prev => ({ ...prev, [id]: renderer() }))
          completeStep(id, summary)
          void payload
        }
        if (meta.probe) {
          await replayStage('probe', meta.probe, () => renderProbe(meta.probe!),
            <span>video {Math.round(meta.probe.video.durationSec)}s · {meta.probe.assets.length} assets</span>,
            500)
        }
        if (meta.videoAnalysis) {
          await replayStage('video', meta.videoAnalysis, () => renderVideoAnalysis(meta.videoAnalysis!),
            <span className="block min-w-0 break-words text-[#0F141C]">
              {(meta.videoAnalysis.merged as { defining_hook?: string })?.defining_hook ?? 'Video analyzed'}
            </span>,
            1200)
        }
        if (meta.assetMapping) {
          const matched = meta.assetMapping.roles.filter(r => r.filename).length
          await replayStage('assets', meta.assetMapping, () => renderAssetMapping(meta.assetMapping!),
            <span>{matched}/{meta.assetMapping.roles.length} roles matched</span>,
            900)
        }
        if (meta.gameSpec) {
          await replayStage('gameSpec', meta.gameSpec, () => <GameSpecCard spec={meta.gameSpec as GameSpecLite} />,
            <span>
              mechanic <span className="font-mono font-semibold text-[#0F141C]">{meta.gameSpec.mechanic_name}</span>
            </span>,
            800)
        }
        if (meta.codegen) {
          activateStep('codegen')
          await delay(1500)
          setPlayableHtml(html)
          setReviewContent(prev => ({ ...prev, codegen: renderCodegen(meta.codegen!) }))
          completeStep('codegen', (
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span>verify <span className="font-semibold text-emerald-600">PASS (cached)</span></span>
              <span>retries <span className="font-semibold text-[#0F141C]">{meta.codegen.retries}</span></span>
            </div>
          ))
        } else {
          // No codegen in the cached meta — just surface the HTML directly
          setPlayableHtml(html)
        }
      } catch {
        // No demo cache available, or replay itself failed. Surface the
        // original error.
        setErrorMsg(msg)
      }
    }
  }, [videoFiles, assetFiles, userBrief, activateStep, completeStep, errorStep, updateStep, waitForReview, acceptStep])

  // Deterministic demo flow — fired when the dropped video filename matches
  // /block.?blast/i. Reads the committed fixture under
  // /demo-fixtures/blockblast/ and walks the pipeline UI through scripted
  // timing without ever hitting a live API.
  //
  // Phase budgets (chosen by user, not random):
  //   - chunked upload sim:           ~1s
  //   - video analysis (assetsGen):   37s
  //   - asset generation panel:       32s (handled inside BlockBlastFakePanel)
  //   - downstream pipeline replay:   87s total
  //       probe   4s
  //       video  25s
  //       assets 15s
  //       gameSpec 15s
  //       codegen 28s
  const runBlockBlastFakePipeline = useCallback(async (videoFile: File) => {
    setErrorMsg(null)

    // ── Chunked-upload simulation ──────────────────────────────────────────
    activateStep('assetsGen')
    const totalBytes = videoFile.size
    const chunkBytes = Math.max(1, Math.floor(totalBytes / 4))
    for (let sent = 0; sent < totalBytes; sent += chunkBytes) {
      const bytes = Math.min(sent + chunkBytes, totalBytes)
      const pct = Math.round((bytes / totalBytes) * 100)
      const mb = (bytes / 1024 / 1024).toFixed(1)
      const totalMb = (totalBytes / 1024 / 1024).toFixed(1)
      updateStep('assetsGen', { output: <span>Uploading {mb}/{totalMb} MB · {pct}%</span> })
      await delay(220)
    }

    // ── Video analysis phase: 37s with a live elapsed-time counter ─────────
    const ANALYSIS_TOTAL_MS = 37_000
    const analysisStart = Date.now()
    const analysisTick = setInterval(() => {
      const elapsed = (Date.now() - analysisStart) / 1000
      const target = ANALYSIS_TOTAL_MS / 1000
      const pct = Math.min(100, Math.round((elapsed / target) * 100))
      updateStep('assetsGen', {
        output: (
          <span>Analyzing video · {elapsed.toFixed(0)}s / {target.toFixed(0)}s · {pct}%</span>
        ),
      })
    }, 500)
    try {
      await delay(ANALYSIS_TOTAL_MS)
    } finally {
      clearInterval(analysisTick)
    }

    // ── Load the fixture ──────────────────────────────────────────────────
    let fixture: BlockBlastFixtureManifest
    try {
      const res = await fetch('/demo-fixtures/blockblast/manifest.json', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Fixture missing: ${res.status}`)
      fixture = (await res.json()) as BlockBlastFixtureManifest
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      updateStep('assetsGen', {
        status: 'error' as StepStatus,
        doneAt: Date.now(),
        output: <span className="text-red-600">Could not load demo fixture: {msg}</span>,
      })
      return
    }

    awaitStep('assetsGen', (
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span>Demo run · <span className="font-semibold text-[#0F141C]">block-blast (fixture)</span></span>
        <span className="text-gray-500">{autoModeRef.current ? 'auto mode' : 'manual mode'}</span>
      </div>
    ))

    // ── Mount the fake panel; wait for Continue ────────────────────────────
    const assetStageDone = new Promise<void>(resolve => {
      setReviewContent(prev => ({
        ...prev,
        assetsGen: (
          <BlockBlastFakePanel
            manifest={fixture}
            autoMode={autoModeRef.current}
            onComplete={() => resolve()}
          />
        ),
      }))
    })
    await assetStageDone
    acceptStep('assetsGen')

    // ── Downstream pipeline replay: 87s total ─────────────────────────────
    const probeReport: ProbeReport = {
      video: {
        name: videoFile.name,
        sizeBytes: videoFile.size,
        durationSec: fixture.video_duration_s,
        width: 1080,
        height: 1920,
        mimeType: videoFile.type || 'video/mp4',
      },
      assets: fixture.assets.map(a => ({ name: `${a.asset_id}.png`, sizeBytes: 60_000, mimeType: 'image/png' })),
    }
    activateStep('probe')
    await delay(4_000)
    setReviewContent(prev => ({ ...prev, probe: renderProbe(probeReport) }))
    completeStep('probe', (
      <span>video {Math.round(probeReport.video.durationSec)}s · {probeReport.assets.length} assets</span>
    ))

    activateStep('video')
    await delay(25_000)
    const videoAnalysis: VideoAnalysis = {
      merged: {
        summary_one_sentence: fixture.video_analysis.summary_one_sentence,
        defining_hook: fixture.video_analysis.defining_hook,
        genre: fixture.video_analysis.genre,
      },
      alternate: { fits_evidence_better: false, alternate_genre: 'match-3', rationale: 'Pieces are pre-shaped, not aligned to chains.' },
    }
    setReviewContent(prev => ({ ...prev, video: renderVideoAnalysis(videoAnalysis) }))
    completeStep('video', (
      <span className="block min-w-0 break-words text-[#0F141C]">
        {videoAnalysis.merged.defining_hook}
      </span>
    ))

    activateStep('assets')
    await delay(15_000)
    const assetMapping: AssetMapping = {
      roles: fixture.assets.map(a => ({
        role: a.asset_id,
        filename: `${a.asset_id}.png`,
        match_confidence: 'high' as const,
      })),
    }
    setReviewContent(prev => ({ ...prev, assets: renderAssetMapping(assetMapping) }))
    completeStep('assets', <span>{assetMapping.roles.length}/{assetMapping.roles.length} roles matched</span>)

    activateStep('gameSpec')
    await delay(15_000)
    const gameSpec = {
      source_video: videoFile.name,
      game_identity: { observed_title: 'Block Blast', genre: 'tile puzzle', visual_style: fixture.art_style.summary },
      render_mode: '2d' as const,
      mechanic_name: 'swipe_puzzle',
      template_id: null,
      core_loop_one_sentence: (fixture.game_spec.core_loop_one_sentence as string) || '',
      defining_hook: fixture.video_analysis.defining_hook,
      not_this_game: ['not match-3', 'not falling-block puzzle'],
      first_5s_script: (fixture.game_spec.first_5s_script as string) || '',
      tutorial_loss_at_seconds: 18,
      asset_role_map: Object.fromEntries(fixture.assets.map(a => [a.asset_id, `${a.asset_id}.png`])),
      params: { grid_size: 8, gravity: 0, hp: 1, session_seconds: 30 },
      creative_slot_prompt: '',
    }
    setReviewContent(prev => ({ ...prev, gameSpec: <GameSpecCard spec={gameSpec as GameSpecLite} /> }))
    completeStep('gameSpec', (
      <span>
        mechanic <span className="font-mono font-semibold text-[#0F141C]">{gameSpec.mechanic_name}</span>
      </span>
    ))

    activateStep('codegen')
    await delay(28_000)
    let html = ''
    try {
      const htmlRes = await fetch('/demo-fixtures/blockblast/playable.html', { cache: 'no-store' })
      html = await htmlRes.text()
    } catch (e) {
      console.warn('demo fixture playable.html missing:', e)
    }
    setPlayableHtml(html)
    const codegenReport: CodegenResult = {
      html,
      verify: {
        runs: true, sizeOk: true, consoleErrors: [], canvasNonBlank: true,
        mraidOk: true, mechanicStringMatch: true, interactionStateChange: true,
        htmlBytes: html.length,
      },
      retries: 0,
    }
    setReviewContent(prev => ({ ...prev, codegen: renderCodegen(codegenReport) }))
    completeStep('codegen', (
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span>verify <span className="font-semibold text-emerald-600">PASS (demo)</span></span>
        <span>retries <span className="font-semibold text-[#0F141C]">0</span></span>
      </div>
    ))
  }, [activateStep, awaitStep, acceptStep, completeStep, updateStep])

  const handleRun = useCallback(async () => {
    if (isRunning) return
    if (!videoFiles.length) return

    setIsRunning(true)
    setHasRun(true)
    setPlayableHtml(null)
    setSteps(INITIAL_STEPS)
    setReviewContent({})
    setSubCallsByStage({ probe: [], video: [], assets: [], gameSpec: [], codegen: [] })
    setIsAwaiting(false)
    reviewResolverRef.current = null
    setErrorMsg(null)

    // ── Demo-fixture short-circuit ──────────────────────────────────────────
    // If the user dropped the Block Blast demo video (filename matches the
    // configured pattern), bypass every live API and play through the
    // pre-recorded run. Deterministic, demo-safe, ~25-40s end-to-end.
    const videoFileEarly = videoFiles[0]
    if (/block.?blast/i.test(videoFileEarly.name)) {
      try {
        await runBlockBlastFakePipeline(videoFileEarly)
      } finally {
        setIsRunning(false)
      }
      return
    }

    try {
      // Stage 0 — OUR asset-generation node. Runs before the coworker's pipeline
      // so their stages can assume a complete asset set is on disk.
      activateStep('assetsGen')
      const videoFile = videoFiles[0]
      const importedAssetFiles = toImportedAssetFiles(assetFiles)

      let activeRunId: string
      try {
        activeRunId = await uploadVideoForAnalysis(videoFile, (bytes, total) => {
          const pct = total > 0 ? Math.round((bytes / total) * 100) : 0
          const mb = (bytes / 1024 / 1024).toFixed(1)
          const totalMb = (total / 1024 / 1024).toFixed(1)
          updateStep('assetsGen', {
            output: (
              <span>Uploading {mb}/{totalMb} MB · {pct}%</span>
            ),
          })
        })
        setRunId(activeRunId)
      } catch (err) {
        updateStep('assetsGen', {
          status: 'error' as StepStatus,
          doneAt: Date.now(),
          output: <span className="text-red-600">{err instanceof Error ? err.message : 'Upload failed'}</span>,
        })
        return
      }

      awaitStep('assetsGen', (
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>Run <span className="font-semibold text-[#0F141C]">{activeRunId}</span></span>
          <span className="text-gray-500">{autoModeRef.current ? 'auto mode' : 'manual mode'}</span>
        </div>
      ))

      // Kick off P1 (their video analysis) NOW, in parallel with our asset
      // generation + user review. By the time the user clicks Continue we
      // hand the cached result to runPipeline via precomputedVideoAnalysis,
      // and the orchestrator skips the actual P1 call.
      //
      // PRIMARY: Claude (Sonnet 4.6) with 8 frames sampled in-browser. Faster
      // (~15s) and not subject to Gemini's Files API hangs.
      // FALLBACK: Gemini multi-pass (slower, can hang on Files API). Only
      // tried if Claude fails — which would mean the OpenRouter side is also
      // down, in which case the run is unrecoverable anyway.
      const videoAnalysisPromise: Promise<VideoAnalysis | undefined> = mockModeRef.current
        ? Promise.resolve(undefined)
        : runP1VideoClaude(videoFile, subs => {
            setSubCallsByStage(prev => ({ ...prev, video: subs }))
          })
            .then(r => {
              console.info('[parallel P1] Claude (primary) succeeded')
              return r.analysis
            })
            .catch(async err => {
              console.warn('[parallel P1] Claude (primary) failed, trying Gemini fallback:', err)
              try {
                const r = await runP1Video(videoFile, '_default', subs => {
                  setSubCallsByStage(prev => ({ ...prev, video: subs }))
                })
                console.info('[parallel P1] Gemini (fallback) succeeded')
                return r.analysis
              } catch (geminiErr) {
                console.warn('[parallel P1] Gemini (fallback) also failed:', geminiErr)
                return undefined
              }
            })

      // Mount AssetReviewPanel and wait for the user (or auto-mode) to confirm.
      const assetStageDone = new Promise<void>(resolve => {
        setReviewContent(prev => ({
          ...prev,
          assetsGen: (
            <AssetReviewPanel
              runId={activeRunId}
              importedFiles={importedAssetFiles}
              rawImportedFiles={assetFiles}
              autoMode={autoModeRef.current}
              onComplete={() => resolve()}
            />
          ),
        }))
      })

      try {
        await waitForAnalysisManifest(activeRunId)
      } catch (err) {
        updateStep('assetsGen', {
          status: 'error' as StepStatus,
          doneAt: Date.now(),
          output: <span className="text-red-600">{err instanceof Error ? err.message : 'Analysis timed out'}</span>,
        })
        return
      }

      // Block here until the panel signals "Continue to pipeline" (manual click
      // or auto-mode auto-fire when coverage is fully resolved).
      await assetStageDone
      acceptStep('assetsGen')

      // Hydrate the assets generated by the assetsGen stage back into File
      // objects so the downstream pipeline (probe/p2/p3/p4) sees them
      // alongside the user's original imports. Without this, generated
      // assets sit on disk and the rest of the pipeline is blind to them.
      let pipelineAssets = assetFiles
      let generatedAssetMetadata: GeneratedAssetMetadata[] = []
      try {
        const hydrated = await fetchGeneratedAssetFiles(activeRunId)
        const merged = mergeAssetFiles(assetFiles, hydrated)
        pipelineAssets = merged.files
        generatedAssetMetadata = merged.metadata
      } catch (err) {
        // Hydration failure is non-fatal — we still try the pipeline with
        // the user imports only, and surface a soft warning.
        const msg = err instanceof Error ? err.message : 'Failed to hydrate generated assets'
        setErrorMsg(`Generated assets could not be loaded: ${msg}. Continuing with imports only.`)
      }

      // Stage 1+ — coworker's pipeline picks up with the now-complete asset set.
      if (mockModeRef.current) {
        await runMock(pipelineAssets)
      } else {
        // Wait for the parallel P1 we kicked off after upload. If it landed
        // before Continue, this resolves immediately; otherwise we wait the
        // remaining seconds. If P1 errored we pass undefined and the
        // orchestrator falls back to running it itself.
        const precomputedVideoAnalysis = await videoAnalysisPromise
        await runReal(pipelineAssets, precomputedVideoAnalysis, generatedAssetMetadata)
      }
    } finally {
      setIsRunning(false)
    }
  }, [videoFiles, assetFiles, isRunning, activateStep, awaitStep, acceptStep, updateStep, runMock, runReal])

  const canRun = videoFiles.length > 0 && !isRunning
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
      <div className="mt-3">
        <MicCapture value={userBrief} onChange={setUserBrief} />
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
        {isRunning ? 'Generating…' : `Generate`}
      </button>
      {errorMsg && (
        <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {errorMsg}
        </div>
      )}
    </div>
  )

  // Pipeline card with optional sub-call renderer for the active stage
  const activeStageId = steps.find(s => s.status === 'active' || s.status === 'awaiting')?.id as StageId | undefined
  // 'assetsGen' (our stage) isn't in subCallsByStage — fallback to [] so
  // .length below doesn't crash when our stage is active.
  const activeSubs = (activeStageId ? subCallsByStage[activeStageId] : undefined) ?? []
  const pipelineCard = hasRun ? (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 fade-slide-in">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-5">Pipeline</p>
      <PipelineStepper steps={steps} />
      {activeSubs.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Sub-calls</div>
          <MultiPassStepper calls={activeSubs} />
        </div>
      )}
    </div>
  ) : null

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
          <SidebarItem
            active={view === 'generator'}
            onClick={() => setView('generator')}
            icon={
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M7.5 2v7M4.5 6l3-3 3 3M2 12.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          />
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
          <SidebarItem
            active={view === 'library'}
            onClick={() => setView('library')}
            icon={
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="8" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="2" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            }
          />
        </div>

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
        <header className="h-[52px] bg-white border-b border-gray-100 flex items-center px-4 sm:px-6 gap-2 shrink-0">
          <span className="text-xs text-gray-400 font-medium">Voodoo</span>
          <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
            <path d="M1 1l4 4-4 4" stroke="#D1D5DB" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-xs font-semibold text-[#0F141C]">
            {view === 'history' ? 'History' : view === 'library' ? 'Library' : 'Playable Generator'}
          </span>

          <div className="ml-auto flex items-center gap-3">
            <MockToggle mockMode={mockMode} onToggle={handleMockToggle} />

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

        <main className="flex-1 overflow-hidden p-3 sm:p-5 dot-grid">
          {view === 'history' ? (
            <HistoryView />
          ) : view === 'library' ? (
            <UtilsView />
          ) : (
            <>
              {!hasRun && (
                <div className="h-full flex items-center justify-center">
                  <div className="w-full max-w-xl">{uploadCard}</div>
                </div>
              )}

              {hasRun && polishMode && playableHtml && (
                <div className="h-full min-h-0">
                  <PolishPanel
                    sourceHtml={playableHtml}
                    onPolished={(html) => { setPlayableHtml(html); setPolishMode(false) }}
                    onClose={() => setPolishMode(false)}
                  />
                </div>
              )}

              {hasRun && !polishMode && fullscreen && playableHtml && (
                <div className="h-full">
                  <PlayableViewer
                    html={playableHtml}
                    isFullscreen
                    onToggleFullscreen={() => setFullscreen(false)}
                  />
                </div>
              )}

              {hasRun && !polishMode && !fullscreen && (
                <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
                  <div className="lg:overflow-auto space-y-4 pb-4 lg:pb-0 min-w-0">
                    {uploadCard}
                    {pipelineCard}
                  </div>

                  <div className="flex min-h-0 flex-col overflow-hidden min-h-[420px] lg:min-h-0">
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col flex-1 min-h-0 overflow-hidden">
                      <div className="flex items-center justify-between mb-4 shrink-0">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                          {steps.every(s => s.status === 'done') && playableHtml ? 'Result' : isAwaiting ? 'Awaiting review' : 'Pipeline output'}
                        </p>
                        {steps.every(s => s.status === 'done') && playableHtml && (
                          <button
                            onClick={() => setPolishMode(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0055FF] text-white text-[11px] font-semibold hover:bg-[#0044DD] active:scale-95 transition-all shadow-sm"
                          >
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                              <path d="M2.5 9.5l3-3 3 3M5.5 6.5V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M2 11h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            Polish with hand tutorials
                          </button>
                        )}
                      </div>
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

function summarizeStage(s: StageId, payload: unknown): React.ReactNode {
  if (s === 'probe') {
    const p = payload as ProbeReport
    return <span>video {Math.round(p.video.durationSec)}s · {p.assets.length} assets</span>
  }
  if (s === 'video') {
    const v = payload as VideoAnalysis
    const m = v.merged as { defining_hook?: string }
    return (
      <span className="block min-w-0 break-words text-[#0F141C]">
        {m?.defining_hook ?? 'Video analyzed'}
      </span>
    )
  }
  if (s === 'assets') {
    const m = payload as AssetMapping
    const matched = m.roles.filter(r => r.filename).length
    return <span>{matched}/{m.roles.length} roles matched</span>
  }
  if (s === 'gameSpec') {
    const g = payload as GameSpec
    return <span>mechanic <span className="font-mono font-semibold text-[#0F141C]">{g.mechanic_name}</span> · template <span className="font-mono font-semibold text-[#0F141C]">{g.template_id ?? '(none)'}</span></span>
  }
  return null
}
