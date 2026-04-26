# /slides — Voodoo × Anthropic pitch deck

Three-slide Next.js deck for the Track 2 jury pitch.

- **Slide 1** — Castle Clashers playable, live in an iframe.
- **Slide 2** — Animated pipeline flow (6 stages, auto-advances on enter).
- **Slide 3** — Generalisation: Block Blast (2D) + Epic Plane Evolution (3D), side-by-side iframes.

## Run

```bash
cd slides
npm install
npm run dev   # serves on http://localhost:3001
```

`/ui` runs on 3000; `/slides` runs on 3001 so both can run together.

## Navigation

- **← / →** or **Space / PageUp / PageDown** to move
- **Home / End** to jump to first / last slide
- **Click** the right ~40% of the screen to advance, left ~25% to go back
- **Swipe** left/right on touch devices
- The dot bar at the bottom is also clickable

## PDF export

Open the deck, then `Cmd+P` → save as PDF. The print stylesheet:
- forces 1920×1080 page size
- prints all three slides as separate pages
- hides the nav HUD
- preserves brand colors (`-webkit-print-color-adjust: exact`)

The PDF imports cleanly into Google Slides or PowerPoint as the archive copy.
For the live pitch, drive the web deck — the iframes stay interactive.

## Slide 3 TODO

Slot iframes are currently `about:blank` with a TODO overlay. Edit
`components/SlideThree.tsx` and replace the two `src` values with the real
playable HTML paths once they're generated:

```ts
const SLOTS = [
  { title: 'Block Blast', src: '/block-blast.html', ... },
  { title: 'Epic Plane Evolution', src: '/plane.html', ... },
]
```

Drop the playable HTML files into `slides/public/` so Next.js serves them
at the root path.

## Castle Clashers playable source

`public/castle-clashers.html` is a copy of
`proto-pipeline-e/targets/castle_clashers_gold/dist/playable.html` (4.6 MB).
If a newer playable is generated, refresh with:

```bash
cp ../proto-pipeline-e/targets/castle_clashers_gold/dist/playable.html public/castle-clashers.html
```
