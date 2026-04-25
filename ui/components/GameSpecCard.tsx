'use client'

import { useRef, useState } from 'react'
import RoleTable, { RoleRow } from './RoleTable'

export type GameSpecLite = {
  source_video?: string
  game_identity?: { observed_title: string | null; genre: string; visual_style: string }
  render_mode?: '2d' | '3d'
  mechanic_name?: string
  template_id?: string | null
  core_loop_one_sentence?: string
  defining_hook?: string
  not_this_game?: string[]
  first_5s_script?: string
  tutorial_loss_at_seconds?: number
  asset_role_map?: Record<string, string | null>
  params?: Record<string, unknown>
  creative_slot_prompt?: string
  [key: string]: unknown
}

export default function GameSpecCard({ spec }: { spec: GameSpecLite }) {
  const [showJson, setShowJson] = useState(false)
  const [scriptExpanded, setScriptExpanded] = useState(false)
  const jsonRef = useRef<HTMLPreElement | null>(null)

  const toggleJson = () => {
    const next = !showJson
    setShowJson(next)
    if (next) {
      requestAnimationFrame(() => {
        jsonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    }
  }

  const roleRows: RoleRow[] = spec.asset_role_map
    ? Object.entries(spec.asset_role_map).map(([role, filename]) => ({ role, filename }))
    : []

  return (
    <div className="space-y-6">
      {/* Header */}
      {spec.game_identity && (
        <header className="space-y-1">
          <h2 className="text-2xl font-bold text-[#0F141C] leading-tight">
            {spec.game_identity.observed_title || 'Untitled game'}
          </h2>
          <p className="text-sm text-gray-500">
            {spec.game_identity.genre}
            <span className="text-gray-300 mx-1.5">·</span>
            {spec.game_identity.visual_style}
            {spec.render_mode && (
              <>
                <span className="text-gray-300 mx-1.5">·</span>
                {spec.render_mode.toUpperCase()}
              </>
            )}
          </p>
        </header>
      )}

      {/* Hook + core loop cards */}
      {(spec.defining_hook || spec.core_loop_one_sentence) && (
        <div className="grid gap-3">
          {spec.defining_hook && (
            <InfoCard label="Defining hook" tone="blue">
              <p className="text-sm text-[#0F141C] leading-relaxed">{spec.defining_hook}</p>
            </InfoCard>
          )}
          {spec.core_loop_one_sentence && (
            <InfoCard label="Core loop" tone="slate">
              <p className="text-sm text-[#0F141C] leading-relaxed">{spec.core_loop_one_sentence}</p>
            </InfoCard>
          )}
        </div>
      )}

      {/* Game parameters — colored stat strip */}
      {(spec.mechanic_name || spec.template_id !== undefined || typeof spec.tutorial_loss_at_seconds === 'number' || spec.first_5s_script) && (
        <section className="space-y-3">
          <SectionTitle>Game parameters</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {spec.mechanic_name && (
              <StatCard tone="indigo" label="Mechanic" value={spec.mechanic_name} mono />
            )}
            {spec.template_id !== undefined && (
              <StatCard tone="violet" label="Template" value={spec.template_id ?? '(none)'} mono />
            )}
            {typeof spec.tutorial_loss_at_seconds === 'number' && (
              <StatCard tone="amber" label="Tutorial loss" value={`${spec.tutorial_loss_at_seconds}s`} />
            )}
            {spec.first_5s_script && (
              <StatCard
                tone="emerald"
                label="First 5s script"
                value={spec.first_5s_script}
                fullWidth
                clamp={!scriptExpanded}
                onToggle={() => setScriptExpanded(s => !s)}
                expanded={scriptExpanded}
              />
            )}
          </div>
        </section>
      )}

      {/* Asset roles */}
      {roleRows.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>Asset roles</SectionTitle>
          <RoleTable rows={roleRows} showLegend={false} />
        </section>
      )}

      {/* Not this game */}
      {spec.not_this_game && spec.not_this_game.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Not this game</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {spec.not_this_game.map(s => (
              <span
                key={s}
                className="px-2 py-0.5 rounded-full bg-red-50 border border-red-100 text-[11px] font-medium text-red-700"
              >
                {s}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Raw JSON toggle (bottom) */}
      <div className="pt-1">
        <button
          onClick={toggleJson}
          className="text-[11px] font-semibold text-[#0055FF] hover:underline inline-flex items-center gap-1"
        >
          {showJson ? 'Hide raw JSON' : 'Show raw JSON'}
          <span className={`transition-transform ${showJson ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {showJson && (
          <pre
            ref={jsonRef}
            className="mt-2 text-[10.5px] leading-snug font-mono bg-[#0e1320] text-[#e6e9f0] rounded-xl p-3 max-h-96 overflow-auto whitespace-pre-wrap break-all"
          >
            <code>{JSON.stringify(spec, null, 2)}</code>
          </pre>
        )}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-[#0F141C]">{children}</h3>
}

function InfoCard({ label, tone, children }: { label: string; tone: 'blue' | 'slate'; children: React.ReactNode }) {
  const accent = tone === 'blue' ? 'border-l-[#0055FF]' : 'border-l-gray-300'
  return (
    <div className={`rounded-xl bg-[#F6F9FC] border border-gray-100 border-l-4 ${accent} p-3.5`}>
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">{label}</div>
      {children}
    </div>
  )
}

type Tone = 'indigo' | 'violet' | 'amber' | 'emerald'
const TONE_STYLE: Record<Tone, { bg: string; border: string; label: string; dot: string }> = {
  indigo:  { bg: 'bg-indigo-50/60',  border: 'border-indigo-100',  label: 'text-indigo-700',  dot: 'bg-indigo-400' },
  violet:  { bg: 'bg-violet-50/60',  border: 'border-violet-100',  label: 'text-violet-700',  dot: 'bg-violet-400' },
  amber:   { bg: 'bg-amber-50/60',   border: 'border-amber-100',   label: 'text-amber-700',   dot: 'bg-amber-400' },
  emerald: { bg: 'bg-emerald-50/60', border: 'border-emerald-100', label: 'text-emerald-700', dot: 'bg-emerald-400' },
}

function StatCard({
  tone, label, value, mono, fullWidth, clamp, expanded, onToggle,
}: {
  tone: Tone
  label: string
  value: string
  mono?: boolean
  fullWidth?: boolean
  clamp?: boolean
  expanded?: boolean
  onToggle?: () => void
}) {
  const t = TONE_STYLE[tone]
  return (
    <div
      className={`rounded-xl border ${t.border} ${t.bg} p-3 ${fullWidth ? 'sm:col-span-2' : ''}`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
        <span className={`text-[10px] font-semibold uppercase tracking-widest ${t.label}`}>{label}</span>
      </div>
      <div
        className={`text-sm font-semibold text-[#0F141C] break-words ${mono ? 'font-mono' : ''} ${
          clamp ? 'line-clamp-2' : ''
        }`}
      >
        {value}
      </div>
      {onToggle && value.length > 80 && (
        <button
          onClick={onToggle}
          className="mt-1 text-[11px] font-medium text-[#0055FF] hover:underline"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
