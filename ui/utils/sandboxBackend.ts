import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { SandboxAsset, SandboxCoverageReport, SandboxJob, SandboxJobKind, SandboxManifest } from './sandboxTypes'

type JsonObject = Record<string, unknown>

type RegenerateJobStore = {
  jobs: Map<string, SandboxJob>
}

const globalForSandbox = globalThis as typeof globalThis & {
  __sandboxRegenerateJobs?: RegenerateJobStore
}

const REPO_ROOT = path.resolve(process.cwd(), '..')
const SANDBOX_ROOT = path.resolve(process.env.SANDBOX_PIPELINE_ROOT ?? path.join(REPO_ROOT, 'nico-sandbox'))
const RUNS_ROOT = path.join(SANDBOX_ROOT, 'runs')
const PYTHON_PATH = process.env.SANDBOX_PYTHON ?? path.join(REPO_ROOT, '.venv', 'bin', 'python')

function probePython(pythonPath: string): { ok: boolean; reason?: string } {
  try {
    if (!existsSync(pythonPath)) {
      return { ok: false, reason: `Python binary not found: ${pythonPath}` }
    }
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    execFileSync(pythonPath, ['-c', 'import imageio_ffmpeg, google.genai, PIL'], { stdio: 'pipe', timeout: 5000 })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: `Python module probe failed: ${message.slice(0, 300)}` }
  }
}

let _pythonProbe: { ok: boolean; reason?: string } | null = null
function getPythonProbe(): { ok: boolean; reason?: string } {
  if (_pythonProbe) return _pythonProbe
  _pythonProbe = probePython(PYTHON_PATH)
  if (!_pythonProbe.ok) {
    console.warn(`[sandboxBackend] Python health check FAILED — pipeline jobs will likely fail.\n  PYTHON_PATH=${PYTHON_PATH}\n  Reason: ${_pythonProbe.reason}\n  Fix: ensure ${PYTHON_PATH} exists and has imageio_ffmpeg, google-genai, pillow installed, OR set SANDBOX_PYTHON env var to a working interpreter.`)
  }
  return _pythonProbe
}

function jobStore(): RegenerateJobStore {
  if (!globalForSandbox.__sandboxRegenerateJobs) {
    globalForSandbox.__sandboxRegenerateJobs = { jobs: new Map() }
  }
  return globalForSandbox.__sandboxRegenerateJobs
}

function readJson(filePath: string): JsonObject {
  return JSON.parse(readFileSync(filePath, 'utf8')) as JsonObject
}

function safeRunId(runId: string | null | undefined): string {
  if (!runId || !runId.trim()) {
    throw new Error('runId is required (received null/empty)')
  }
  const cleaned = runId.replace(/[^a-zA-Z0-9._-]/g, '')
  if (!cleaned) {
    throw new Error(`runId contains no valid characters: ${runId}`)
  }
  return cleaned
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function resolveRunDir(runId?: string | null): { runId: string; runDir: string } {
  const normalized = safeRunId(runId)
  const runDir = path.resolve(RUNS_ROOT, normalized)
  if (!isInside(RUNS_ROOT, runDir)) {
    throw new Error(`Invalid run id: ${runId}`)
  }
  return { runId: normalized, runDir }
}

export function listSandboxRuns(): Array<{ id: string; path: string; updatedAt?: number }> {
  if (!existsSync(RUNS_ROOT)) return []
  return readdirSync(RUNS_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const runPath = path.join(RUNS_ROOT, entry.name)
      return {
        id: entry.name,
        path: runPath,
        updatedAt: statSync(runPath).mtimeMs,
      }
    })
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

function isPreviewableImage(filePath: string): boolean {
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(path.extname(filePath).toLowerCase())
}

function fileUrl(runId: string, kind: 'final' | 'crop', absolutePath: unknown, root: string): string | undefined {
  if (!absolutePath || typeof absolutePath !== 'string') return undefined
  const resolved = path.resolve(absolutePath)
  if (kind === 'final' && !isPreviewableImage(resolved)) return undefined
  const resolvedRoot = path.resolve(root)
  if (!isInside(resolvedRoot, resolved)) return undefined
  const relative = path.relative(resolvedRoot, resolved).split(path.sep).join('/')
  return `/api/sandbox/file?run=${encodeURIComponent(runId)}&kind=${kind}&path=${encodeURIComponent(relative)}`
}

function readAssetsFromPayload(payload: JsonObject): JsonObject[] {
  return Array.isArray(payload.assets) ? (payload.assets.filter(Boolean) as JsonObject[]) : []
}

function indexByAssetId(assets: JsonObject[]): Map<string, JsonObject> {
  return new Map(
    assets
      .map(asset => [String(asset.asset_id ?? ''), asset] as const)
      .filter(([assetId]) => assetId.length > 0),
  )
}

function resultStatus(result: JsonObject | undefined): SandboxAsset['status'] {
  if (result?.error) return 'error'
  if (typeof result?.final_path === 'string' && existsSync(result.final_path)) return 'done'
  return 'pending'
}

export function readSandboxManifest(runIdInput?: string | null): SandboxManifest {
  const { runId, runDir } = resolveRunDir(runIdInput)
  const manifestPath = path.join(runDir, 'manifests', '05_scenario_automation_manifest.json')
  const extractedPath = path.join(runDir, 'manifests', '03_extracted_assets_manifest.json')
  const geminiPath = path.join(runDir, 'manifests', '01_gemini_video_manifest.json')
  const finalAssetsRoot = path.join(runDir, 'final-assets')
  const cropsRoot = path.join(runDir, 'extracted', 'crops')

  const automationPayload = existsSync(manifestPath) ? readJson(manifestPath) : { status: 'missing', assets: [] }
  const extractedPayload = existsSync(extractedPath) ? readJson(extractedPath) : { assets: [] }
  const geminiPayload = existsSync(geminiPath) ? readJson(geminiPath) : { assets: [] }
  const extractedAssets = readAssetsFromPayload(extractedPayload)
  const resultsById = indexByAssetId(readAssetsFromPayload(automationPayload))
  const extractedById = indexByAssetId(extractedAssets)
  // Only expose assets once 03_extracted_assets_manifest.json has been
  // written. Falling back to the raw gemini inventory lets the user click
  // Generate during the extraction gap, which crashes the Python pipeline
  // (run_full_asset_pipeline.py expects 03_*.json when --skip-extraction
  // is set, and Generate is always invoked with that flag).
  const extractionComplete = extractedAssets.length > 0
  const sourceAssets = extractedAssets

  const assets = sourceAssets
    .map((source): SandboxAsset => {
      const assetId = String(source.asset_id ?? '')
      const result = resultsById.get(assetId)
      const extracted = extractedById.get(assetId) ?? source
      return {
        asset_id: assetId,
        name: typeof source.name === 'string' ? source.name : undefined,
        category: typeof source.category === 'string' ? source.category : undefined,
        priority: typeof source.priority === 'number' || typeof source.priority === 'string' ? source.priority : undefined,
        route: typeof result?.route === 'string' ? result.route : undefined,
        status: resultStatus(result),
        error: typeof result?.error === 'string' ? result.error : undefined,
        final_url: fileUrl(runId, 'final', result?.final_path, finalAssetsRoot),
        crop_url: fileUrl(runId, 'crop', extracted.crop_path, cropsRoot),
        last_user_refinement: typeof result?.last_user_refinement === 'string' ? result.last_user_refinement : undefined,
        visual_description: typeof extracted.visual_description === 'string' ? extracted.visual_description : undefined,
      }
    })
    .filter(asset => asset.asset_id)
    .sort((a, b) => a.asset_id.localeCompare(b.asset_id))

  return {
    run_id: runId,
    run_dir: runDir,
    status: typeof automationPayload.status === 'string' ? automationPayload.status : undefined,
    updated_at: typeof automationPayload.updated_at === 'string' ? automationPayload.updated_at : undefined,
    completed_assets: typeof automationPayload.completed_assets === 'number' ? automationPayload.completed_assets : undefined,
    failed_assets: typeof automationPayload.failed_assets === 'number' ? automationPayload.failed_assets : undefined,
    planned_assets: typeof automationPayload.planned_assets === 'number' ? automationPayload.planned_assets : assets.length,
    art_style: (geminiPayload.art_style as SandboxManifest['art_style']) ?? null,
    extraction_complete: extractionComplete,
    assets,
  }
}

export async function readSandboxFile(
  runIdInput: string | null,
  kind: string | null,
  relativePath: string | null,
): Promise<{ buffer: Buffer; contentType: string }> {
  if (kind !== 'final' && kind !== 'crop') {
    throw new Error(`Invalid file kind: ${kind}`)
  }
  if (!relativePath) {
    throw new Error('Missing file path')
  }

  const { runDir } = resolveRunDir(runIdInput)
  const root = kind === 'final'
    ? path.join(runDir, 'final-assets')
    : path.join(runDir, 'extracted', 'crops')
  const filePath = path.resolve(root, relativePath)
  if (!isInside(path.resolve(root), filePath)) {
    throw new Error('File path escapes sandbox root')
  }

  const extension = path.extname(filePath).toLowerCase()
  const contentType = extension === '.jpg' || extension === '.jpeg'
    ? 'image/jpeg'
    : extension === '.webp'
      ? 'image/webp'
      : extension === '.gif'
        ? 'image/gif'
        : 'image/png'

  return { buffer: await readFile(filePath), contentType }
}

export function readSandboxAssetPrompt(runIdInput: string | null, assetId: string): JsonObject {
  const { runDir } = resolveRunDir(runIdInput)
  const extractedPath = path.join(runDir, 'manifests', '03_extracted_assets_manifest.json')
  if (!existsSync(extractedPath)) {
    throw new Error(`Missing extracted asset manifest for run ${runIdInput ?? 'B11'}`)
  }
  const extracted = readAssetsFromPayload(readJson(extractedPath))
  const asset = extracted.find(item => String(item.asset_id) === assetId)
  if (!asset) {
    throw new Error(`asset_id not found: ${assetId}`)
  }
  return {
    asset_id: assetId,
    scenario_prompt: asset.scenario_prompt,
    visual_description: asset.visual_description,
    category: asset.category,
    name: asset.name,
  }
}

export function getSandboxJobs(runId?: string | null): SandboxJob[] {
  const jobs = [...jobStore().jobs.values()]
  return runId ? jobs.filter(job => job.run_id === safeRunId(runId)) : jobs
}

export function startRegenerateJob({
  runId: runIdInput,
  assetId,
  additionalPrompt,
  resolution = '1K',
}: {
  runId?: string | null
  assetId: string
  additionalPrompt?: string
  resolution?: string
}): SandboxJob {
  const { runId, runDir } = resolveRunDir(runIdInput)
  const existing = getSandboxJobs(runId).find(job => job.asset_id === assetId && job.status === 'running')
  if (existing) return existing

  return spawnPipelineJob({
    runId,
    runDir,
    kind: 'regenerate',
    assetId,
    additionalPrompt,
    script: 'regenerate_asset_once.py',
    extraArgs: [
      '--asset-id',
      assetId,
      '--resolution',
      resolution,
      ...(additionalPrompt?.trim() ? ['--additional-prompt', additionalPrompt] : []),
    ],
  })
}

type SpawnPipelineJobInput = {
  runId: string
  runDir: string
  kind: SandboxJobKind
  script: string
  extraArgs?: string[]
  assetId?: string
  additionalPrompt?: string
  details?: Record<string, unknown>
  // run_full_asset_pipeline.py takes the video as positional and uses --out
  // for the run directory; the helper scripts (coverage/regen/reanalyze) take
  // --run. Default true → prepend --run; pass false for the full-pipeline CLI.
  passRunFlag?: boolean
}

function spawnPipelineJob(input: SpawnPipelineJobInput): SandboxJob {
  const jobId = randomUUID().slice(0, 10)
  const job: SandboxJob = {
    job_id: jobId,
    run_id: input.runId,
    kind: input.kind,
    asset_id: input.assetId,
    status: 'running',
    started_at: Date.now() / 1000,
    additional_prompt: input.additionalPrompt ?? '',
    details: input.details,
  }
  jobStore().jobs.set(jobId, job)

  const scriptPath = path.join(SANDBOX_ROOT, 'scripts', input.script)
  const passRun = input.passRunFlag !== false
  const args = passRun
    ? [scriptPath, '--run', input.runDir, ...(input.extraArgs ?? [])]
    : [scriptPath, ...(input.extraArgs ?? [])]
  const child = spawn(PYTHON_PATH, args, { cwd: REPO_ROOT, env: process.env })

  const stdout: string[] = []
  const stderr: string[] = []
  child.stdout.on('data', chunk => stdout.push(String(chunk)))
  child.stderr.on('data', chunk => stderr.push(String(chunk)))
  child.on('error', error => {
    job.status = 'error'
    job.finished_at = Date.now() / 1000
    const baseMsg = error instanceof Error ? error.message : String(error)
    const probe = getPythonProbe()
    job.error = probe.ok ? baseMsg : `${baseMsg}\n[hint] ${probe.reason}`
  })
  child.on('close', code => {
    job.finished_at = Date.now() / 1000
    job.exit_code = code
    job.stdout = stdout.join('').slice(-6000)
    job.stderr = stderr.join('').slice(-6000)
    if (code === 0) {
      job.status = 'done'
    } else {
      job.status = 'error'
      job.error = job.stderr || `${input.kind} exited with code ${code}`
    }
  })
  return job
}

function safeSlugFromName(name: string): string {
  const stem = name.replace(/\.[a-z0-9]+$/i, '')
  return stem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `run-${Date.now()}`
}

function uniqueRunId(seed: string): string {
  let candidate = seed
  let counter = 1
  while (existsSync(path.join(RUNS_ROOT, candidate))) {
    counter += 1
    candidate = `${seed}-${counter}`
  }
  return candidate
}

export function createEmptyRun(filename: string): { runId: string; videoPath: string } {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'source.mp4'
  const baseSlug = safeSlugFromName(safeName)
  const runId = uniqueRunId(baseSlug)
  const runDir = path.join(RUNS_ROOT, runId)
  mkdirSync(runDir, { recursive: true })
  const ext = path.extname(safeName).toLowerCase() || '.mp4'
  const videoPath = path.join(runDir, `source${ext}`)
  // Touch the file so subsequent appendChunk calls have something to grow.
  writeFileSync(videoPath, Buffer.alloc(0))
  return { runId, videoPath }
}

export async function appendChunkToRun(
  runIdInput: string | null,
  offset: number,
  body: ReadableStream<Uint8Array> | null,
): Promise<number> {
  if (!body) throw new Error('Missing chunk body stream')
  const { runDir } = resolveRunDir(runIdInput)
  const videoPath = findSourceVideo(runDir)
  if (!Number.isFinite(offset) || offset < 0) throw new Error('Invalid offset')

  const { createWriteStream } = await import('node:fs')
  // 'r+' would error if the file is shorter than offset; use append-only and
  // refuse non-monotonic offsets to stay simple.
  const currentSize = statSync(videoPath).size
  if (offset !== currentSize) {
    throw new Error(`Out-of-order chunk: expected offset=${currentSize}, got ${offset}`)
  }
  const writable = createWriteStream(videoPath, { flags: 'a' })
  const reader = body.getReader()
  let bytes = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        bytes += value.byteLength
        await new Promise<void>((resolve, reject) => {
          writable.write(value, err => (err ? reject(err) : resolve()))
        })
      }
    }
  } finally {
    await new Promise<void>(resolve => writable.end(resolve))
    try { reader.releaseLock() } catch { /* released */ }
  }
  return statSync(videoPath).size
}

export function finalizeRunUpload(runIdInput: string | null): SandboxJob {
  const { runId, runDir } = resolveRunDir(runIdInput)
  const videoPath = findSourceVideo(runDir)
  const totalBytes = statSync(videoPath).size
  if (totalBytes === 0) throw new Error('Cannot finalize: video is empty')

  return spawnPipelineJob({
    runId,
    runDir,
    kind: 'analyze',
    script: 'run_full_asset_pipeline.py',
    passRunFlag: false,
    extraArgs: [videoPath, '--out', runDir, '--dry-run-scenario'],
    details: { source_video: videoPath, bytes: totalBytes },
  })
}

export async function createRunFromStream({
  filename,
  body,
}: {
  filename: string
  body: ReadableStream<Uint8Array> | null
}): Promise<{ runId: string; job: SandboxJob }> {
  if (!body) throw new Error('Missing video body stream')
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'source.mp4'
  const baseSlug = safeSlugFromName(safeName)
  const runId = uniqueRunId(baseSlug)
  const runDir = path.join(RUNS_ROOT, runId)
  mkdirSync(runDir, { recursive: true })

  const ext = path.extname(safeName).toLowerCase() || '.mp4'
  const videoPath = path.join(runDir, `source${ext}`)

  // Read chunks from the Web ReadableStream and append each chunk to disk.
  // No SDK casts, no FormData parser — works with any body size.
  const { createWriteStream } = await import('node:fs')
  const writable = createWriteStream(videoPath)
  const reader = body.getReader()
  let totalBytes = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        totalBytes += value.byteLength
        await new Promise<void>((resolve, reject) => {
          writable.write(value, err => (err ? reject(err) : resolve()))
        })
      }
    }
  } finally {
    await new Promise<void>(resolve => writable.end(resolve))
    try { reader.releaseLock() } catch { /* already released */ }
  }
  if (totalBytes === 0) throw new Error('Empty video body')

  const job = spawnPipelineJob({
    runId,
    runDir,
    kind: 'analyze',
    script: 'run_full_asset_pipeline.py',
    passRunFlag: false,
    extraArgs: [videoPath, '--out', runDir, '--dry-run-scenario'],
    details: { source_video: videoPath, original_name: safeName, bytes: totalBytes },
  })
  return { runId, job }
}

function importsDirFor(runDir: string): string {
  return path.join(runDir, 'imports')
}

function findSourceVideo(runDir: string): string {
  const candidates = ['source.mp4', 'source.mov', 'source.webm', 'source.m4v']
  for (const name of candidates) {
    const candidate = path.join(runDir, name)
    if (existsSync(candidate)) return candidate
  }
  for (const entry of existsSync(runDir) ? readdirSync(runDir) : []) {
    if (/^source\./i.test(entry)) return path.join(runDir, entry)
  }
  throw new Error(`No source video found under ${runDir}`)
}

export async function uploadCoverageImports(runIdInput: string | null, files: File[]): Promise<string[]> {
  const { runDir } = resolveRunDir(runIdInput)
  const importsDir = importsDirFor(runDir)
  if (existsSync(importsDir)) rmSync(importsDir, { recursive: true, force: true })
  mkdirSync(importsDir, { recursive: true })
  const written: string[] = []
  for (const file of files) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    const safe = relative.replace(/\.\.+/g, '').replace(/^[/\\]+/, '')
    const target = path.join(importsDir, safe)
    if (!isInside(importsDir, target)) continue
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, Buffer.from(await file.arrayBuffer()))
    written.push(safe)
  }
  return written
}

export function startCoverageJob(runIdInput: string | null): SandboxJob {
  const { runId, runDir } = resolveRunDir(runIdInput)
  const importsDir = importsDirFor(runDir)
  return spawnPipelineJob({
    runId,
    runDir,
    kind: 'coverage',
    script: 'match_assets_with_gemini.py',
    extraArgs: ['--imports-dir', importsDir],
  })
}

export function readCoverageReport(runIdInput: string | null): SandboxCoverageReport | null {
  const { runDir } = resolveRunDir(runIdInput)
  const reportPath = path.join(runDir, 'manifests', '04_asset_coverage.json')
  if (!existsSync(reportPath)) return null
  return readJson(reportPath) as unknown as SandboxCoverageReport
}

export function startReanalyzeJob({
  runId: runIdInput,
  hint,
}: {
  runId: string | null
  hint: string
}): SandboxJob {
  if (!hint?.trim()) throw new Error('hint is required for reanalyze')
  const { runId, runDir } = resolveRunDir(runIdInput)
  return spawnPipelineJob({
    runId,
    runDir,
    kind: 'reanalyze',
    script: 'reanalyze_for_missing_assets.py',
    extraArgs: ['--hint', hint],
    additionalPrompt: hint,
  })
}

export function startGenerationJob({
  runId: runIdInput,
  assetIds,
  resolution = '1K',
  numOutputs = 1,
}: {
  runId: string | null
  assetIds: string[]
  resolution?: string
  numOutputs?: number
}): SandboxJob {
  const { runId, runDir } = resolveRunDir(runIdInput)
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    throw new Error('assetIds must be a non-empty array')
  }
  const idArgs = assetIds.flatMap(id => ['--asset-id', id])
  return spawnPipelineJob({
    runId,
    runDir,
    kind: 'generate',
    script: 'run_full_asset_pipeline.py',
    passRunFlag: false,
    extraArgs: [
      findSourceVideo(runDir),
      '--out',
      runDir,
      '--skip-video-gemini',
      '--skip-extraction',
      '--resolution',
      resolution,
      '--num-outputs',
      String(numOutputs),
      ...idArgs,
    ],
    details: { asset_ids: assetIds, resolution, num_outputs: numOutputs },
  })
}
