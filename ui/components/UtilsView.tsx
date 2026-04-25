'use client'

import { useEffect, useState } from 'react'

type CatalogItem = {
  name: string
  file: string
  demo: string | null
  signature: string
  description: string
  depends?: string[]
  tags?: string[]
}

type Category = {
  id: string
  label: string
  description: string
  items: CatalogItem[]
}

type Catalog = {
  version: string
  categories: Category[]
}

export default function UtilsView() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('vfx')
  const [openSource, setOpenSource] = useState<{ name: string; src: string; demo: string | null } | null>(null)

  useEffect(() => {
    fetch('/utils/catalog.json').then(r => r.json()).then(setCatalog)
  }, [])

  const handleViewSource = async (item: CatalogItem) => {
    const res = await fetch('/utils/' + item.file)
    const src = await res.text()
    setOpenSource({ name: item.name, src, demo: item.demo })
  }

  if (!catalog) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        Loading library…
      </div>
    )
  }

  const current = catalog.categories.find(c => c.id === activeCategory) ?? catalog.categories[0]
  const visibleItems = current.items.filter(i => i.demo)
  const totalItems = catalog.categories.reduce((n, c) => n + c.items.filter(i => i.demo).length, 0)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {catalog.categories.map(cat => {
            const count = cat.items.filter(i => i.demo).length
            const active = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  active
                    ? 'bg-[#0F141C] text-white'
                    : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-[#0F141C]'
                }`}
              >
                {cat.label}
                <span className={`ml-1 text-[9.5px] ${active ? 'opacity-60' : 'text-gray-400'}`}>{count}</span>
              </button>
            )
          })}
        </div>
        <div className="text-[10px] text-gray-400 font-medium hidden sm:block">
          {totalItems} utilities · v{catalog.version}
        </div>
      </div>

      <div className="flex-1 overflow-auto pb-4">
        <p className="text-[11px] text-gray-400 mb-3">{current.description}</p>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {visibleItems.map(item => (
            <UtilCard key={item.name} item={item} onViewSource={() => handleViewSource(item)} />
          ))}
        </div>
      </div>

      {openSource && (
        <SourceModal
          name={openSource.name}
          src={openSource.src}
          demo={openSource.demo}
          onClose={() => setOpenSource(null)}
        />
      )}
    </div>
  )
}

function UtilCard({ item, onViewSource }: { item: CatalogItem; onViewSource: () => void }) {
  return (
    <button
      onClick={onViewSource}
      className="bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all overflow-hidden flex flex-col text-left group"
    >
      <div className="bg-[#F6F9FC] aspect-[3/4] relative overflow-hidden border-b border-gray-100">
        {item.demo ? (
          <iframe
            src={'/utils/' + item.demo}
            className="w-full h-full border-0 block"
            scrolling="no"
            sandbox="allow-scripts allow-same-origin"
            loading="lazy"
            style={{ pointerEvents: 'none' }}
          />
        ) : null}
        <div className="absolute inset-0 bg-transparent group-hover:bg-[#0F141C]/[0.03] transition-colors" />
      </div>

      <div className="p-2.5 flex flex-col gap-1">
        <div className="font-bold text-[#0F141C] text-[12px] leading-tight truncate">{item.name}</div>
        <p className="text-[10px] text-gray-400 leading-snug line-clamp-2">{item.description}</p>
      </div>
    </button>
  )
}

function SourceModal({ name, src, demo, onClose }: { name: string; src: string; demo: string | null; onClose: () => void }) {
  const handleCopy = () => navigator.clipboard.writeText(src)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-5xl w-full max-h-[88vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Source</div>
            <div className="font-bold text-[#0F141C] text-sm">{name}</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F6F9FC] border border-gray-200 text-gray-600 hover:bg-gray-100"
            >
              Copy
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0F141C] text-white hover:bg-[#1e2a3a]"
            >
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] overflow-hidden">
          <div className="bg-[#F6F9FC] border-r border-gray-100 flex items-center justify-center p-4">
            {demo ? (
              <iframe
                src={'/utils/' + demo}
                className="w-full h-full max-h-[640px] aspect-[3/4] border-0 rounded-lg shadow-sm"
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <div className="text-gray-400 text-xs">No interactive demo</div>
            )}
          </div>
          <pre className="overflow-auto p-5 text-[11.5px] leading-snug font-mono bg-[#0e1320] text-[#e6e9f0]">
            <code>{src}</code>
          </pre>
        </div>
      </div>
    </div>
  )
}
