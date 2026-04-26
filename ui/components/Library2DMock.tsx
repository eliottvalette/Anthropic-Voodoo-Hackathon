'use client'

import { useEffect, useState } from 'react'

interface Library2DMockProps {
  preview: string
}

/**
 * Renders a static React mock of one of the 2D HUD elements used in the
 * airplane-evolution playable. Live, but not interactive — purely for the
 * library card preview.
 */
export default function Library2DMock({ preview }: Library2DMockProps) {
  switch (preview) {
    case 'coin-counter':  return <CoinCounter />
    case 'speedometer':   return <Speedometer />
    case 'shop':          return <ShopMock />
    case 'cta':           return <CtaMock />
    case 'title':         return <TitleMock />
    default:              return <div className="text-xs text-gray-400">No preview</div>
  }
}

function CoinCounter() {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN(v => (v + 7) % 999), 600)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-[#bfe3ff] to-[#e8f4ff]">
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0F141C]/70 border border-[#ffce56]/40 text-white font-extrabold text-base tabular-nums">
        <span className="w-[18px] h-[18px] rounded-full inline-flex items-center justify-center text-[9px] font-black text-[#7a5800]" style={{ background: 'radial-gradient(circle at 35% 30%,#fff7c0,#f5c43c 70%,#a07c00)' }}>$</span>
        {n}
      </div>
    </div>
  )
}

function Speedometer() {
  const [v, setV] = useState(0)
  useEffect(() => {
    let t = 0
    const id = setInterval(() => {
      t += 1
      setV(Math.round(60 + Math.sin(t * 0.2) * 50))
    }, 80)
    return () => clearInterval(id)
  }, [])
  const arc = (v / 120) * 170
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-[#bfe3ff] to-[#e8f4ff]">
      <div className="relative w-[78px] h-[78px] rounded-full bg-[#0F141C]/70 border-[2px] border-white/20 flex flex-col items-center justify-center">
        <svg viewBox="0 0 64 64" className="absolute inset-0 w-full h-full">
          <circle cx="32" cy="32" r="27" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="2" />
          <path d="M32 5 A27 27 0 0 1 32 59" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${arc} 170`} />
        </svg>
        <div className="text-white font-extrabold text-base z-10 tabular-nums">{v}</div>
        <div className="text-[8px] font-bold text-white/70 tracking-widest z-10">KM/H</div>
      </div>
    </div>
  )
}

function ShopMock() {
  return (
    <div className="w-full h-full flex items-end justify-center pb-4 bg-gradient-to-b from-[#bfe3ff] to-[#e8f4ff]">
      <div className="flex gap-1">
        <div className="bg-white/90 border border-white rounded-lg px-2 py-1 text-center">
          <div className="text-[7px] font-bold tracking-widest text-[#0F141C]">BODY</div>
          <div className="text-[10px] font-bold text-[#0F141C]">paper</div>
        </div>
        <div className="bg-[#0F141C]/55 border border-[#ffce56]/55 rounded-lg px-2 py-1 text-center" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,206,86,.15)' }}>
          <div className="text-[7px] font-bold tracking-widest text-white/55">WING L</div>
          <div className="text-[9px] font-bold text-white/80 inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'radial-gradient(circle at 35% 30%,#fff7c0,#f5c43c 70%,#a07c00)' }} />
            50
          </div>
        </div>
        <div className="bg-[#0F141C]/55 border border-white/10 rounded-lg px-2 py-1 text-center opacity-60">
          <div className="text-[7px] font-bold tracking-widest text-white/55">UPGRADE</div>
          <div className="text-[9px] font-bold text-white/80 inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'radial-gradient(circle at 35% 30%,#fff7c0,#f5c43c 70%,#a07c00)' }} />
            150
          </div>
        </div>
      </div>
    </div>
  )
}

function CtaMock() {
  return (
    <div className="w-full h-full flex items-end justify-center pb-6 bg-gradient-to-b from-[#bfe3ff] to-[#e8f4ff]">
      <button
        className="px-5 py-3 rounded-xl text-white font-black text-[12px] tracking-widest uppercase inline-flex items-center gap-2"
        style={{
          background: 'linear-gradient(135deg,#22c55e,#0a8a3a)',
          boxShadow: '0 8px 28px rgba(34,197,94,.45)',
          animation: 'mock-pulse 1.6s ease-in-out infinite',
        }}
      >
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M3 3l16.5 9-16.5 9V3z" /></svg>
        Play on Google Play
      </button>
      <style jsx>{`@keyframes mock-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}`}</style>
    </div>
  )
}

function TitleMock() {
  return (
    <div className="w-full h-full flex items-center justify-center p-4 bg-gradient-to-b from-[#bfe3ff] to-[#e8f4ff]">
      <div className="text-[#0F141C] font-bold text-base tracking-wide">
        <span className="font-extrabold">Airplane</span> Evolution
      </div>
    </div>
  )
}
