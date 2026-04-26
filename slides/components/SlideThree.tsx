import { PhoneFrame } from './PhoneFrame'
import { SlideChrome } from './SlideChrome'

type Slot = { title: string; src: string }

const SLOTS: Slot[] = [
  { title: 'Block Blast', src: '/playable.html' },
  { title: 'Epic Plane Evolution', src: '/airplane-evolution.html' },
]

export function SlideThree({ index, total }: { index: number; total: number }) {
  return (
    <SlideChrome index={index} total={total} eyebrow="03 — Generalisation">
      <div className="flex h-full flex-col">
        <div className="max-w-[68%]">
          <h1 className="font-display text-[60px] font-semibold leading-[1.02] tracking-tightest text-ink">
            Same pipeline. <span className="brand-underline">2D, 3D, anything.</span>
          </h1>
          <p className="mt-3 max-w-[64ch] text-base font-light leading-snug tracking-tight text-ink/70">
            Castle Clashers was the imposed demo. The pipeline is the deliverable —
            point it at a different gameplay video, get a different playable.
          </p>
        </div>

        <div className="mt-4 grid flex-1 grid-cols-2 gap-10 pb-[6%]">
          {SLOTS.map((slot) => (
            <PhoneSlot key={slot.title} slot={slot} />
          ))}
        </div>
      </div>
    </SlideChrome>
  )
}

function PhoneSlot({ slot }: { slot: Slot }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[72%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-[60px] bg-gradient-to-br from-brand/25 via-amber/12 to-transparent blur-3xl"
        aria-hidden
      />
      <div className="h-[92%] w-[92%]">
        <PhoneFrame src={slot.src} title={slot.title} />
      </div>
    </div>
  )
}
