'use client'

export type VerifyReportLite = {
  runs: boolean
  sizeOk: boolean
  consoleErrors: string[]
  canvasNonBlank: boolean
  mraidOk: boolean
  mechanicStringMatch: boolean
  interactionStateChange: boolean
  htmlBytes?: number
  retries?: number
  monolithicFallbackUsed?: boolean
  subsystemFailCounts?: Record<string, number>
}

const ASSERT_LABELS: Array<[keyof VerifyReportLite, string]> = [
  ['sizeOk', 'HTML size ≤ 5 MB'],
  ['canvasNonBlank', 'Canvas non-blank after 1.2s'],
  ['mraidOk', 'mraid.open( present'],
  ['mechanicStringMatch', 'mechanic_name in JS'],
  ['interactionStateChange', '__engineState changes on tap+drag'],
]

export default function VerifyReportCard({ report }: { report: VerifyReportLite }) {
  const errorOk = report.consoleErrors.length === 0
  const passes = ASSERT_LABELS.filter(([k]) => report[k]).length + (errorOk ? 1 : 0)
  const total = ASSERT_LABELS.length + 1

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Verify</p>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${report.runs ? 'bg-emerald-400' : 'bg-red-500'}`} />
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
            {report.runs ? 'PASS' : 'FAIL'} · {passes}/{total}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 overflow-hidden">
        {ASSERT_LABELS.map(([k, label], i) => {
          const pass = !!report[k]
          return (
            <div
              key={String(k)}
              className={`flex items-center justify-between px-3 py-2 text-xs ${i % 2 === 0 ? 'bg-white' : 'bg-[#F6F9FC]'}`}
            >
              <span className="text-gray-600">{label}</span>
              {pass ? (
                <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                  <Check /> pass
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-red-600 font-semibold">
                  <Cross /> fail
                </span>
              )}
            </div>
          )
        })}
        <div className={`flex items-start justify-between px-3 py-2 text-xs ${ASSERT_LABELS.length % 2 === 0 ? 'bg-white' : 'bg-[#F6F9FC]'}`}>
          <span className="text-gray-600 shrink-0">Console errors (0)</span>
          {errorOk ? (
            <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
              <Check /> pass
            </span>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <span className="flex items-center gap-1.5 text-red-600 font-semibold">
                <Cross /> {report.consoleErrors.length}
              </span>
              <ul className="text-[10px] text-red-700 space-y-0.5 max-w-[220px]">
                {report.consoleErrors.slice(0, 3).map((e, j) => (
                  <li key={j} className="font-mono truncate">{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {(typeof report.retries === 'number' || report.monolithicFallbackUsed) && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl bg-[#F6F9FC] p-3 font-mono text-xs">
          {typeof report.retries === 'number' && <Field k="retries" v={String(report.retries)} />}
          {typeof report.htmlBytes === 'number' && <Field k="size" v={(report.htmlBytes / 1024).toFixed(1) + ' KB'} />}
          {report.monolithicFallbackUsed && <Field k="fallback" v="monolithic" />}
        </div>
      )}

      {report.subsystemFailCounts && Object.values(report.subsystemFailCounts).some(v => v > 0) && (
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Subsystem fail counts</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(report.subsystemFailCounts).map(([name, count]) => (
              <span key={name} className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${count > 0 ? 'bg-red-50 border-red-100 text-red-700' : 'bg-[#F6F9FC] border-gray-100 text-gray-400'}`}>
                {name} · {count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-400">{k}</span>
      <span className="text-[#0F141C] font-semibold">{v}</span>
    </div>
  )
}

function Check() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M2 5.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function Cross() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
