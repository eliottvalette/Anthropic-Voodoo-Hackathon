'use client'

import { useEffect, useMemo, useState } from 'react'
import Library3DCard from './Library3DCard'
import Library2DMock from './Library2DMock'

type CatalogItem = {
  name: string
  file?: string
  demo?: string | null
  signature?: string
  description: string
  depends?: string[]
  tags?: string[]
  kind?: '3d' | 'code' | '2d-mock'
  builder?: string
  preview?: string
  _source?: 'utils' | 'utils-3d'
}

type Category = {
  id: string
  label: string
  description: string
  items: CatalogItem[]
}

type Catalog = {
  version: string
  description?: string
  categories: Category[]
}

const CATEGORY_ORDER = ['vfx', 'hud', 'mechanics', 'end-screens', 'models']
const HIDDEN_CATEGORIES = new Set(['templates'])

function mergeCatalogs(c2d: Catalog | null, c3d: Catalog | null): Catalog | null {
  if (!c2d && !c3d) return null
  const map = new Map<string, Category>()
  // Source 2D first so its labels win on shared ids
  for (const cat of c2d?.categories ?? []) {
    map.set(cat.id, {
      ...cat,
      items: cat.items.map(i => ({ ...i, _source: 'utils' as const })),
    })
  }
  for (const cat of c3d?.categories ?? []) {
    const items3d = cat.items.map(i => ({ ...i, _source: 'utils-3d' as const }))
    if (map.has(cat.id)) {
      const existing = map.get(cat.id)!
      existing.items = [...existing.items, ...items3d]
    } else {
      map.set(cat.id, { ...cat, items: items3d })
    }
  }
  // Order categories by CATEGORY_ORDER, then alphabetical fallback
  const ordered = Array.from(map.values()).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.id)
    const bi = CATEGORY_ORDER.indexOf(b.id)
    if (ai === -1 && bi === -1) return a.label.localeCompare(b.label)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
  return {
    version: c2d?.version ?? c3d?.version ?? '0',
    categories: ordered,
  }
}

export default function UtilsView() {
  const [catalog2D, setCatalog2D] = useState<Catalog | null>(null)
  const [catalog3D, setCatalog3D] = useState<Catalog | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('vfx')
  const [openSource, setOpenSource] = useState<{ name: string; src: string; demo: string | null; source: 'utils' | 'utils-3d' } | null>(null)

  useEffect(() => {
    fetch('/utils/catalog.json').then(r => r.json()).then(setCatalog2D).catch(() => null)
    fetch('/utils-3d/catalog.json').then(r => r.json()).then(setCatalog3D).catch(() => null)
  }, [])

  const catalog = useMemo(() => mergeCatalogs(catalog2D, catalog3D), [catalog2D, catalog3D])

  const handleViewSource = async (item: CatalogItem) => {
    if (!item.file) return
    const root = item._source === 'utils-3d' ? '/utils-3d/' : '/utils/'
    const res = await fetch(root + item.file)
    const src = await res.text()
    setOpenSource({ name: item.name, src, demo: item.demo ?? null, source: item._source ?? 'utils' })
  }

  if (!catalog) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        Loading library…
      </div>
    )
  }

  // Only show items that have an actual showcase (demo iframe, 3D scene, or 2D mock).
  // Pure code modules (kind: 'code') are excluded — no preview, no card.
  const isRenderable = (i: CatalogItem) => !!(i.demo || i.kind === '3d' || i.kind === '2d-mock')
  const renderableCategories = catalog.categories.filter(
    c => !HIDDEN_CATEGORIES.has(c.id) && c.items.some(isRenderable)
  )
  const current = renderableCategories.find(c => c.id === activeCategory)
    ?? renderableCategories[0]
  if (!current) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        No items.
      </div>
    )
  }

  const visibleItems = current.items.filter(isRenderable)
  const totalItems = renderableCategories.reduce((n, c) => n + c.items.filter(isRenderable).length, 0)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {renderableCategories.map(cat => {
            const count = cat.items.filter(isRenderable).length
            const active = current.id === cat.id
            const has3D = cat.items.some(i => i._source === 'utils-3d')
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all inline-flex items-center gap-1.5 ${
                  active
                    ? 'bg-[#0F141C] text-white'
                    : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-[#0F141C]'
                }`}
              >
                {cat.label}
                {has3D && (
                  <span className={`text-[8.5px] font-black px-1 py-px rounded ${
                    active ? 'bg-white/20 text-white' : 'bg-[#0055FF]/10 text-[#0055FF]'
                  }`}>3D</span>
                )}
                <span className={`text-[9.5px] ${active ? 'opacity-60' : 'text-gray-400'}`}>{count}</span>
              </button>
            )
          })}
        </div>
        <div className="text-[10px] text-gray-400 font-medium hidden sm:block">
          {totalItems} items · v{catalog.version}
        </div>
      </div>

      <div className="flex-1 overflow-auto pb-4">
        <p className="text-[11px] text-gray-400 mb-3">{current.description}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleItems.map(item => (
            <UtilCard
              key={`${item._source}/${item.name}`}
              item={item}
              onViewSource={() => handleViewSource(item)}
            />
          ))}
        </div>
      </div>

      {openSource && (
        <SourceModal
          name={openSource.name}
          src={openSource.src}
          demo={openSource.demo}
          source={openSource.source}
          onClose={() => setOpenSource(null)}
        />
      )}
    </div>
  )
}

function UtilCard({ item, onViewSource }: { item: CatalogItem; onViewSource: () => void }) {
  const is3D = item._source === 'utils-3d'
  return (
    <div className="bg-white rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all overflow-hidden flex flex-col relative">
      {is3D && (
        <span className="absolute top-2 right-2 z-10 text-[8.5px] font-black px-1.5 py-0.5 rounded bg-[#0055FF] text-white tracking-widest">
          3D
        </span>
      )}
      <div className="bg-[#F6F9FC] aspect-[3/4] relative overflow-hidden border-b border-gray-100">
        {item.kind === '3d' && item.builder ? (
          <Library3DCard builder={item.builder} />
        ) : item.kind === '2d-mock' && item.preview ? (
          <Library2DMock preview={item.preview} />
        ) : item.demo ? (
          <iframe
            src={(item._source === 'utils-3d' ? '/utils-3d/' : '/utils/') + item.demo}
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
          {item.file && (
            <button
              onClick={onViewSource}
              className="text-[10px] font-semibold text-[#0055FF] hover:underline shrink-0"
            >
              View source
            </button>
          )}
        </div>
        {item.signature && (
          <code className="text-[10.5px] text-gray-500 font-mono leading-snug break-all">
            {item.signature}
          </code>
        )}
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

function SourceModal({ name, src, demo, source, onClose }: { name: string; src: string; demo: string | null; source: 'utils' | 'utils-3d'; onClose: () => void }) {
  const handleCopy = () => navigator.clipboard.writeText(src)
  const root = source === 'utils-3d' ? '/utils-3d/' : '/utils/'

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
                src={root + demo}
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
