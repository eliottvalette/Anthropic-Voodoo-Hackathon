'use client'

import { useCallback, useState, useRef } from 'react'

interface DropZoneProps {
  label: string
  sublabel: string
  accept: string
  multiple?: boolean
  onFiles: (files: File[]) => void
  files: File[]
  icon: React.ReactNode
}

function isAccepted(file: File, accept: string): boolean {
  return accept.split(',').some(a => {
    const t = a.trim()
    if (t.startsWith('.')) return file.name.toLowerCase().endsWith(t)
    if (t.endsWith('/*')) return file.type.startsWith(t.slice(0, -2))
    return file.type === t
  })
}

export default function DropZone({ label, sublabel, accept, multiple = false, onFiles, files, icon }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f => isAccepted(f, accept))
    if (dropped.length) onFiles(dropped)
  }, [accept, onFiles])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) onFiles(Array.from(e.target.files))
  }, [onFiles])

  const hasFiles = files.length > 0
  const active = isDragging || hasFiles

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`
        relative flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed
        cursor-pointer transition-all duration-150 select-none min-h-[140px]
        ${isDragging
          ? 'border-[#0055FF] bg-[#0055FF08]'
          : hasFiles
            ? 'border-[#0F141C] bg-white'
            : 'border-gray-200 bg-white hover:border-[#0055FF] hover:bg-[#0055FF04]'
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />

      {hasFiles ? (
        <div className="w-full space-y-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
          <div className="space-y-1.5">
            {files.slice(0, 6).map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-[#0F141C]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0055FF] flex-shrink-0" />
                <span className="font-medium truncate flex-1">{f.name}</span>
                <span className="text-gray-400 flex-shrink-0 tabular-nums">
                  {f.size > 1024 * 1024
                    ? `${(f.size / 1024 / 1024).toFixed(1)}MB`
                    : `${Math.round(f.size / 1024)}KB`}
                </span>
              </div>
            ))}
            {files.length > 6 && (
              <p className="text-xs text-gray-400 pl-3.5">+{files.length - 6} more</p>
            )}
          </div>
          <p className="text-[10px] text-gray-300 text-center pt-1">Click to replace</p>
        </div>
      ) : (
        <>
          <div className={`transition-colors duration-150 ${active ? 'text-[#0055FF]' : 'text-gray-300'}`}>
            {icon}
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-[#0F141C]">{label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>
          </div>
        </>
      )}
    </div>
  )
}
