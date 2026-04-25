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

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
    <div className="bg-white rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all overflow-hidden flex flex-col">
      <div className="bg-[#F6F9FC] aspect-[3/4] relative overflow-hidden border-b border-gray-100">
        {item.demo ? (
          <iframe
            src={'/utils/' + item.demo}
            className="w-full h-full border-0 block"
            scrolling="no"
            sandbox="allow-scripts allow-same-origin"
            loading="lazy"
          />
        ) : null}
      </div>

      <div className="p-3.5 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-[#0F141C] text-sm leading-tight">{item.name}</h3>
          <button
            onClick={onViewSource}
            className="text-[10px] font-semibold text-[#0055FF] hover:underline shrink-0"
          >
            View source
          </button>
        </div>
        <code className="text-[10.5px] text-gray-500 font-mono leading-snug break-all">
          {item.signature}
        </code>
        <p className="text-[11px] text-gray-500 leading-snug">{item.description}</p>
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {item.tags.map(t => (
              <span
                key={t}
                className="px-1.5 py-0.5 rounded bg-[#F6F9FC] border border-gray-100 text-[9.5px] font-medium text-gray-500"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
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
