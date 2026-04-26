'use client'

import type { Gesture } from '@/utils/polishTypes'

interface GestureCardProps {
  gesture: Gesture
  onChange: (patch: Partial<Gesture>) => void
  onDelete: () => void
  onReplay: () => void
}

const NUM_INPUT = 'w-full px-2 py-1 rounded-md border border-gray-200 text-xs text-[#0F141C] focus:outline-none focus:border-[#0055FF]'
const ROW = 'grid grid-cols-[78px_1fr] items-center gap-2'

export default function GestureCard({ gesture, onChange, onDelete, onReplay }: GestureCardProps) {
  const isClick = gesture.mode === 'click'
  const badgeBg = isClick ? 'bg-[#6b21a8]' : 'bg-[#1e40af]'

  return (
    <div className="rounded-xl border border-gray-100 bg-[#FAFBFD] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${badgeBg} text-white font-semibold`}>
            {gesture.mode}
          </span>
          <strong className="text-xs text-[#0F141C] truncate">{gesture.name}</strong>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onReplay}
            title="Replay preview"
            className="px-2 py-1 rounded-md border border-gray-200 text-[10px] text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
          >
            ↻
          </button>
          <button
            onClick={onDelete}
            title="Delete gesture"
            className="px-2 py-1 rounded-md border border-red-100 text-[10px] text-red-600 hover:bg-red-50 active:scale-95 transition-all"
          >
            ✕
          </button>
        </div>
      </div>

      <div className={ROW}>
        <label className="text-[11px] text-gray-500">Name</label>
        <input
          type="text"
          value={gesture.name}
          onChange={e => onChange({ name: e.target.value })}
          className={NUM_INPUT}
        />
      </div>

      {gesture.mode === 'click' ? (
        <>
          <div className={ROW}>
            <label className="text-[11px] text-gray-500">X (%)</label>
            <input
              type="number" step={0.1} min={0} max={100}
              value={Number(gesture.at.x.toFixed(1))}
              onChange={e => onChange({ at: { ...gesture.at, x: clampPct(e.target.valueAsNumber) } })}
              className={NUM_INPUT}
            />
          </div>
          <div className={ROW}>
            <label className="text-[11px] text-gray-500">Y (%)</label>
            <input
              type="number" step={0.1} min={0} max={100}
              value={Number(gesture.at.y.toFixed(1))}
              onChange={e => onChange({ at: { ...gesture.at, y: clampPct(e.target.valueAsNumber) } })}
              className={NUM_INPUT}
            />
          </div>
          <div className={ROW}>
            <label className="text-[11px] text-gray-500">Angle (°)</label>
            <input
              type="number" step={1} min={-180} max={180}
              value={gesture.angle ?? 20}
              onChange={e => onChange({ angle: Number.isNaN(e.target.valueAsNumber) ? 20 : e.target.valueAsNumber })}
              className={NUM_INPUT}
            />
          </div>
        </>
      ) : (
        <>
          <div className={ROW}>
            <label className="text-[11px] text-gray-500">From X</label>
            <input
              type="number" step={0.1} min={0} max={100}
              value={Number(gesture.from.x.toFixed(1))}
              onChange={e => onChange({ from: { ...gesture.from, x: clampPct(e.target.valueAsNumber) } })}
              className={NUM_INPUT}
            />
          </div>
          <div className={ROW}>
            <label className="text-[11px] text-gray-500">From Y</label>
            <input
              type="number" step={0.1} min={0} max={100}
              value={Number(gesture.from.y.toFixed(1))}
              onChange={e => onChange({ from: { ...gesture.from, y: clampPct(e.target.valueAsNumber) } })}
              className={NUM_INPUT}
            />
          </div>
          <div className={ROW}>
            <label className="text-[11px] text-gray-500">To X</label>
            <input
              type="number" step={0.1} min={0} max={100}
              value={Number(gesture.to.x.toFixed(1))}
              onChange={e => onChange({ to: { ...gesture.to, x: clampPct(e.target.valueAsNumber) } })}
              className={NUM_INPUT}
            />
          </div>
          <div className={ROW}>
            <label className="text-[11px] text-gray-500">To Y</label>
            <input
              type="number" step={0.1} min={0} max={100}
              value={Number(gesture.to.y.toFixed(1))}
              onChange={e => onChange({ to: { ...gesture.to, y: clampPct(e.target.valueAsNumber) } })}
              className={NUM_INPUT}
            />
          </div>
          <div className={ROW}>
            <label className="text-[11px] text-gray-500">Angle (°)</label>
            <input
              type="number" step={1} min={-180} max={180}
              value={gesture.angle ?? ''}
              placeholder="auto"
              onChange={e => {
                const raw = e.target.value
                if (raw === '') onChange({ angle: undefined })
                else if (!Number.isNaN(e.target.valueAsNumber)) onChange({ angle: e.target.valueAsNumber })
              }}
              className={NUM_INPUT}
            />
          </div>
        </>
      )}

      <div className={ROW}>
        <label className="text-[11px] text-gray-500">Delay (ms)</label>
        <input
          type="number" step={50} min={0}
          value={gesture.delay}
          onChange={e => onChange({ delay: Math.max(0, e.target.valueAsNumber || 0) })}
          className={NUM_INPUT}
        />
      </div>
      <div className={ROW}>
        <label className="text-[11px] text-gray-500">Duration (ms)</label>
        <input
          type="number" step={50} min={200}
          value={gesture.duration}
          onChange={e => onChange({ duration: Math.max(200, e.target.valueAsNumber || 200) })}
          className={NUM_INPUT}
        />
      </div>
      <div className={ROW}>
        <label className="text-[11px] text-gray-500">Repeat</label>
        <input
          type="checkbox"
          checked={gesture.repeat}
          onChange={e => onChange({ repeat: e.target.checked })}
          className="w-4 h-4 accent-[#0055FF] justify-self-start"
        />
      </div>
    </div>
  )
}

function clampPct(v: number): number {
  if (Number.isNaN(v)) return 0
  return Math.max(0, Math.min(100, v))
}
