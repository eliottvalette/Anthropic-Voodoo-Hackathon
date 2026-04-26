export function Sponsors() {
  return (
    <div
      data-slot="sponsors"
      className="absolute bottom-[3%] left-[6%] right-[6%] flex items-center justify-between text-[11px] uppercase tracking-[0.28em] text-muted"
    >
      <div className="flex items-center gap-3">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
        <span className="font-display">Voodoo × Anthropic</span>
      </div>
      <div className="flex items-center gap-6">
        <span>Hackathon · Track 2</span>
        <span className="h-3 w-px bg-line" />
        <span>2026</span>
      </div>
    </div>
  )
}
