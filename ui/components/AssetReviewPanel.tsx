'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  compareRequiredAssetsToImports,
  summarizeAssetCoverage,
  type AssetCoverageItem,
  type ImportedAssetFile,
} from '@/utils/assetCoverage'
import type {
  SandboxAsset,
  SandboxCoverageReport,
  SandboxJob,
  SandboxManifest,
} from '@/utils/sandboxTypes'

const POLL_MS = 2000

type AssetReviewPanelProps = {
  runId: string | null
  importedFiles: ImportedAssetFile[]
  rawImportedFiles?: File[]
  autoMode?: boolean
}

type PromptPayload = {
  scenario_prompt?: string
  visual_description?: string
  category?: string
  name?: string
}

type CoverageInfo = {
  source: 'lexical' | 'gemini'
  byId: Map<string, AssetCoverageItem>
  summary: { total: number; provided: number; missing: number }
}

function formatRunName(runId: string): string {
  return runId.replace(/[_-]+/g, ' ')
}

type StageState = 'idle' | 'running' | 'done' | 'error'
type Stage = {
  id: 'analyze' | 'coverage' | 'generate'
  label: string
  state: StageState
  detail?: string
  elapsedMs?: number
}

function deriveStages(args: {
  jobs: SandboxJob[]
  manifest: SandboxManifest | null
  coverageReport: SandboxCoverageReport | null
  hasImports: boolean
  generationKickedOff: boolean
  isReanalyzing: boolean
  reanalyzeJob: SandboxJob | undefined
}): Stage[] {
  const { jobs, manifest, coverageReport, hasImports, generationKickedOff, isReanalyzing, reanalyzeJob } = args
  const latestByKind = (kind: SandboxJob['kind']): SandboxJob | undefined =>
    [...jobs].filter(j => j.kind === kind).sort((a, b) => b.started_at - a.started_at)[0]

  const analyzeJob = latestByKind('analyze')
  const coverageJob = latestByKind('coverage')
  const generateJob = latestByKind('generate')

  // For done/error rows we ONLY want the locked-in duration. If finished_at
  // hasn't propagated yet, return undefined so the UI hides the number rather
  // than briefly showing a wall-clock number that overshoots the real value.
  const elapsedRunning = (j?: SandboxJob): number | undefined => {
    if (!j || j.status !== 'running') return undefined
    return Math.max(0, (Date.now() / 1000 - j.started_at) * 1000)
  }
  const elapsedFinal = (j?: SandboxJob): number | undefined => {
    if (!j || !j.finished_at) return undefined
    return Math.max(0, (j.finished_at - j.started_at) * 1000)
  }
  const elapsed = (j?: SandboxJob): number | undefined =>
    j?.status === 'running' ? elapsedRunning(j) : elapsedFinal(j)

  // Stage 1: analysis
  let analyzeState: StageState = 'idle'
  let analyzeDetail: string | undefined
  if (isReanalyzing || reanalyzeJob?.status === 'running') {
    analyzeState = 'running'
    analyzeDetail = 'Re-analyzing for missed assets…'
  } else if (analyzeJob?.status === 'running') {
    analyzeState = 'running'
    analyzeDetail = 'Gemini video analysis (~30–90s)'
  } else if (analyzeJob?.status === 'error') {
    analyzeState = 'error'
    analyzeDetail = analyzeJob.error?.split('\n')[0] || 'Analysis failed'
  } else if (manifest && manifest.assets.length > 0) {
    analyzeState = 'done'
    analyzeDetail = `${manifest.assets.length} assets identified`
  }

  // Stage 2: coverage (Gemini matching) — skipped if no imports
  let coverageState: StageState = 'idle'
  let coverageDetail: string | undefined
  if (!hasImports) {
    coverageDetail = 'No imports — coverage skipped'
  } else if (coverageJob?.status === 'running') {
    coverageState = 'running'
    coverageDetail = 'Matching filenames against assets…'
  } else if (coverageJob?.status === 'error') {
    coverageState = 'error'
    coverageDetail = coverageJob.error?.split('\n')[0] || 'Matching failed'
  } else if (coverageReport) {
    coverageState = 'done'
    coverageDetail = `${coverageReport.summary.provided}/${coverageReport.summary.total} imported · ${coverageReport.summary.missing} missing`
  } else if (analyzeState === 'done') {
    coverageState = 'idle'
    coverageDetail = 'Awaiting imports'
  }

  // Stage 3: generation (Scenario)
  const generatedDone = manifest?.assets.filter(a => a.status === 'done').length ?? 0
  const total = manifest?.assets.length ?? 0
  const errors = manifest?.assets.filter(a => a.status === 'error').length ?? 0
  let generateState: StageState = 'idle'
  let generateDetail: string | undefined
  if (generateJob?.status === 'running') {
    generateState = 'running'
    generateDetail = `Scenario generating ${generatedDone}/${total}${errors ? ` · ${errors} errors` : ''}`
  } else if (generateJob?.status === 'error') {
    generateState = 'error'
    generateDetail = generateJob.error?.split('\n')[0] || 'Generation failed'
  } else if (generationKickedOff && generatedDone > 0) {
    generateState = 'done'
    generateDetail = `${generatedDone}/${total} generated${errors ? ` · ${errors} errors` : ''}`
  } else if (analyzeState === 'done') {
    generateState = 'idle'
    generateDetail = total === 0 ? 'No assets to generate' : 'Pick assets and click Generate (or wait if auto)'
  }

  return [
    { id: 'analyze', label: 'Video analysis', state: analyzeState, detail: analyzeDetail, elapsedMs: elapsed(analyzeJob) ?? elapsed(reanalyzeJob) },
    { id: 'coverage', label: 'Asset coverage (Gemini)', state: coverageState, detail: coverageDetail, elapsedMs: elapsed(coverageJob) },
    { id: 'generate', label: 'Asset generation (Scenario)', state: generateState, detail: generateDetail, elapsedMs: elapsed(generateJob) },
  ]
}

function StageDot({ state }: { state: StageState }) {
  if (state === 'running') {
    return <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[#0055FF]" aria-label="running" />
  }
  if (state === 'done') {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" aria-label="done" />
  }
  if (state === 'error') {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" aria-label="error" />
  }
  return <span className="inline-block h-2.5 w-2.5 rounded-full border border-gray-300 bg-white" aria-label="idle" />
}

function StageTracker({ stages }: { stages: Stage[] }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-gray-100 bg-[#F6F9FC] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Pipeline status</p>
      <div className="flex flex-col gap-1.5">
        {stages.map((stage, idx) => (
          <div key={stage.id} className="flex items-center gap-2 text-xs">
            <StageDot state={stage.state} />
            <span className="font-semibold text-[#0F141C] min-w-[140px]">
              {idx + 1}. {stage.label}
            </span>
            {stage.detail && <span className="text-gray-500 truncate">{stage.detail}</span>}
            {stage.state === 'running' && stage.elapsedMs !== undefined && (
              <span className="ml-auto text-[10px] font-mono text-[#0055FF]">{(stage.elapsedMs / 1000).toFixed(0)}s</span>
            )}
            {stage.state === 'done' && stage.elapsedMs !== undefined && (
              <span className="ml-auto text-[10px] font-mono text-gray-400">{(stage.elapsedMs / 1000).toFixed(0)}s</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function statusClass(status: SandboxAsset['status'], isRunning: boolean): string {
  if (isRunning) return 'bg-[#0055FF0D] text-[#0055FF] border-[#0055FF1F]'
  if (status === 'done') return 'bg-emerald-50 text-emerald-700 border-emerald-100'
  if (status === 'error') return 'bg-red-50 text-red-600 border-red-100'
  return 'bg-gray-50 text-gray-500 border-gray-100'
}

function coverageClass(coverage: AssetCoverageItem['coverage'], kind?: 'import' | 'library' | null): string {
  if (coverage === 'missing') return 'bg-amber-50 text-amber-700 border-amber-100'
  if (kind === 'library') return 'bg-indigo-50 text-indigo-700 border-indigo-100'
  return 'bg-[#0F141C] text-white border-[#0F141C]'
}

function coverageLabel(coverage: AssetCoverageItem['coverage'], kind?: 'import' | 'library' | null): string {
  if (coverage === 'missing') return 'missing'
  if (kind === 'library') return 'built-in'
  return 'imported'
}

function buildLexicalCoverage(
  assets: SandboxAsset[],
  importedFiles: ImportedAssetFile[],
): CoverageInfo {
  const items = compareRequiredAssetsToImports(assets, importedFiles)
  const summary = summarizeAssetCoverage(items)
  return {
    source: 'lexical',
    byId: new Map(items.map(item => [item.asset.asset_id ?? '', item])),
    summary: { total: summary.total, provided: summary.provided, missing: summary.missing },
  }
}

type CoverageItemEx = AssetCoverageItem & {
  matchedKind?: 'import' | 'library' | null
}

function buildGeminiCoverage(report: SandboxCoverageReport, assets: SandboxAsset[]): CoverageInfo {
  const reportById = new Map(report.matches.map(match => [match.asset_id, match]))
  const byId = new Map<string, AssetCoverageItem>()
  let provided = 0
  for (const asset of assets) {
    const match = reportById.get(asset.asset_id)
    if (match && match.matched_file) {
      provided += 1
      const item: CoverageItemEx = {
        asset,
        coverage: 'provided',
        importedFile: { name: match.matched_file, relativePath: match.matched_file },
        score: match.confidence ?? 1,
        matchReason: match.reasoning || 'Gemini match',
        matchedKind: match.matched_kind ?? 'import',
      }
      byId.set(asset.asset_id, item)
    } else {
      byId.set(asset.asset_id, {
        asset,
        coverage: 'missing',
        score: match?.confidence ?? 0,
        matchReason: match?.reasoning,
      })
    }
  }
  return { source: 'gemini', byId, summary: { total: assets.length, provided, missing: assets.length - provided } }
}

function PromptDialog({
  asset,
  runId,
  onClose,
}: {
  asset: SandboxAsset
  runId: string
  onClose: () => void
}) {
  const [payload, setPayload] = useState<PromptPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPayload(null)
    setError(null)
    fetch(`/api/sandbox/asset/${encodeURIComponent(asset.asset_id)}/prompt?run=${encodeURIComponent(runId)}`)
      .then(async response => {
        if (!response.ok) throw new Error(await response.text())
        return response.json() as Promise<PromptPayload>
      })
      .then(data => { if (!cancelled) setPayload(data) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Prompt unavailable') })
    return () => { cancelled = true }
  }, [asset.asset_id, runId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F141C66] px-4">
      <div className="flex max-h-[82dvh] w-full max-w-2xl flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Scenario prompt</p>
            <h3 className="mt-1 truncate text-base font-bold text-[#0F141C]">{asset.name || asset.asset_id}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg border border-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-all hover:bg-gray-50">
            Close
          </button>
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-xl border border-gray-100 bg-[#F6F9FC] p-4">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : payload ? (
            <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-600">
              {payload.scenario_prompt || payload.visual_description || '(no prompt)'}
            </pre>
          ) : (
            <div className="space-y-2 animate-pulse">
              <div className="h-2 w-24 rounded-full bg-gray-200" />
              <div className="h-2 w-full rounded-full bg-gray-100" />
              <div className="h-2 w-3/4 rounded-full bg-gray-100" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function RegenerateDialog({
  asset,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  asset: SandboxAsset
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (text: string) => void
}) {
  const [text, setText] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F141C66] px-4">
      <div className="w-full max-w-xl rounded-2xl border border-gray-100 bg-white p-5 shadow-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Regenerate asset</p>
        <h3 className="mt-1 text-base font-bold text-[#0F141C]">{asset.name || asset.asset_id}</h3>
        <p className="mt-2 text-xs leading-relaxed text-gray-500">
          Optional refinement is appended to the style-locked Scenario prompt for this asset only.
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={event => setText(event.target.value)}
          placeholder="Make the silhouette cleaner, keep the same palette and outline weight"
          rows={4}
          className="mt-4 w-full resize-none rounded-xl border border-gray-200 bg-white p-3 text-sm text-[#0F141C] outline-none transition-colors placeholder:text-gray-300 focus:border-[#0055FF]"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={isSubmitting} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-500 transition-all hover:bg-gray-50 disabled:opacity-40">
            Cancel
          </button>
          <button onClick={() => onSubmit(text)} disabled={isSubmitting} className="rounded-xl bg-[#0055FF] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#0044DD] disabled:opacity-40">
            {isSubmitting ? 'Starting…' : 'Regenerate'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AssetRow({
  asset,
  coverage,
  isRunning,
  selectable,
  selected,
  onToggleSelect,
  onPrompt,
  onRegenerate,
}: {
  asset: SandboxAsset
  coverage: AssetCoverageItem
  isRunning: boolean
  selectable: boolean
  selected: boolean
  onToggleSelect: (assetId: string) => void
  onPrompt: (asset: SandboxAsset) => void
  onRegenerate: (asset: SandboxAsset) => void
}) {
  const imageUrl = asset.final_url || asset.crop_url
  const showingSource = !asset.final_url && !!asset.crop_url
  const status = isRunning ? 'running' : asset.status
  const matchedLabel = coverage.importedFile?.relativePath || coverage.importedFile?.name
  // Verb of the primary action button:
  //   - never generated yet → "Generate"
  //   - already done OR provided by import/library → "Regenerate" (let user override)
  //   - error → "Retry"
  const hasArtifact = !!asset.final_url
  const hasImport = coverage.coverage === 'provided'
  const actionLabel = isRunning
    ? 'Running…'
    : asset.status === 'error'
      ? 'Retry'
      : hasArtifact || hasImport
        ? 'Regenerate'
        : 'Generate'

  return (
    <div className={`grid grid-cols-[24px_64px_minmax(0,1fr)] items-start gap-3 rounded-xl border bg-white p-2.5 shadow-sm transition-colors ${selected ? 'border-[#0055FF]' : 'border-gray-100'}`}>
      <div className="flex h-16 items-center justify-center">
        {selectable ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(asset.asset_id)}
            className="h-4 w-4 cursor-pointer accent-[#0055FF]"
          />
        ) : (
          <div className="h-4 w-4" />
        )}
      </div>
      <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-[linear-gradient(45deg,#eef2f7_25%,transparent_25%),linear-gradient(-45deg,#eef2f7_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eef2f7_75%),linear-gradient(-45deg,transparent_75%,#eef2f7_75%)] bg-[length:14px_14px] bg-[position:0_0,0_7px,7px_-7px,-7px_0]">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={asset.name || asset.asset_id}
            className={`max-h-full max-w-full object-contain ${showingSource ? 'opacity-60' : ''}`}
            title={showingSource ? 'Source frame from video — not yet generated' : asset.name || asset.asset_id}
          />
        ) : (
          <span className="text-[10px] font-medium text-gray-300">no preview</span>
        )}
        {showingSource && (
          <span className="absolute bottom-0 left-0 right-0 bg-[#0F141C] bg-opacity-70 px-1 py-0.5 text-center text-[8px] font-semibold uppercase tracking-wider text-white">
            source
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-[#0F141C]">{asset.name || asset.asset_id}</div>
            <div className="truncate font-mono text-[10px] text-gray-400">{asset.asset_id}</div>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(asset.status, isRunning)}`}>
            {status}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {asset.category && <span className="rounded-full border border-gray-100 bg-[#F6F9FC] px-2 py-0.5 text-[10px] font-semibold text-gray-500">{asset.category}</span>}
          {asset.route && <span className="rounded-full border border-gray-100 bg-[#F6F9FC] px-2 py-0.5 text-[10px] font-semibold text-gray-500">{asset.route}</span>}
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${coverageClass(coverage.coverage, (coverage as CoverageItemEx).matchedKind)}`}>
            {coverageLabel(coverage.coverage, (coverage as CoverageItemEx).matchedKind)}
          </span>
        </div>
        {matchedLabel && (
          <p className="mt-1 truncate text-[10px] text-gray-400" title={coverage.matchReason}>
            matched {matchedLabel}{coverage.score ? ` · ${(coverage.score * 100).toFixed(0)}%` : ''}
          </p>
        )}
        {asset.last_user_refinement && <p className="mt-1 truncate text-[10px] text-[#0055FF]">{asset.last_user_refinement}</p>}
        {asset.error && <p className="mt-1 truncate text-[10px] text-red-500" title={asset.error}>{asset.error}</p>}
        <div className="mt-2 flex gap-2">
          <button onClick={() => onRegenerate(asset)} disabled={isRunning} className="rounded-lg bg-[#0F141C] px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-[#1e2a3a] disabled:cursor-not-allowed disabled:opacity-40">
            {actionLabel}
          </button>
          <button onClick={() => onPrompt(asset)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-all hover:bg-gray-50">
            Prompt
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AssetReviewPanel({ runId, importedFiles, rawImportedFiles, autoMode = false }: AssetReviewPanelProps) {
  const [manifest, setManifest] = useState<SandboxManifest | null>(null)
  const [jobs, setJobs] = useState<SandboxJob[]>([])
  const [coverageReport, setCoverageReport] = useState<SandboxCoverageReport | null>(null)
  const [coverageStatus, setCoverageStatus] = useState<'idle' | 'matching' | 'done' | 'error'>('idle')
  const [coverageError, setCoverageError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [promptAsset, setPromptAsset] = useState<SandboxAsset | null>(null)
  const [regenAsset, setRegenAsset] = useState<SandboxAsset | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [hint, setHint] = useState('')
  const [isReanalyzing, setIsReanalyzing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationKickedOff, setGenerationKickedOff] = useState(false)

  const coverageStartedRef = useRef(false)
  const autoGenStartedRef = useRef(false)

  const load = useCallback(async () => {
    if (!runId) return
    const [manifestResponse, jobsResponse, coverageResponse] = await Promise.all([
      fetch(`/api/sandbox/manifest?run=${encodeURIComponent(runId)}`, { cache: 'no-store' }),
      fetch(`/api/sandbox/jobs?run=${encodeURIComponent(runId)}`, { cache: 'no-store' }),
      fetch(`/api/sandbox/coverage?run=${encodeURIComponent(runId)}`, { cache: 'no-store' }),
    ])
    if (!manifestResponse.ok) throw new Error(await manifestResponse.text())
    if (!jobsResponse.ok) throw new Error(await jobsResponse.text())
    setManifest(await manifestResponse.json())
    const jobsPayload = await jobsResponse.json() as { jobs?: SandboxJob[] }
    setJobs(jobsPayload.jobs ?? [])
    if (coverageResponse.ok) {
      const data = await coverageResponse.json() as { report: SandboxCoverageReport | null }
      if (data.report) setCoverageReport(data.report)
    }
    setError(null)
  }, [runId])

  useEffect(() => {
    if (!runId) return
    let cancelled = false
    const safeLoad = () => {
      load().catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load asset state')
      })
    }
    safeLoad()
    const interval = window.setInterval(safeLoad, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [load, runId])

  // Kick off Gemini coverage matching once we have a manifest with assets and at least one import.
  useEffect(() => {
    if (!runId || coverageStartedRef.current) return
    if (!manifest || manifest.assets.length === 0) return
    if (!rawImportedFiles || rawImportedFiles.length === 0) return
    coverageStartedRef.current = true
    setCoverageStatus('matching')
    setCoverageError(null)
    const formData = new FormData()
    formData.append('run_id', runId)
    for (const file of rawImportedFiles) formData.append('files', file)
    fetch('/api/sandbox/coverage', { method: 'POST', body: formData })
      .then(async response => {
        if (!response.ok) throw new Error(await response.text())
        return response.json()
      })
      .then(() => setCoverageStatus('matching'))
      .catch(err => {
        setCoverageStatus('error')
        setCoverageError(err instanceof Error ? err.message : 'Coverage matching failed to start')
        coverageStartedRef.current = false
      })
  }, [manifest, rawImportedFiles, runId])

  // Mark coverage done when the report shows up.
  useEffect(() => {
    if (coverageReport && coverageStatus === 'matching') setCoverageStatus('done')
  }, [coverageReport, coverageStatus])

  const runningIds = useMemo(
    () => new Set(jobs.filter(job => job.status === 'running' && job.kind === 'regenerate').map(job => job.asset_id ?? '')),
    [jobs],
  )

  const coverage = useMemo<CoverageInfo>(() => {
    if (!manifest) {
      return { source: 'lexical', byId: new Map(), summary: { total: 0, provided: 0, missing: 0 } }
    }
    if (coverageReport) return buildGeminiCoverage(coverageReport, manifest.assets)
    return buildLexicalCoverage(manifest.assets, importedFiles)
  }, [manifest, coverageReport, importedFiles])

  const missingAssetIds = useMemo(() => {
    if (!manifest) return [] as string[]
    return manifest.assets
      .filter(asset => coverage.byId.get(asset.asset_id)?.coverage === 'missing')
      .filter(asset => asset.status !== 'done')
      .map(asset => asset.asset_id)
  }, [manifest, coverage])

  const generatedDone = manifest?.assets.filter(asset => asset.status === 'done').length ?? 0
  const generatedErrors = manifest?.assets.filter(asset => asset.status === 'error').length ?? 0
  const generationJob = useMemo(
    () => [...jobs].filter(job => job.kind === 'generate').sort((a, b) => b.started_at - a.started_at)[0],
    [jobs],
  )
  const reanalyzeJob = useMemo(
    () => [...jobs].filter(job => job.kind === 'reanalyze').sort((a, b) => b.started_at - a.started_at)[0],
    [jobs],
  )

  const handleGenerate = useCallback(async (assetIds: string[]) => {
    if (!runId || assetIds.length === 0) return
    setIsGenerating(true)
    try {
      const response = await fetch('/api/sandbox/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId, asset_ids: assetIds }),
      })
      if (!response.ok) throw new Error(await response.text())
      setGenerationKickedOff(true)
      setSelected(new Set())
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed to start')
    } finally {
      setIsGenerating(false)
    }
  }, [load, runId])

  // Auto mode: once coverage is settled and there are missing assets, generate them all.
  useEffect(() => {
    if (!autoMode) return
    if (autoGenStartedRef.current) return
    if (!manifest || manifest.assets.length === 0) return
    if (rawImportedFiles && rawImportedFiles.length > 0 && coverageStatus !== 'done') return
    if (missingAssetIds.length === 0) return
    autoGenStartedRef.current = true
    handleGenerate(missingAssetIds)
  }, [autoMode, coverageStatus, handleGenerate, manifest, missingAssetIds, rawImportedFiles])

  const handleRegenerate = useCallback(async (asset: SandboxAsset, additionalPrompt: string) => {
    if (!runId) return
    setIsSubmitting(true)
    try {
      const response = await fetch('/api/sandbox/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId, asset_id: asset.asset_id, additional_prompt: additionalPrompt }),
      })
      if (!response.ok) throw new Error(await response.text())
      setRegenAsset(null)
      await load()
    } finally {
      setIsSubmitting(false)
    }
  }, [load, runId])

  const handleReanalyze = useCallback(async () => {
    if (!runId || !hint.trim()) return
    setIsReanalyzing(true)
    try {
      const response = await fetch('/api/sandbox/reanalyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId, hint }),
      })
      if (!response.ok) throw new Error(await response.text())
      setHint('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reanalyze failed to start')
    } finally {
      setIsReanalyzing(false)
    }
  }, [hint, load, runId])

  const toggleSelect = useCallback((assetId: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(assetId)) next.delete(assetId)
      else next.add(assetId)
      return next
    })
  }, [])

  const selectAllMissing = useCallback(() => setSelected(new Set(missingAssetIds)), [missingAssetIds])
  const clearSelection = useCallback(() => setSelected(new Set()), [])

  if (!runId) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-400">
        Upload a video to start a sandbox run.
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-700">Asset sandbox unavailable</p>
        <p className="mt-1 text-xs leading-relaxed text-red-600">{error}</p>
      </div>
    )
  }

  // Manifest may not exist yet (analysis still running). Show the stage
  // tracker even in that state so the user knows what's happening.
  const hasImports = !!(rawImportedFiles && rawImportedFiles.length > 0)
  if (!manifest || manifest.assets.length === 0) {
    const stages = deriveStages({
      jobs,
      manifest,
      coverageReport,
      hasImports,
      generationKickedOff: false,
      isReanalyzing,
      reanalyzeJob,
    })
    return (
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Asset resolution</p>
          <h2 className="mt-1 text-lg font-bold text-[#0F141C]">Run {runId}</h2>
          <p className="mt-0.5 text-[11px] text-gray-400">
            Waiting for the analysis pipeline to land assets. This usually takes 30–90s.
          </p>
        </div>
        <StageTracker stages={stages} />
      </div>
    )
  }

  const selectable = !autoMode
  const selectedCount = selected.size
  const hasGenerationRunning = generationJob?.status === 'running' || isGenerating
  const hasReanalyzeRunning = reanalyzeJob?.status === 'running' || isReanalyzing

  const stages = deriveStages({
    jobs,
    manifest,
    coverageReport,
    hasImports,
    generationKickedOff,
    isReanalyzing,
    reanalyzeJob,
  })

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <StageTracker stages={stages} />
      <div className="shrink-0 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Asset resolution</p>
            <h2 className="mt-1 text-lg font-bold text-[#0F141C]">{formatRunName(manifest.run_id)}</h2>
            <p className="mt-0.5 text-[11px] text-gray-400">
              Coverage source: <span className="font-semibold text-[#0F141C]">{coverage.source === 'gemini' ? 'Gemini Flash' : 'lexical'}</span>
              {coverageStatus === 'matching' && ' · matching…'}
              {coverageStatus === 'error' && coverageError && <span className="text-red-500"> · {coverageError}</span>}
              {' '} · Mode: <span className="font-semibold text-[#0F141C]">{autoMode ? 'auto' : 'manual'}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-xl border border-gray-100 bg-[#F6F9FC] px-3 py-2">
              <div className="text-sm font-bold text-[#0F141C]">{coverage.summary.provided}/{coverage.summary.total}</div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Imported</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-[#F6F9FC] px-3 py-2">
              <div className="text-sm font-bold text-[#0F141C]">{generatedDone}/{manifest.assets.length}</div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Generated</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-[#F6F9FC] px-3 py-2">
              <div className="text-sm font-bold text-[#0F141C]">{generatedErrors}</div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Issues</div>
            </div>
          </div>
        </div>

        {manifest.art_style && (
          <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-gray-500">
            <span className="font-semibold text-[#0F141C]">Style lock:</span> {manifest.art_style.summary}
            {manifest.art_style.palette ? ` · ${manifest.art_style.palette}` : ''}
          </p>
        )}

        {hasGenerationRunning && (
          <div className="mt-3 rounded-lg border border-[#0055FF1F] bg-[#0055FF08] px-3 py-2 text-xs font-medium text-[#0055FF]">
            Generation running · {manifest.assets.filter(a => a.status === 'pending').length} pending
          </div>
        )}
        {hasReanalyzeRunning && (
          <div className="mt-3 rounded-lg border border-[#0055FF1F] bg-[#0055FF08] px-3 py-2 text-xs font-medium text-[#0055FF]">
            Re-analyzing video for missing assets…
          </div>
        )}

        {!autoMode && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-100 bg-[#F6F9FC] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Missing assets hint</p>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                Tell Gemini what it missed. It will rerun analysis and append new entries to the manifest.
              </p>
              <textarea
                value={hint}
                onChange={event => setHint(event.target.value)}
                placeholder='e.g. "the dragon enemy at second 4 was missed"'
                rows={2}
                className="mt-2 w-full resize-none rounded-lg border border-gray-200 bg-white p-2 text-xs text-[#0F141C] outline-none transition-colors placeholder:text-gray-300 focus:border-[#0055FF]"
              />
              <button
                onClick={handleReanalyze}
                disabled={!hint.trim() || hasReanalyzeRunning}
                className="mt-2 rounded-lg bg-[#0F141C] px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-[#1e2a3a] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {hasReanalyzeRunning ? 'Re-analyzing…' : 'Re-analyze with hint'}
              </button>
            </div>

            <div className="rounded-xl border border-gray-100 bg-[#F6F9FC] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Generate selected</p>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                Pick assets below or use the shortcuts. Generation runs Scenario for each selected asset.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={selectAllMissing} disabled={missingAssetIds.length === 0} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-all hover:bg-white disabled:opacity-40">
                  Select missing ({missingAssetIds.length})
                </button>
                <button onClick={clearSelection} disabled={selectedCount === 0} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-all hover:bg-white disabled:opacity-40">
                  Clear
                </button>
                <button
                  onClick={() => handleGenerate([...selected])}
                  disabled={selectedCount === 0 || hasGenerationRunning}
                  className="rounded-lg bg-[#0055FF] px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-[#0044DD] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {hasGenerationRunning ? 'Generating…' : `Generate ${selectedCount || ''}`.trim()}
                </button>
              </div>
            </div>
          </div>
        )}

        {autoMode && missingAssetIds.length > 0 && !generationKickedOff && (
          <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            <span className="font-bold">⚠ Auto mode active</span> · will generate{' '}
            <span className="font-bold">{missingAssetIds.length}</span> missing asset(s) once coverage is ready.
            Switch to manual mode now to pick a subset.
          </div>
        )}
        {generationKickedOff && (
          <div className="mt-3 rounded-lg border border-[#0055FF1F] bg-[#0055FF08] px-3 py-2 text-xs font-medium text-[#0055FF]">
            Generation kicked off · Scenario is processing the queue. Watch the cards flip from{' '}
            <span className="font-mono">pending</span> → <span className="font-mono">running</span> → <span className="font-mono">done</span>.
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto pr-1">
        <div className="grid gap-3 xl:grid-cols-2">
          {[...manifest.assets]
            .sort((a, b) => {
              // Missing assets float to the top so the user sees what still
              // needs generation first; provided ones (imported / library)
              // sink to the bottom.
              const ca = coverage.byId.get(a.asset_id)?.coverage ?? 'missing'
              const cb = coverage.byId.get(b.asset_id)?.coverage ?? 'missing'
              if (ca !== cb) return ca === 'missing' ? -1 : 1
              return a.asset_id.localeCompare(b.asset_id)
            })
            .map(asset => {
              const assetCoverage = coverage.byId.get(asset.asset_id) ?? {
                asset,
                coverage: 'missing' as const,
                score: 0,
              }
              return (
                <AssetRow
                  key={asset.asset_id}
                  asset={asset}
                  coverage={assetCoverage}
                  isRunning={runningIds.has(asset.asset_id)}
                  selectable={selectable}
                  selected={selected.has(asset.asset_id)}
                  onToggleSelect={toggleSelect}
                  onPrompt={setPromptAsset}
                  onRegenerate={setRegenAsset}
                />
              )
            })}
        </div>
      </div>

      {promptAsset && <PromptDialog asset={promptAsset} runId={runId} onClose={() => setPromptAsset(null)} />}
      {regenAsset && (
        <RegenerateDialog
          asset={regenAsset}
          isSubmitting={isSubmitting}
          onClose={() => setRegenAsset(null)}
          onSubmit={text => {
            handleRegenerate(regenAsset, text).catch(err => {
              setError(err instanceof Error ? err.message : 'Regeneration failed')
            })
          }}
        />
      )}
    </div>
  )
}
