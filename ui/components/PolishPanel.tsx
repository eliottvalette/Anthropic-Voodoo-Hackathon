'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ClickGesture,
  Gesture,
  ShellToStageMsg,
  StageToShellMsg,
  SwipeGesture,
} from '@/utils/polishTypes'
import GestureCard from './PolishPanel.GestureCard'

interface PolishPanelProps {
  sourceHtml: string
  onPolished: (polishedHtml: string) => void | Promise<void>
  onClose: () => void
}

type Mode = 'click' | 'swipe'

export default function PolishPanel({ sourceHtml, onPolished, onClose }: PolishPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<Mode>('click')
  const [gestures, setGestures] = useState<Gesture[]>([])
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  // Stable references for postMessage handlers across renders
  const send = useCallback((msg: ShellToStageMsg) => {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.postMessage(msg, window.location.origin)
  }, [])

  // Listen for stage messages
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return
      const msg = ev.data as StageToShellMsg
      if (!msg || typeof msg.type !== 'string') return
      switch (msg.type) {
        case 'ready':
          setReady(true)
          break
        case 'gesture-added':
          setGestures(prev => [...prev, msg.gesture])
          break
        case 'error':
          setError(msg.message)
          break
        // 'drag-echo' and 'size' are advisory; ignore for now
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // After ready, ship the source playable into the stage's inner iframe.
  useEffect(() => {
    if (!ready) return
    send({ type: 'load-playable', srcdoc: sourceHtml })
  }, [ready, sourceHtml, send])

  // Mode + gestures sync: shell is single source of truth, push the
  // canonical state to the stage on every change.
  useEffect(() => {
    if (!ready) return
    send({ type: 'set-mode', mode })
  }, [ready, mode, send])

  useEffect(() => {
    if (!ready) return
    send({ type: 'set-gestures', gestures })
  }, [ready, gestures, send])

  // --- gesture mutations ---

  const updateGesture = useCallback((id: string, patch: Partial<Gesture>) => {
    setGestures(prev => prev.map(g => {
      if (g.id !== id) return g
      // Discriminated-union safe merge: keep mode, only overwrite shape-compatible fields.
      if (g.mode === 'click') return { ...g, ...patch } as ClickGesture
      return { ...g, ...patch } as SwipeGesture
    }))
  }, [])

  const removeGesture = useCallback((id: string) => {
    setGestures(prev => prev.filter(g => g.id !== id))
  }, [])

  const replayPreview = useCallback(() => {
    if (!ready) return
    send({ type: 'replay' })
  }, [ready, send])

  const clearAll = useCallback(() => {
    if (gestures.length === 0) return
    if (!confirm('Clear all gestures?')) return
    setGestures([])
  }, [gestures.length])

  // --- export ---

  const exportPolished = useCallback(async () => {
    if (gestures.length === 0) {
      setToast({ kind: 'error', text: 'Place at least one gesture first.' })
      return
    }
    setExporting(true)
    setError(null)
    try {
      // Splice client-side. Bypasses Next.js's ~10 MB Route Handler body
      // cap which truncated the demo's 13 MB inlined-base64 playable on
      // POST /api/polish. The client splicer mirrors lib/polishInjection.ts
      // exactly — same runtime, same matchers, same fade.
      const { polishPlayableClientSide } = await import('@/utils/polishClient')
      const polishedHtml = await polishPlayableClientSide(sourceHtml, gestures)
      await onPolished(polishedHtml)
      setToast({ kind: 'success', text: 'Polished playable saved.' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setToast({ kind: 'error', text: msg })
    } finally {
      setExporting(false)
    }
  }, [gestures, sourceHtml, onPolished])

  // Auto-dismiss toasts
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const gestureCount = gestures.length
  const headerLabel = useMemo(() => {
    return gestureCount === 0
      ? 'Tap or drag on the playable to add a hand tutorial'
      : `${gestureCount} gesture${gestureCount === 1 ? '' : 's'} placed`
  }, [gestureCount])

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-base font-semibold text-[#0F141C]">Polish with hand tutorials</h2>
          <p className="text-xs text-gray-400 mt-0.5">{headerLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
          >
            Close
          </button>
          <button
            onClick={exportPolished}
            disabled={exporting || gestures.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0055FF] text-white text-xs font-semibold hover:bg-[#0044DD] active:scale-95 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <>
                <svg className="animate-spin" width="13" height="13" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
                  <path d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Polishing…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 2h9v9H2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M5 6.5l1.4 1.4L9 5.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Apply &amp; save
              </>
            )}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
        {/* Stage column */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setMode('click')}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${mode === 'click' ? 'bg-[#0055FF] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                Click
              </button>
              <button
                onClick={() => setMode('swipe')}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${mode === 'swipe' ? 'bg-[#0055FF] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                Swipe
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={replayPreview}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
              >
                Replay
              </button>
              <button
                onClick={clearAll}
                disabled={gestures.length === 0}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Iframe stage */}
          <div className="flex-1 min-h-0 overflow-auto bg-[#F6F9FC] flex items-center justify-center p-4">
            <iframe
              ref={iframeRef}
              src="/prettifier/stage.html"
              title="Hand tutorial editor stage"
              className="border-0"
              style={{ width: 430, height: 820, borderRadius: 18, background: '#000', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}
            />
          </div>

          {error && (
            <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-t border-red-100 shrink-0">
              {error}
            </div>
          )}
        </div>

        {/* Gesture list column */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 shrink-0">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Gestures ({gestures.length})</p>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-3 space-y-2">
            {gestures.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5 text-xs text-gray-500 text-center leading-relaxed">
                Choose <strong>Click</strong> or <strong>Swipe</strong>, then tap or drag on the playable.
                Coordinates are stored as percentages so the hand stays anchored across phone sizes.
              </div>
            ) : (
              gestures.map(g => (
                <GestureCard
                  key={g.id}
                  gesture={g}
                  onChange={patch => updateGesture(g.id, patch)}
                  onDelete={() => removeGesture(g.id)}
                  onReplay={replayPreview}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg text-xs font-semibold text-white shadow-lg z-50 ${toast.kind === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
