'use client'

export default function MockToggle({
  mockMode,
  onToggle,
  disabled,
  reason,
}: {
  mockMode: boolean
  onToggle: () => void
  disabled?: boolean
  reason?: string
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      title={disabled ? reason : mockMode ? 'Mock: fake delays + sample data' : 'Real: runs proto-pipeline-m via /api/gemini'}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 disabled:opacity-50 ${
        mockMode
          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${mockMode ? 'bg-amber-500' : 'bg-emerald-500'}`} />
      {mockMode ? 'Mock' : 'Real'}
    </button>
  )
}
