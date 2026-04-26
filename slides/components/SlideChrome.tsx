import { Sponsors } from './Sponsors'

type Props = {
  index: number
  total: number
  eyebrow: string
  children: React.ReactNode
}

export function SlideChrome({ index, total, eyebrow, children }: Props) {
  return (
    <div data-slot="slide-chrome" className="absolute inset-0 flex flex-col bg-bg">
      <div className="absolute inset-0 dot-grid opacity-40 pointer-events-none" aria-hidden />
      <header className="relative px-[6%] pt-[4%] flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2 w-2 rounded-sm bg-brand" />
          <span className="text-[11px] uppercase tracking-[0.32em] font-display text-brand">
            {eyebrow}
          </span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.28em] font-display text-muted whitespace-nowrap">
          E220 — Eliott Valette · Nicolas Grimaldi · Mathis Villaret
        </div>
        <div className="text-[11px] uppercase tracking-[0.32em] text-muted font-mono">
          {String(index + 1).padStart(2, '0')} <span className="text-line">/</span> {String(total).padStart(2, '0')}
        </div>
      </header>
      <div className="relative flex-1 px-[6%] py-[2%]">{children}</div>
      <Sponsors />
    </div>
  )
}
