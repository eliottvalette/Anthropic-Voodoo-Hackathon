export default function Page() {
  return (
    <div className="deck-stage">
      <div className="deck-frame">
        <div className="absolute inset-0 dot-grid opacity-40 pointer-events-none" aria-hidden />

        <header className="absolute top-0 left-0 right-0 px-[6%] pt-[4%] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-block h-2 w-2 rounded-sm bg-brand" />
            <span className="text-[11px] uppercase tracking-[0.32em] font-display text-brand">
              Pipeline · Title
            </span>
          </div>
          <div className="text-[11px] uppercase tracking-[0.32em] text-muted font-mono">
            Voodoo × Anthropic
          </div>
        </header>

        <main className="absolute inset-0 flex items-center justify-center px-[6%]">
          <h1 className="rise font-display text-center font-extrabold tracking-tightest text-ink leading-[0.95] text-[clamp(60px,10vw,180px)] max-w-[16ch]">
            Generate <span className="brand-underline">any game</span> you want
            <br />
            from the pipeline.
          </h1>
        </main>

        <footer className="absolute bottom-[4%] left-0 right-0 px-[6%] flex items-center justify-between text-[11px] uppercase tracking-[0.32em] text-muted font-mono">
          <span className="rise rise-delay-2">Video in</span>
          <span className="h-px flex-1 mx-6 bg-line" aria-hidden />
          <span className="rise rise-delay-2">Playable HTML out</span>
        </footer>
      </div>
    </div>
  )
}
