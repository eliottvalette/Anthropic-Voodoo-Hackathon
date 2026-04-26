// Browser pipeline orchestrator — wires probe → P1 → P2 → P3 → P4 with
// progress callbacks the UI can subscribe to.

import { probe } from './probe'
import { runP1Video } from './p1-video'
import { runP2Assets } from './p2-assets'
import { runP3Aggregator } from './p3-aggregator'
import { runP4Codegen } from './p4-codegen'
import type {
  ProbeReport,
  VideoAnalysis,
  AssetMapping,
  GameSpec,
  CodegenResult,
  StageId,
  StageEvent,
  SubCallEvent,
  RunMeta,
} from './types'

export type RunInput = {
  videoFile: File
  assetFiles: File[]
  variant?: string
  userBrief?: string
  // If provided, the P1 video analysis stage is skipped and this value is
  // used directly. Lets callers run P1 in parallel with an upstream stage
  // (e.g. our nico-sandbox asset-generation step) and feed the result in
  // here, so the user's wait covers both rather than running them serially.
  precomputedVideoAnalysis?: VideoAnalysis
}

export type RunCallbacks = {
  onStageStart?: (stage: StageId) => void
  onStageProgress?: (stage: StageId, subCalls: SubCallEvent[]) => void
  onStageDone?: (stage: StageId, payload: unknown) => void
  onStageError?: (stage: StageId, error: string) => void
  onAwaitReview?: (stage: StageId, payload: unknown) => Promise<'accept' | 'retry' | { type: 'correct'; text: string }>
  onLog?: (msg: string) => void
}

export async function runPipeline(input: RunInput, cbs: RunCallbacks = {}): Promise<RunMeta> {
  const variant = input.variant ?? '_default'
  const runId = newRunId()
  const startedAt = new Date().toISOString()
  const t0 = performance.now()

  const meta: RunMeta = {
    runId,
    startedAt,
    endedAt: '',
    totalLatencyMs: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
  }

  const announce = (s: StageId) => cbs.onStageStart?.(s)
  const progress = (s: StageId, subs: SubCallEvent[]) => cbs.onStageProgress?.(s, subs)
  const done = (s: StageId, payload: unknown) => cbs.onStageDone?.(s, payload)
  const fail = (s: StageId, e: unknown) => cbs.onStageError?.(s, e instanceof Error ? e.message : String(e))

  // ── Stage 0: probe ──────────────────────────────────────────────────────────
  announce('probe')
  let probeReport: ProbeReport
  try {
    probeReport = await probe(input.videoFile, input.assetFiles)
    meta.probe = probeReport
    done('probe', probeReport)
    if (cbs.onAwaitReview) {
      const dec = await cbs.onAwaitReview('probe', probeReport)
      // probe is informational; only retry has any meaning here. For V1: ignore decision.
      void dec
    }
  } catch (e) { fail('probe', e); throw e }

  // ── Stage 1: P1 video analysis ──────────────────────────────────────────────
  announce('video')
  let videoAnalysis: VideoAnalysis
  try {
    if (input.precomputedVideoAnalysis) {
      // Caller already ran P1 in parallel with an upstream stage. Use the
      // cached result and skip the actual call.
      videoAnalysis = input.precomputedVideoAnalysis
      meta.videoAnalysis = videoAnalysis
      done('video', videoAnalysis)
      if (cbs.onAwaitReview) {
        const dec = await cbs.onAwaitReview('video', videoAnalysis)
        // Retry/correct on a precomputed analysis isn't well-defined; treat
        // anything other than 'accept' as accept for now.
        void dec
      }
    } else {
      let lastSubs: SubCallEvent[] = []
      while (true) {
        const r = await runP1Video(input.videoFile, variant, subs => { lastSubs = subs; progress('video', subs) })
        videoAnalysis = r.analysis
        meta.videoAnalysis = videoAnalysis
        done('video', videoAnalysis)
        if (!cbs.onAwaitReview) break
        const dec = await cbs.onAwaitReview('video', videoAnalysis)
        if (dec === 'accept') break
        if (dec === 'retry') continue
        // 'correct' — feed correction text on the next iteration via variant override (out of V1 scope; loop without)
        break
      }
      meta.totalTokensIn += sumTokens(meta.videoAnalysis ? lastSubs : [], 'in')
      meta.totalTokensOut += sumTokens(meta.videoAnalysis ? lastSubs : [], 'out')
    }
  } catch (e) { fail('video', e); throw e }

  // ── Stage 2: P2 assets ──────────────────────────────────────────────────────
  announce('assets')
  let assetMapping: AssetMapping
  try {
    while (true) {
      const r = await runP2Assets(input.assetFiles, videoAnalysis!, variant, subs => progress('assets', subs))
      assetMapping = r.mapping
      meta.assetMapping = assetMapping
      done('assets', assetMapping)
      if (!cbs.onAwaitReview) break
      const dec = await cbs.onAwaitReview('assets', assetMapping)
      if (dec === 'accept') break
      if (dec === 'retry') continue
      break
    }
  } catch (e) { fail('assets', e); throw e }

  // ── Stage 3: P3 game spec ──────────────────────────────────────────────────
  announce('gameSpec')
  let gameSpec: GameSpec
  try {
    while (true) {
      const r = await runP3Aggregator(videoAnalysis!, assetMapping!, variant, subs => progress('gameSpec', subs), input.userBrief)
      gameSpec = r.gameSpec
      meta.gameSpec = gameSpec
      done('gameSpec', gameSpec)
      if (!cbs.onAwaitReview) break
      const dec = await cbs.onAwaitReview('gameSpec', gameSpec)
      if (dec === 'accept') break
      if (dec === 'retry') continue
      break
    }
  } catch (e) { fail('gameSpec', e); throw e }

  // ── Stage 4: P4 codegen + verify ───────────────────────────────────────────
  announce('codegen')
  let codegen: CodegenResult
  try {
    codegen = await runP4Codegen(gameSpec!, input.assetFiles, variant, subs => progress('codegen', subs))
    meta.codegen = codegen
    done('codegen', codegen)
  } catch (e) { fail('codegen', e); throw e }

  meta.endedAt = new Date().toISOString()
  meta.totalLatencyMs = performance.now() - t0
  return meta
}

function newRunId(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `run-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`
}

function sumTokens(subs: SubCallEvent[], kind: 'in' | 'out'): number {
  return subs.reduce((s, c) => s + (kind === 'in' ? (c.tokensIn ?? 0) : (c.tokensOut ?? 0)), 0)
}
