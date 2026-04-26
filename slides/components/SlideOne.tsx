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
        <div className="col-span-7 flex flex-col">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.24em] text-muted">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
            Track 2 · Playable Ad
          </div>

          <h1 className="mt-6 font-display text-[68px] font-semibold leading-[1.02] tracking-tightest text-ink">
            Castle Clashers,
            <br />
            <span className="brand-underline">generated from a video.</span>
          </h1>

          <p className="mt-6 max-w-[36ch] text-[20px] font-light leading-[1.45] tracking-tight text-ink/70">
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

        <div className="col-span-5 flex h-full items-center justify-center">
          <PlayablePreview />
        </div>
      </div>
    </SlideChrome>
  )
}

function PlayablePreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-3 rounded-[28px] bg-gradient-to-br from-brand/25 via-amber/15 to-transparent blur-xl" aria-hidden />

      <div
        data-slot="playable-frame"
        className="relative aspect-[9/16] h-[68vh] max-h-[640px] overflow-hidden rounded-[24px] border border-line bg-black shadow-[0_30px_70px_-20px_rgba(0,0,0,0.45)]"
      >
        <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-white backdrop-blur">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-75" />
            <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-brand" />
          </span>
          Live · interactive
        </div>

        <iframe
          src="/castle-clashers.html"
          title="Castle Clashers playable"
          className="absolute inset-0 h-full w-full border-0"
          allow="autoplay; fullscreen"
          loading="eager"
        />
      </div>

      <div className="mt-3 flex items-center justify-between px-1 text-[10px] uppercase tracking-[0.24em] text-muted">
        <span className="font-mono">playable.html</span>
        <span>Tap to play →</span>
      </div>
    </div>
  )
}
