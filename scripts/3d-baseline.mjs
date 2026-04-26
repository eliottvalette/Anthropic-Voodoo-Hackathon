#!/usr/bin/env node
// Standalone Gemini video-analysis baseline for the 3D evolution prototype.
// Reads GEMINI_API_KEY from ui/.env, uploads the reference video via the Files
// API, waits until ACTIVE, then asks Gemini Pro to deconstruct the gameplay
// with a prompt specifically tuned for 3D / additive-iteration mechanics.
//
// Run: node scripts/3d-baseline.mjs
// Output: prints raw JSON to stdout, also writes scripts/3d-baseline.out.json

import fs from 'node:fs'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ENV_PATH = path.join(ROOT, 'ui/.env')
const VIDEO_PATH = path.join(ROOT, 'litterature/VIDEO-2026-04-26-01-57-41.mp4')
const OUT_PATH = path.join(__dirname, '3d-baseline.out.json')
const MODEL = 'gemini-2.5-pro'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com'

function loadEnv(file) {
  const raw = fs.readFileSync(file, 'utf8')
  const out = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const env = loadEnv(ENV_PATH)
const KEY = env.GEMINI_API_KEY
if (!KEY) { console.error('GEMINI_API_KEY missing in', ENV_PATH); process.exit(1) }

const log = (...a) => console.error('[baseline]', ...a)

async function uploadVideo(filePath) {
  const stat = fs.statSync(filePath)
  const buf = await readFile(filePath)
  const displayName = path.basename(filePath)
  const mimeType = 'video/mp4'

  log(`uploading ${displayName} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`)

  const startRes = await fetch(`${GEMINI_BASE}/upload/v1beta/files?key=${KEY}`, {
    method: 'POST',
    headers: {
      'x-goog-upload-protocol': 'resumable',
      'x-goog-upload-command': 'start',
      'x-goog-upload-header-content-length': String(stat.size),
      'x-goog-upload-header-content-type': mimeType,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ file: { displayName } }),
  })
  if (!startRes.ok) {
    throw new Error(`start failed ${startRes.status}: ${await startRes.text()}`)
  }
  const uploadUrl = startRes.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new Error('no x-goog-upload-url')

  const finRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'content-type': mimeType,
      'x-goog-upload-command': 'upload, finalize',
      'x-goog-upload-offset': '0',
    },
    body: buf,
  })
  if (!finRes.ok) {
    throw new Error(`finalize failed ${finRes.status}: ${await finRes.text()}`)
  }
  const j = await finRes.json()
  log('uploaded:', j.file.name, 'state=', j.file.state)
  return j.file
}

async function waitActive(file) {
  const rel = file.name
  const t0 = Date.now()
  while (file.state !== 'ACTIVE') {
    if (Date.now() - t0 > 5 * 60_000) throw new Error('timeout waiting for ACTIVE')
    await new Promise(r => setTimeout(r, 1500))
    const res = await fetch(`${GEMINI_BASE}/v1beta/${rel}?key=${KEY}`)
    if (!res.ok) throw new Error(`get failed ${res.status}: ${await res.text()}`)
    file = await res.json()
    log('state=', file.state)
  }
  return file
}

const SYSTEM = `You are analyzing a gameplay video to determine if it is suitable for a "3D additive-iteration evolution" playable template (think paper-airplane evolution, vehicle evolution, creature builder — the player launches an object, observes failure, modifies it by adding/swapping parts, retries, evolves).

Return STRICT JSON with this shape:
{
  "render_mode": "2d" | "2.5d" | "3d",
  "is_evolution_loop": boolean,
  "evolution_loop": {
    "object_being_evolved": string,                        // e.g. "paper airplane"
    "iteration_count_observed": number,                    // distinct attempts visible
    "what_changes_between_attempts": string,               // narrative description
    "parts_taxonomy": Array<{ "role": string; "examples_seen": string[] }>,
    "trigger_to_launch": "drag" | "tap" | "swipe" | "auto" | "other",
    "fail_signal": string,
    "success_signal": string
  } | null,
  "alternate_classification_if_not_evolution": {
    "best_genre_match": string,
    "rationale": string
  } | null,
  "core_mechanic_one_sentence": string,
  "would_three_js_template_fit": boolean,
  "three_js_template_recommendation": {
    "id": string,                                          // e.g. "3d-airplane-evolution"
    "scene_setup": string,                                 // camera, lighting, ground
    "physics_summary": string,                             // lift, drag, gravity, throttle
    "minimal_parts_set": string[],                         // roles required to render
    "configurable_params": string[]                        // for variations
  } | null,
  "risks_for_codegen": string[],
  "minimum_assets_needed": string[]
}

Be honest. If the video is not an evolution loop, set is_evolution_loop:false and explain in alternate_classification.`

async function analyze(uploaded) {
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType } },
        { text: 'Analyze this video. Output strict JSON per the schema in the system instruction.' },
      ],
    }],
    systemInstruction: { role: 'system', parts: [{ text: SYSTEM }] },
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  }
  log('calling generateContent…')
  const t0 = Date.now()
  const res = await fetch(`${GEMINI_BASE}/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const ms = Date.now() - t0
  if (!res.ok) throw new Error(`generateContent failed ${res.status}: ${await res.text()}`)
  const raw = await res.json()
  const text = raw?.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? ''
  log(`done in ${ms}ms, tokens in/out=`, raw?.usageMetadata?.promptTokenCount, '/', raw?.usageMetadata?.candidatesTokenCount)

  let parsed
  try { parsed = JSON.parse(text) } catch { parsed = { __parse_error: true, text } }
  return { parsed, latencyMs: ms, usage: raw?.usageMetadata ?? null }
}

;(async () => {
  const uploaded = await uploadVideo(VIDEO_PATH)
  const active = await waitActive(uploaded)
  const result = await analyze(active)
  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result.parsed, null, 2))
  log('wrote', OUT_PATH)
})().catch(e => { console.error(e); process.exit(1) })
