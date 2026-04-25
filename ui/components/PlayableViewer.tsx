'use client'

interface PlayableViewerProps {
  html: string
}

export default function PlayableViewer({ html }: PlayableViewerProps) {
  const handleDownload = () => {
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'playable.html'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[#0F141C]">Playable Preview</h2>
          <p className="text-xs text-gray-400 mt-0.5">Self-contained · runs offline</p>
        </div>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F141C] text-white text-xs font-semibold hover:bg-[#1e2a3a] active:scale-95 transition-all duration-150"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 2v6M4 6.5l2.5 2.5L9 6.5M1.5 10.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Download HTML
        </button>
      </div>

      {/* Mobile-ratio frame */}
      <div className="flex justify-center">
        <div
          className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-black"
          style={{ width: 360, height: 640 }}
        >
          <iframe
            srcDoc={html}
            className="w-full h-full"
            style={{ border: 'none' }}
            title="Playable Preview"
            sandbox="allow-scripts"
          />
        </div>
      </div>
    </div>
  )
}
