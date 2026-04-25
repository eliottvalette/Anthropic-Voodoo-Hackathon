'use client'

import { useState } from 'react'

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
  // Allow extra fields without forcing the strict pipeline-m shape here.
  [key: string]: unknown
}

export default function GameSpecCard({ spec }: { spec: GameSpecLite }) {
  const [showJson, setShowJson] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Game spec</p>
        <button
          onClick={() => setShowJson(s => !s)}
          className="text-[10px] font-semibold text-[#0055FF] hover:underline"
        >
          {showJson ? 'Hide JSON' : 'Show JSON'}
        </button>
      </div>

      <div className="space-y-3">
        {spec.game_identity && (
          <div>
            <div className="text-2xl font-bold text-[#0F141C]">
              {spec.game_identity.observed_title || 'Untitled game'}
            </div>
            <div className="text-sm text-gray-400 mt-0.5">
              {spec.game_identity.genre} · {spec.game_identity.visual_style} · {spec.render_mode?.toUpperCase()}
            </div>
          </div>
        )}

        {spec.defining_hook && (
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Defining hook</div>
            <p className="text-sm text-[#0F141C] leading-relaxed">{spec.defining_hook}</p>
          </div>
        )}

        {spec.core_loop_one_sentence && (
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Core loop</div>
            <p className="text-sm text-gray-600 leading-relaxed">{spec.core_loop_one_sentence}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl bg-[#F6F9FC] p-3 font-mono text-xs">
          {spec.mechanic_name && <Field k="mechanic" v={spec.mechanic_name} />}
          {spec.template_id !== undefined && <Field k="template" v={spec.template_id ?? '(none)'} />}
          {typeof spec.tutorial_loss_at_seconds === 'number' && <Field k="tutorial_loss" v={spec.tutorial_loss_at_seconds + 's'} />}
          {spec.first_5s_script && <Field k="first_5s" v={truncate(spec.first_5s_script, 56)} />}
        </div>

        {spec.asset_role_map && Object.keys(spec.asset_role_map).length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Asset roles</div>
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              {Object.entries(spec.asset_role_map).map(([role, file], i) => (
                <div key={role} className={`flex items-center justify-between px-3 py-2 text-xs ${i % 2 === 0 ? 'bg-white' : 'bg-[#F6F9FC]'}`}>
                  <span className="font-mono text-gray-500">{role}</span>
                  <span className="font-mono text-[#0F141C] truncate ml-3">{file ?? <span className="text-gray-300">null</span>}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {spec.not_this_game && spec.not_this_game.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Not this game</div>
            <div className="flex flex-wrap gap-1.5">
              {spec.not_this_game.map(s => (
                <span key={s} className="px-2 py-0.5 rounded-full bg-red-50 border border-red-100 text-[11px] font-medium text-red-700">{s}</span>
              ))}
            </div>
          </div>
        )}

        {showJson && (
          <pre className="text-[10.5px] leading-snug font-mono bg-[#0e1320] text-[#e6e9f0] rounded-xl p-3 overflow-auto max-h-96">
            <code>{JSON.stringify(spec, null, 2)}</code>
          </pre>
        )}
      </div>
    </div>
  )
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-400">{k}</span>
      <span className="text-[#0F141C] font-semibold truncate">{v}</span>
    </div>
  )
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
