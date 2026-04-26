'use client'

import { useEffect, useRef, useState } from 'react'

type Status = 'idle' | 'recording' | 'transcribing' | 'done' | 'error'

interface MicCaptureProps {
  value: string
  onChange: (text: string) => void
  placeholder?: string
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  for (const t of candidates) if (MediaRecorder.isTypeSupported(t)) return t
  return ''
}

function extForMime(mime: string): string {
  if (mime.startsWith('audio/webm')) return 'webm'
  if (mime.startsWith('audio/mp4')) return 'm4a'
  if (mime.startsWith('audio/ogg')) return 'ogg'
  return 'webm'
}

export default function MicCapture({ value, onChange, placeholder = 'Explain briefly your game' }: MicCaptureProps) {
  const [status, setStatus] = useState<Status>(value ? 'done' : 'idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef<number>(0)

  useEffect(() => {
    if (status !== 'recording') return
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000))
    }, 250)
    return () => clearInterval(id)
  }, [status])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const start = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = pickMimeType()
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      recorderRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' })
        await transcribe(blob, mime || 'audio/webm')
      }
      rec.start()
      startedAtRef.current = Date.now()
      setElapsed(0)
      setStatus('recording')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Microphone access denied')
      setStatus('error')
    }
  }

  const stop = () => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      setStatus('transcribing')
      rec.stop()
    }
  }

  const transcribe = async (blob: Blob, mime: string) => {
    try {
      const fd = new FormData()
      const ext = extForMime(mime)
      fd.append('file', blob, `recording.${ext}`)
      const res = await fetch('/api/voxtral', { method: 'POST', body: fd })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.error ? `${detail.error}${detail.detail ? `: ${detail.detail}` : ''}` : `HTTP ${res.status}`)
      }
      const data = await res.json() as { text: string }
      onChange((data.text ?? '').trim())
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed')
      setStatus('error')
    }
  }

  const reset = () => {
    onChange('')
    setError(null)
    setStatus('idle')
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (status === 'done' && value) {
    return (
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-emerald-700">
            <CheckIcon /> Brief recorded
          </span>
          <button
            onClick={reset}
            className="text-[11px] font-medium text-gray-500 hover:text-[#0F141C] hover:underline"
          >
            Clear & re-record
          </button>
        </div>
        <p className="text-xs text-[#0F141C] leading-relaxed">{value}</p>
      </div>
    )
  }

  if (status === 'recording') {
    return (
      <button
        type="button"
        onClick={stop}
        className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 active:scale-[0.985] transition-all shadow-[0_4px_20px_rgba(239,68,68,0.25)]"
      >
        <span className="relative inline-flex items-center justify-center w-3 h-3">
          <span className="absolute inline-flex w-3 h-3 rounded-full bg-white opacity-60 animate-ping" />
          <span className="relative inline-flex w-2 h-2 rounded-full bg-white" />
        </span>
        Stop recording
        <span className="font-mono tabular-nums text-xs opacity-80">{formatTime(elapsed)}</span>
      </button>
    )
  }

  if (status === 'transcribing') {
    return (
      <div className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-100 text-gray-500 text-sm font-semibold">
        <Spinner /> Transcribing…
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl border border-gray-200 bg-white hover:border-[#0055FF] hover:text-[#0055FF] text-sm font-semibold text-gray-600 active:scale-[0.985] transition-all"
      >
        <MicIcon />
        {placeholder}
      </button>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="5" y="1.5" width="4" height="7" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 6.5c0 2.5 2 4.5 4.5 4.5s4.5-2 4.5-4.5M7 11v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M2 5.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="animate-spin">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.25" />
      <path d="M12 7a5 5 0 00-5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
