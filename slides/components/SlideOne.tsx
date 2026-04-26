import { PhoneFrame } from './PhoneFrame'
import { SlideChrome } from './SlideChrome'

type Metric = { label: string; value: string; sub?: string }

const METRICS: Metric[] = [
  { label: 'Bundle', value: '4.6', sub: 'MB · single file' },
  { label: 'End-to-end', value: '~2', sub: 'minutes' },
  { label: 'Compliance', value: 'MRAID', sub: '2.0' },
]

export function SlideOne({ index, total }: { index: number; total: number }) {
  return (
    <SlideChrome index={index} total={total} eyebrow="01 — Demo · Castle Clashers">
      <div className="grid h-full grid-cols-12 items-center gap-10">
        <div className="col-span-6 flex flex-col">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.24em] text-muted">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
            Track 2 · Playable Ad
          </div>

          <h1 className="mt-6 font-display text-[60px] font-semibold leading-[1.02] tracking-tightest text-ink">
            Castle Clashers,
            <br />
            <span className="brand-underline">generated from a video.</span>
          </h1>

          <p className="mt-6 max-w-[40ch] text-[18px] font-light leading-[1.45] tracking-tight text-ink/70">
            Drop in a 30-second gameplay clip. Out comes a self-contained,
            interactive HTML playable — ready for AppLovin, in minutes.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-3">
            {METRICS.map((m) => (
              <div
                key={m.label}
                data-slot="metric"
                className="rounded-xl border border-line bg-surface px-4 py-3.5"
              >
                <div className="text-[9px] font-medium uppercase tracking-[0.22em] text-muted">
                  {m.label}
                </div>
                <div className="mt-1.5 font-display text-[32px] font-semibold leading-none tracking-tight text-ink">
                  {m.value}
                </div>
                {m.sub && (
                  <div className="mt-1 text-[11px] text-muted">{m.sub}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-6 flex h-full items-center justify-center">
          <PlayablePreview />
        </div>
      </div>
    </SlideChrome>
  )
}

function PlayablePreview() {
  return (
    <div className="relative flex h-full w-full items-start justify-center pt-[5%] pb-[8%]">
      <div
        className="pointer-events-none absolute left-1/2 top-[44%] -z-10 h-[80%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-[60px] bg-gradient-to-br from-brand/30 via-amber/15 to-transparent blur-3xl"
        aria-hidden
      />
      <div className="h-[94%] w-[94%] translate-x-[1cm]">
        <PhoneFrame src="/index.html" title="Castle Clashers playable" />
      </div>
    </div>
  )
}
