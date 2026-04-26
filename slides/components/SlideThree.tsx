import { SlideChrome } from './SlideChrome'

type Slot = {
  title: string
  tag: string
  src: string
  todo?: string
}

const SLOTS: Slot[] = [
  {
    title: 'Block Blast',
    tag: '2D · Canvas',
    src: 'about:blank',
    todo: 'Drop the playable.html path here',
  },
  {
    title: 'Epic Plane Evolution',
    tag: '3D · Three.js',
    src: 'about:blank',
    todo: 'Drop the playable.html path here',
  },
]

export function SlideThree({ index, total }: { index: number; total: number }) {
  return (
    <SlideChrome index={index} total={total} eyebrow="03 — Generalisation">
      <div className="flex h-full flex-col">
        <div className="flex items-end justify-between">
          <div className="max-w-[60%]">
            <h1 className="font-display text-[64px] font-semibold leading-[0.95] tracking-tightest text-ink">
              Same pipeline.
              <br />
              <span className="brand-underline">2D, 3D, anything.</span>
            </h1>
            <p className="mt-5 max-w-[52ch] text-lg font-light leading-snug tracking-tight text-ink/75">
              Castle Clashers was the imposed demo. The pipeline is the
              deliverable — point it at a different gameplay video and it
              produces a different playable.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <span className="rounded-full border border-line bg-surface px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-muted">
              Live demo · interactive
            </span>
            <span className="font-mono text-xs text-muted">
              templates grow per game shipped
            </span>
          </div>
        </div>

        <div className="mt-auto grid flex-1 grid-cols-2 gap-6 pt-8">
          {SLOTS.map((slot) => (
            <PlayableSlot key={slot.title} slot={slot} />
          ))}
        </div>
      </div>
    </SlideChrome>
  )
}

function PlayableSlot({ slot }: { slot: Slot }) {
  return (
    <div
      data-slot="playable-slot"
      className="relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2 w-2 rounded-sm bg-brand" />
          <span className="font-display text-base font-semibold tracking-tight text-ink">
            {slot.title}
          </span>
        </div>
        <span className="rounded-full bg-brand-soft px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-brand">
          {slot.tag}
        </span>
      </div>
      <div className="relative flex-1 bg-black">
        <iframe
          src={slot.src}
          title={slot.title}
          className="absolute inset-0 h-full w-full border-0"
          allow="autoplay; fullscreen"
        />
        {slot.todo && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink/85 p-6 text-center">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber">
                TODO · iframe src
              </div>
              <div className="mt-3 font-display text-xl font-semibold tracking-tight text-white">
                {slot.title}
              </div>
              <div className="mt-2 text-sm text-white/70">{slot.todo}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
