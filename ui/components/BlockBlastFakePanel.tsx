'use client'

// Deterministic fake panel for the Block Blast demo. Triggered by handleRun
// when the dropped video filename matches /block.?blast/i. Bypasses every
// live API (Gemini, Anthropic, Scenario, Python pipeline) and instead reads
// the committed fixture under /demo-fixtures/blockblast/.
//
// Visual flow:
//   1. Cards render in "source" state (showing extracted/crops/<id>.png)
//      with a subtle pending badge.
//   2. On Generate click (or auto-mode auto-fire) the cards flip to their
//      "final" state (finals/<id>.png) one by one with random 0.4-2.5s
//      offsets between completions, totaling ~10-25s wall time.
//   3. When all are done, "Continue to pipeline" enables (auto-fires in
//      auto mode).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type BlockBlastFixtureAsset = {
  asset_id: string
  name: string
  category: string
  visual_description: string
  route: string
}

export type BlockBlastFixtureManifest = {
  video_match: string
  video_duration_s: number
  art_style: { summary: string; rendering: string; palette: string; anti_styles: string[] }
  video_analysis: { summary_one_sentence: string; defining_hook: string; genre: string }
  game_spec: Record<string, unknown>
  assets: BlockBlastFixtureAsset[]
}

type AssetState = 'pending' | 'running' | 'done'

type Props = {
  manifest: BlockBlastFixtureManifest
  autoMode: boolean
  onComplete: () => void
}

const FIXTURE_BASE = '/demo-fixtures/blockblast'

// Hand-tuned, deterministic schedule: each entry is the index of an asset
// in manifest.assets (0..17) and the wall-clock offset (ms) at which it
// flips to "done". Order and gaps are intentionally chaotic — long initial
// wait before the first card lands (~5.6s), bursts of 2-3 in a row, lulls
// between bursts, last card lands at ~42s. Mimics the irregular cadence
// of real Scenario job completions where some routes finish fast and
// others (background plates, character rigs) lag.
const GENERATION_SCHEDULE: Array<{ idx: number; t: number }> = [
  { idx: 7,  t: 5_600 },
  { idx: 1,  t: 7_100 },
  { idx: 12, t: 7_800 },
  { idx: 4,  t: 10_200 },
  { idx: 15, t: 12_400 },
  { idx: 2,  t: 13_100 },
  { idx: 9,  t: 16_300 },
  { idx: 6,  t: 18_700 },
  { idx: 13, t: 19_400 },
  { idx: 17, t: 22_900 },
  { idx: 3,  t: 25_500 },
  { idx: 10, t: 27_100 },
  { idx: 5,  t: 27_900 },
  { idx: 14, t: 31_800 },
  { idx: 8,  t: 35_400 },
  { idx: 16, t: 37_600 },
  { idx: 11, t: 40_200 },
  { idx: 0,  t: 42_300 },
]

const GENERATION_TOTAL_MS = GENERATION_SCHEDULE[GENERATION_SCHEDULE.length - 1].t

export default function BlockBlastFakePanel({ manifest, autoMode, onComplete }: Props) {
  const [states, setStates] = useState<Record<string, AssetState>>(() =>
    Object.fromEntries(manifest.assets.map(a => [a.asset_id, 'pending']))
  )
  const [generationKickedOff, setGenerationKickedOff] = useState(false)
  const completeFiredRef = useRef(false)
  const autoGenStartedRef = useRef(false)

  const totalCount = manifest.assets.length
  const doneCount = Object.values(states).filter(s => s === 'done').length
  const runningCount = Object.values(states).filter(s => s === 'running').length
  const isReady = doneCount === totalCount

  const startGeneration = useCallback(() => {
    if (generationKickedOff) return
    setGenerationKickedOff(true)
    // Flip every card to "running" first (pulse animation engages), then
    // schedule individual completions per the hand-tuned chaotic schedule.
    // If the manifest has fewer/more assets than the schedule, fall back
    // to evenly-spaced completion for any extras.
    setStates(prev => Object.fromEntries(Object.keys(prev).map(k => [k, 'running' as AssetState])))
    const N = manifest.assets.length
    for (const { idx, t } of GENERATION_SCHEDULE) {
      const asset = manifest.assets[idx]
      if (!asset) continue
      setTimeout(() => {
        setStates(prev => ({ ...prev, [asset.asset_id]: 'done' }))
      }, t)
    }
    // Cover any tail beyond the schedule's coverage with even spacing.
    const scheduledIdx = new Set(GENERATION_SCHEDULE.map(e => e.idx))
    const tailIndices = Array.from({ length: N }, (_, i) => i).filter(i => !scheduledIdx.has(i))
    if (tailIndices.length > 0) {
      const tailStart = GENERATION_TOTAL_MS + 800
      const tailSlot = 1_500
      tailIndices.forEach((i, k) => {
        const asset = manifest.assets[i]
        setTimeout(() => {
          setStates(prev => ({ ...prev, [asset.asset_id]: 'done' }))
        }, tailStart + tailSlot * k)
      })
    }
  }, [generationKickedOff, manifest.assets])

  // Auto-mode kickoff: fire Generate as soon as we mount.
  useEffect(() => {
    if (!autoMode) return
    if (autoGenStartedRef.current) return
    autoGenStartedRef.current = true
    // Small delay so the user briefly sees the source-state cards before
    // they start filling.
    const t = setTimeout(() => startGeneration(), 600)
    return () => clearTimeout(t)
  }, [autoMode, startGeneration])

  // Auto-Continue once all cards are done.
  useEffect(() => {
    if (!autoMode) return
    if (!isReady) return
    if (completeFiredRef.current) return
    completeFiredRef.current = true
    // Brief beat so the user sees "all done" before transitioning.
    const t = setTimeout(() => onComplete(), 800)
    return () => clearTimeout(t)
  }, [autoMode, isReady, onComplete])

  const handleContinue = useCallback(() => {
    if (completeFiredRef.current) return
    completeFiredRef.current = true
    onComplete()
  }, [onComplete])

  const summary = manifest.video_analysis.summary_one_sentence

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Asset resolution</p>
            <h2 className="mt-1 text-lg font-bold text-[#0F141C]">Block Blast (demo run)</h2>
            <p className="mt-0.5 text-[11px] text-gray-400">
              Coverage source: <span className="font-semibold text-[#0F141C]">demo fixture</span>
              {' '} · Mode: <span className="font-semibold text-[#0F141C]">{autoMode ? 'auto' : 'manual'}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-xl border border-gray-100 bg-[#F6F9FC] px-3 py-2">
              <div className="text-sm font-bold text-[#0F141C]">{doneCount}/{totalCount}</div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Generated</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-[#F6F9FC] px-3 py-2">
              <div className="text-sm font-bold text-[#0F141C]">{runningCount}</div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Running</div>
            </div>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-gray-500">
          <span className="font-semibold text-[#0F141C]">Style lock:</span> {manifest.art_style.summary}
        </p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-gray-400">
          {summary}
        </p>

        {!autoMode && !generationKickedOff && (
          <div className="mt-4">
            <button
              onClick={startGeneration}
              className="rounded-lg bg-[#0055FF] px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-[#0044DD]"
            >
              Generate all {totalCount}
            </button>
          </div>
        )}

        {generationKickedOff && !isReady && (
          <div className="mt-3 rounded-lg border border-[#0055FF1F] bg-[#0055FF08] px-3 py-2 text-xs font-medium text-[#0055FF]">
            Generation in progress · {doneCount}/{totalCount} done · {runningCount} running
          </div>
        )}

        {generationKickedOff && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
            <div className="text-[11px] text-gray-500">
              {isReady
                ? 'All assets resolved. Continue to the rest of the pipeline.'
                : 'Waiting for the queue to drain…'}
            </div>
            <button
              onClick={handleContinue}
              disabled={!isReady || completeFiredRef.current}
              className="rounded-lg bg-[#0055FF] px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-[#0044DD] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue to pipeline
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto pr-1">
        <div className="grid gap-3 xl:grid-cols-2">
          {manifest.assets.map(asset => (
            <FakeAssetRow key={asset.asset_id} asset={asset} state={states[asset.asset_id]} />
          ))}
        </div>
      </div>
    </div>
  )
}

function FakeAssetRow({ asset, state }: { asset: BlockBlastFixtureAsset; state: AssetState }) {
  const cropUrl = `${FIXTURE_BASE}/crops/${asset.asset_id}.png`
  const finalUrl = `${FIXTURE_BASE}/finals/${asset.asset_id}.png`
  const showFinal = state === 'done'
  const imgUrl = showFinal ? finalUrl : cropUrl
  const statusLabel = state === 'done' ? 'done' : state === 'running' ? 'running' : 'pending'
  const statusClass =
    state === 'done'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : state === 'running'
        ? 'bg-[#0055FF14] text-[#0055FF] border-[#0055FF1F]'
        : 'bg-gray-50 text-gray-400 border-gray-100'

  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-3 rounded-xl border border-gray-100 bg-white p-2.5 shadow-sm">
      <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-[linear-gradient(45deg,#eef2f7_25%,transparent_25%),linear-gradient(-45deg,#eef2f7_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eef2f7_75%),linear-gradient(-45deg,transparent_75%,#eef2f7_75%)] bg-[length:14px_14px] bg-[position:0_0,0_7px,7px_-7px,-7px_0]">
        <img
          src={imgUrl}
          alt={asset.name}
          className={`max-h-full max-w-full object-contain transition-opacity duration-700 ${showFinal ? 'opacity-100' : 'opacity-60'}`}
          title={showFinal ? asset.name : 'Source frame from video — not yet generated'}
        />
        {!showFinal && (
          <span className="absolute bottom-0 left-0 right-0 bg-[#0F141C] bg-opacity-70 px-1 py-0.5 text-center text-[8px] font-semibold uppercase tracking-wider text-white">
            source
          </span>
        )}
        {state === 'running' && (
          <div className="absolute inset-0 animate-pulse bg-[#0055FF15]" />
        )}
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-[#0F141C]">{asset.name}</div>
            <div className="truncate font-mono text-[10px] text-gray-400">{asset.asset_id}</div>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-gray-100 bg-[#F6F9FC] px-2 py-0.5 text-[10px] font-semibold text-gray-500">{asset.category}</span>
          <span className="rounded-full border border-gray-100 bg-[#F6F9FC] px-2 py-0.5 text-[10px] font-semibold text-gray-500">{asset.route}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-gray-500">{asset.visual_description}</p>
      </div>
    </div>
  )
}
