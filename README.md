# Voodoo × Anthropic Hackathon — Track 2

Generic pipeline that turns any gameplay video into a single-file HTML
playable ad. Castle Clashers (2D) is the imposed demo; Epic Plane
Evolution (3D) shows generalisation. Built in 30h by team **E220** —
Eliott Valette, Nicolas Grimaldi, Mathis Villaret.

## What it does

```
gameplay video  ─►  Gemini video analysis  ─►  spec JSON
                                                  │
                              2D / 3D routing  ◄──┘
                                  │
                Voodoo asset bank → Scenario.com → fallback
                                  │
                  Gemini codegen (Sonnet 4.6 fallback)
                                  │
                ┌─────────────────┴────────────────┐
                ▼                                  ▼
        single HTML <5MB                AppLovin-compliant playable
```

Output: one HTML file, no CDN, no iframe, ≤5MB, MRAID-ready.

## Repo layout

| Folder | Purpose |
|---|---|
| `proto-pipeline-e/` | Eliott's pipeline (2D, Castle Clashers gold target) |
| `proto-pipeline-m/` | Mathis's pipeline (orchestrator + variations) |
| `nico-sandbox/` | Nicolas's experiments |
| `slides/` | Next.js pitch deck (3 slides, live playable iframes) |
| `utils/`, `utils-3d/` | Shared helpers, 3D Three.js templates |
| `scripts/` | `verify-applovin.mts` — compliance checker for the 7 hard rules |
| `ressources/` | Voodoo asset bank, source videos |
| `litterature/` | Notes, references |
| `PROJECT.md` | Full plan, jury criteria, technical constraints |

## Quick start

**Pitch deck (live demo)**
```bash
cd slides && npm install && npm run dev   # http://localhost:3001
```

## Vercel projects

This repo is deployed to Vercel as a monorepo with two separate Projects:

| Vercel Project | Root Directory | Purpose |
|---|---|---|
| `anthropic-voodoo-hackathon` | `ui/` | Main product UI |
| `anthropic-voodoo-hackathon-phsl` | `slides/` | Jury deck / live slides |

Rules:

- Both projects must use `Framework Preset = Next.js`
- Do not use `Other` for `ui/` or `slides/`
- `ui/vercel.json` and `slides/vercel.json` both pin `"framework": "nextjs"`

**Pipeline** — see `proto-pipeline-e/README.md` and
`proto-pipeline-m/CLAUDE.md`.

**AppLovin compliance check**
```bash
node --experimental-strip-types scripts/verify-applovin.mts [path...]
```

## Constraints (AppLovin)

1. Single HTML file, ≤5 MB
2. No iframes, no external refs (no CDN, no Google Fonts)
3. `<script src="mraid.js">` in `<head>`
4. MRAID `ready` listener
5. CTA via `mraid.open()` (with `window.open` fallback for previews)
6. Viewport meta tag
7. No `document.write`

`scripts/verify-applovin.mts` enforces all seven.

## Jury axes

Quality · Speed · Process robustness · AI usage & creativity.
Differentiation: pipeline genericity + end-to-end demo across 2D and 3D.
