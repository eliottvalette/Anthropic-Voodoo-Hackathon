'use client'

export type SubCallStatus = 'idle' | 'active' | 'done' | 'error'

export type SubCall = {
  id: string
  label: string
  status: SubCallStatus
  parallel?: boolean       // visually grouped with siblings of same parallel batch
  group?: string            // for visual cluster of parallel siblings
  durationMs?: number
  tokensIn?: number
  tokensOut?: number
}

export default function MultiPassStepper({ calls }: { calls: SubCall[] }) {
  // Group consecutive calls with same `group`
  const grouped: Array<{ group?: string; items: SubCall[] }> = []
  for (const c of calls) {
    const last = grouped[grouped.length - 1]
    if (c.group && last && last.group === c.group) last.items.push(c)
    else grouped.push({ group: c.group, items: [c] })
  }

  return (
    <div className="space-y-2 min-w-0">
      {grouped.map((g, i) => (
        <div key={i} className={g.items.length > 1 ? 'rounded-xl border border-gray-100 bg-white p-2 space-y-1 min-w-0' : 'min-w-0'}>
          {g.items.length > 1 && (
            <div className="text-[9.5px] font-semibold text-gray-400 uppercase tracking-widest pl-2">
              parallel · {g.group}
            </div>
          )}
          {g.items.map(c => <SubRow key={c.id} call={c} />)}
        </div>
      ))}
    </div>
  )
}

function SubRow({ call }: { call: SubCall }) {
  return (
    <div className="flex items-start justify-between gap-2 px-2 py-1.5 rounded-lg min-w-0">
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <Dot status={call.status} />
        <span
          className={`text-[12px] font-medium min-w-0 break-words ${call.status === 'idle' ? 'text-gray-400' : 'text-[#0F141C]'}`}
        >
          {call.label}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0 text-[10px] tabular-nums text-gray-400 font-mono">
        {typeof call.tokensIn === 'number' && (
          <span title="tokens in / out">
            {call.tokensIn}/{call.tokensOut ?? 0}
          </span>
        )}
        {typeof call.durationMs === 'number' && (
          <span>{(call.durationMs / 1000).toFixed(1)}s</span>
        )}
      </div>
    </div>
  )
}

function Dot({ status }: { status: SubCallStatus }) {
  if (status === 'done') {
    return (
      <span className="w-3.5 h-3.5 rounded-full bg-[#0F141C] flex items-center justify-center shrink-0">
        <svg width="7" height="7" viewBox="0 0 11 11" fill="none">
          <path d="M2 5.5l2.5 2.5 4.5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  if (status === 'active') return <span className="w-3.5 h-3.5 rounded-full bg-[#0055FF] pulse-dot shrink-0" />
  if (status === 'error') return <span className="w-3.5 h-3.5 rounded-full bg-red-500 shrink-0" />
  return <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-200 bg-white shrink-0" />
}
