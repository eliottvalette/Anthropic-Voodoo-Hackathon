'use client'

import { useEffect, useState } from 'react'
import { listRuns, deleteRun, type StoredRun } from '@/lib/runs/store'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return '1 day ago'
  return `${d} days ago`
}

function RunCard({ run, onDelete, onDownload }: { run: StoredRun; onDelete: () => void; onDownload: () => void }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="font-semibold text-[#0F141C] truncate">{run.gameName || run.runId}</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {run.genre || '—'} · {run.mechanic || '—'} · {timeAgo(run.createdAt)}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full ${run.verifyRuns ? 'bg-emerald-400' : 'bg-red-500'}`} />
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
            {run.verifyRuns ? 'Pass' : 'Fail'}
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-[#F6F9FC] p-3 font-mono text-xs grid grid-cols-2 gap-x-6 gap-y-1 mb-4">
        <div className="flex justify-between gap-2">
          <span className="text-gray-400">size</span>
          <span className="text-[#0F141C] font-semibold">{(run.htmlBytes / 1024).toFixed(0)} KB</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-400">retries</span>
          <span className="text-[#0F141C] font-semibold">{run.retries}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-400">latency</span>
          <span className="text-[#0F141C] font-semibold">{(run.totalLatencyMs / 1000).toFixed(1)}s</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-400">tokens</span>
          <span className="text-[#0F141C] font-semibold">{run.totalTokensIn + run.totalTokensOut}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onDownload}
          className="flex-1 py-2 rounded-xl bg-[#0F141C] text-white text-xs font-semibold hover:bg-[#1e2a3a] active:scale-[0.98] transition-all"
        >
          Download HTML
        </button>
        <button
          onClick={onDelete}
          title="Delete this run"
          className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-400 hover:text-red-600 hover:border-red-200 active:scale-[0.98] transition-all"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

export default function HistoryView() {
  const [runs, setRuns] = useState<StoredRun[] | null>(null)

  const refresh = () => {
    listRuns().then(setRuns).catch(() => setRuns([]))
  }

  useEffect(() => { refresh() }, [])

  const handleDelete = async (id: string) => {
    await deleteRun(id)
    refresh()
  }

  const handleDownload = (run: StoredRun) => {
    const blob = new Blob([run.html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${run.runId}.html`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  if (runs === null) {
    return <div className="h-full flex items-center justify-center text-gray-400 text-sm">Loading…</div>
  }

  if (runs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7" stroke="#D1D5DB" strokeWidth="1.5" />
              <path d="M10 6v4l3 2" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-[#0F141C]">No runs yet</p>
          <p className="text-xs text-gray-400 max-w-[220px]">
            Generate a playable from the Generator view — successful runs appear here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto space-y-4 pb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-base font-bold text-[#0F141C]">Playable History</h2>
            <p className="text-xs text-gray-400 mt-0.5">{runs.length} run{runs.length === 1 ? '' : 's'} · stored locally (IndexedDB)</p>
          </div>
        </div>
        {runs.map(run => (
          <RunCard
            key={run.runId}
            run={run}
            onDelete={() => handleDelete(run.runId)}
            onDownload={() => handleDownload(run)}
          />
        ))}
      </div>
    </div>
  )
}
