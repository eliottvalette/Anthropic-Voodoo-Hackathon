'use client'

export type RoleRow = {
  role: string
  filename: string | null
  match_confidence?: 'high' | 'medium' | 'low'
}

const CONFIDENCE_STYLE: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  medium: 'bg-amber-50 text-amber-700 border-amber-100',
  low: 'bg-red-50 text-red-700 border-red-100',
}

export default function RoleTable({ rows, showLegend = true }: { rows: RoleRow[]; showLegend?: boolean }) {
  const hasConfidence = rows.some(r => r.match_confidence)

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-gray-100 overflow-hidden">
        <div
          className={`grid ${hasConfidence ? 'grid-cols-[1fr_auto_1.4fr]' : 'grid-cols-[1fr_1.4fr]'} gap-3 px-3 py-2 bg-[#F6F9FC] border-b border-gray-100 text-[10px] font-semibold text-gray-500 uppercase tracking-widest`}
        >
          <span>Role</span>
          {hasConfidence && <span className="text-center">Match</span>}
          <span>File</span>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.role}
            className={`grid ${hasConfidence ? 'grid-cols-[1fr_auto_1.4fr]' : 'grid-cols-[1fr_1.4fr]'} gap-3 items-center px-3 py-2 text-xs ${i % 2 ? 'bg-[#FBFCFE]' : 'bg-white'}`}
          >
            <span className="font-mono text-[#0F141C] truncate" title={r.role}>{r.role}</span>
            {hasConfidence && (
              <span
                className={`justify-self-center px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold uppercase border ${
                  r.match_confidence ? CONFIDENCE_STYLE[r.match_confidence] : 'bg-gray-50 text-gray-400 border-gray-100'
                }`}
              >
                {r.match_confidence ?? '—'}
              </span>
            )}
            <span
              className="font-mono text-gray-600 truncate"
              title={r.filename ?? 'no match'}
            >
              {r.filename ?? <span className="text-gray-300 italic">unmatched</span>}
            </span>
          </div>
        ))}
      </div>

      {showLegend && hasConfidence && (
        <div className="flex flex-wrap items-center gap-3 px-1 text-[10px] text-gray-400">
          <span className="font-medium uppercase tracking-widest text-gray-400">Match</span>
          <Legend color="emerald" label="high — confident asset match" />
          <Legend color="amber" label="medium — ambiguous" />
          <Legend color="red" label="low — no match" />
        </div>
      )}
    </div>
  )
}

function Legend({ color, label }: { color: 'emerald' | 'amber' | 'red'; label: string }) {
  const dot =
    color === 'emerald' ? 'bg-emerald-400' : color === 'amber' ? 'bg-amber-400' : 'bg-red-400'
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span>{label}</span>
    </span>
  )
}
