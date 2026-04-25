'use client'

import { useMemo, useState } from 'react'

type Run = {
  id: string
  gameName: string
  genre: string
  createdAt: string
  preview: string
}

const FILTERS = ['All', 'Arcade', 'Puzzle', 'Runner', 'Strategy', 'Casual']

const HISTORY: Run[] = [
  {
    id: 'h1',
    gameName: 'Castle Clashers',
    genre: 'Arcade',
    createdAt: '2026-04-25T14:57:31.000Z',
    preview: '/history-previews/cat1.png',
  },
  {
    id: 'h2',
    gameName: 'Marble Sort',
    genre: 'Puzzle',
    createdAt: '2026-04-24T17:42:00.000Z',
    preview: '/history-previews/marble_screen.png',
  },
  {
    id: 'h3',
    gameName: 'Sky Hopper',
    genre: 'Runner',
    createdAt: '2026-04-23T12:20:00.000Z',
    preview: '/history-previews/candy.png',
  },
  {
    id: 'h4',
    gameName: 'Tower Merge',
    genre: 'Strategy',
    createdAt: '2026-04-21T09:15:00.000Z',
    preview: '/history-previews/mcdo.png',
  },
  {
    id: 'h5',
    gameName: 'Knife Hit 3D',
    genre: 'Casual',
    createdAt: '2026-04-18T18:10:00.000Z',
    preview: '/history-previews/cat2.png',
  },
]

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.max(0, Math.floor(diff / 86400000))
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function HistoryCard({ run }: { run: Run }) {
  return (
    <button className="group flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white p-2.5 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
      <div className="basis-[70%] min-h-0 overflow-hidden rounded-xl bg-black">
        <div className="flex h-full w-full items-center justify-center overflow-hidden">
          <img
            src={run.preview}
            alt={`${run.gameName} playable preview`}
            className="h-full w-full object-cover"
          />
        </div>
      </div>
      <div className="basis-[30%] min-h-0 px-0.5 pt-2">
        <div className="truncate text-[13px] font-semibold leading-4 text-[#0F141C]">{run.gameName}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] leading-3 text-gray-400">
          <span>{run.genre}</span>
          <span>·</span>
          <span>{timeAgo(run.createdAt)}</span>
        </div>
      </div>
    </button>
  )
}

export default function HistoryView() {
  const [filter, setFilter] = useState('All')
  const filtered = useMemo(
    () => HISTORY.filter(run => filter === 'All' || run.genre === filter),
    [filter],
  )

  return (
    <div className="h-full overflow-hidden">
      <div className="mx-auto flex h-full max-w-4xl flex-col gap-4">
        <div className="shrink-0 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#0F141C]">Playable History</h2>
              <p className="mt-0.5 text-xs text-gray-400">{filtered.length} runs</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map(item => (
                <button
                  key={item}
                  onClick={() => setFilter(item)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                    filter === item
                      ? 'bg-[#0F141C] text-white'
                      : 'border border-gray-100 bg-[#F6F9FC] text-gray-500 hover:border-gray-200 hover:text-[#0F141C]'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="grid h-full grid-cols-1 grid-rows-2 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(run => (
              <HistoryCard key={run.id} run={run} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
