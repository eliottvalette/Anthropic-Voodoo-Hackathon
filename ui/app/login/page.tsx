'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'

export default function LoginPage() {
  const [email, setEmail]     = useState('')
  const [sent, setSent]       = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="h-[100dvh] flex items-center justify-center dot-grid" style={{ background: '#F6F9FC' }}>
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 w-full max-w-sm mx-4">

        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded-lg bg-[#0F141C] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 11.5L7 2L12 11.5H2z" fill="white" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-[#0F141C]">Playable Generator</span>
        </div>

        {!sent ? (
          <>
            <h1 className="text-xl font-bold text-[#0F141C] mb-1">Sign in</h1>
            <p className="text-sm text-gray-400 mb-6">We&apos;ll send you a magic link — no password needed.</p>

            <form onSubmit={handleSend} className="space-y-3">
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-[#0F141C] placeholder-gray-300 focus:outline-none focus:border-[#0055FF] transition-colors"
              />
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full py-3 rounded-xl bg-[#0055FF] text-white text-sm font-semibold disabled:opacity-40 hover:bg-[#0044DD] active:scale-[0.98] transition-all"
              >
                {loading ? 'Sending…' : 'Send magic link'}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center space-y-3 py-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M4 11l5 5L18 6" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#0F141C]">Check your inbox</p>
              <p className="text-xs text-gray-400 mt-1">
                Magic link sent to <span className="font-medium text-[#0F141C]">{email}</span>
              </p>
            </div>
            <button
              onClick={() => setSent(false)}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
