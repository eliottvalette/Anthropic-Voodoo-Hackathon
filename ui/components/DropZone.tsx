'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'

const MAX_FILE_BYTES = 500 * 1024 * 1024  // 500 MB per file
const MAX_TOTAL_FILES = 200                // for folder drops
const MAX_FOLDER_DEPTH = 10

interface DropZoneProps {
  label: string
  sublabel: string
  accept: string
  multiple?: boolean
  folder?: boolean
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

async function readEntry(entry: FileSystemEntry, depth: number = 0): Promise<File[]> {
  if (entry.isFile) {
    return new Promise(resolve => {
      (entry as FileSystemFileEntry).file(
        file => resolve([file]),
        () => resolve([])
      )
    })
  }

  if (entry.isDirectory) {
    if (depth >= MAX_FOLDER_DEPTH) {
      console.warn(`[DropZone] Max folder depth ${MAX_FOLDER_DEPTH} reached at ${entry.fullPath}; not descending further.`)
      return []
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const all: File[] = []

    const readBatch = (): Promise<FileSystemEntry[]> =>
      new Promise(resolve => reader.readEntries(resolve, () => resolve([])))

    let batch: FileSystemEntry[]
    do {
      batch = await readBatch()
      for (const e of batch) {
        all.push(...await readEntry(e, depth + 1))
      }
    } while (batch.length > 0)

    return all
  }

  return []
}

function applyDropCaps(files: File[]): File[] {
  const sizeFiltered: File[] = []
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      console.warn(`[DropZone] Dropping oversized file: ${f.name} (${f.size} bytes > ${MAX_FILE_BYTES})`)
      continue
    }
    sizeFiltered.push(f)
  }
  if (sizeFiltered.length > MAX_TOTAL_FILES) {
    const dropped = sizeFiltered.length - MAX_TOTAL_FILES
    console.warn(`[DropZone] Too many files (${sizeFiltered.length}); keeping first ${MAX_TOTAL_FILES}, dropping ${dropped}.`)
    return sizeFiltered.slice(0, MAX_TOTAL_FILES)
  }
  return sizeFiltered
}

export default function DropZone({
  label, sublabel, accept, multiple = false, folder = false, onFiles, files, icon
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  useEffect(() => {
    if (inputRef.current && folder) {
      inputRef.current.webkitdirectory = true
    }
  }, [folder])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const items = Array.from(e.dataTransfer.items)
    const all: File[] = []

    for (const item of items) {
      if (item.kind !== 'file') continue
      const entry = item.webkitGetAsEntry()
      if (!entry) continue
      all.push(...await readEntry(entry))
    }

    const filtered = applyDropCaps(all.filter(f => isAccepted(f, accept)))
    if (filtered.length) onFiles(filtered)
  }, [accept, onFiles])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return
    const filtered = applyDropCaps(Array.from(e.target.files).filter(f => isAccepted(f, accept)))
    if (filtered.length) onFiles(filtered)
  }, [accept, onFiles])

  const hasFiles = files.length > 0

  return (
    <label
      htmlFor={inputId}
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
        id={inputId}
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={folder || multiple}
        onChange={handleChange}
        className="sr-only"
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
          <div className={`transition-colors duration-150 ${isDragging ? 'text-[#0055FF]' : 'text-gray-300'}`}>
            {icon}
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-[#0F141C]">{label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>
          </div>
        </>
      )}
    </label>
  )
}
