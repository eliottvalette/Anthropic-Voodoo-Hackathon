# Guide — convert an HTML playable to AppLovin-compliant

Operational recipe for Claude. Goal: take any single-file HTML playable in this repo and make it pass the AppLovin Playable Preview tool **without changing gameplay**.

Verifier: `node --experimental-strip-types scripts/verify-applovin.mts <path...>`
(no args = scans `slides/public/`, `proto-pipeline-m/outputs/`, `proto-pipeline-e/targets/`)

---

## The 7 requirements (codified in the verifier)

| ID | Rule | Failure means |
|----|------|---------------|
| R1 | File ≤ 5 MB | Hard reject by AppLovin. |
| R2 | No `<iframe>`, no external `script/link/img` (only `mraid.js` allowed) | Networks block external requests; ad will render blank. |
| R3 | `<script src="mraid.js"></script>` in `<head>` | Signals MRAID-aware creative; SDK injects the file at runtime. |
| R4 | Literal `mraid.addEventListener('ready', …)` or `mraid.getState() !== 'loading'` or `mraid.ready` token | SDK won't fire init handshake. |
| R5 | `mraid.open(...)` call exists | CTA must route through SDK to attribute installs. |
| R6 | `<meta name="viewport" …>` present | Mobile sizing breaks otherwise. |
| R7 | No `document.write(...)` | Blocked in modern WebViews. |

R1, R2, R7 are real AppLovin blockers. R3–R5 are required by the locked architecture (`memory/project_architecture.md` Q13/Q14). R4 specifically requires the literal `mraid.` prefix — no aliasing to a local variable, the regex won't match.

---

## The patch (drop-in)

Insert this block in `<head>` immediately after `<title>`:

```html
<script src="mraid.js"></script>
<script>
(function(){
  function onReady(){ window.__MRAID_READY__=true; }
  if(!window.mraid){ window.__MRAID_READY__=true; return; }
  if(typeof mraid.getState==='function' && mraid.getState()!=='loading'){ onReady(); }
  else if(typeof mraid.addEventListener==='function'){ mraid.addEventListener('ready', onReady); }
})();
</script>
```

Keep `mraid.` literal — do **not** rewrite as `var m = window.mraid; m.addEventListener(...)`. The verifier (and AppLovin static checks) grep for `mraid.` directly.

---

## Wiring the CTA (R5)

Find every place the playable opens the store. Common shapes:

- `window.open(STORE_URL, ...)`
- `location.href = STORE_URL`
- a click handler on `#cta-play`, `.btn-cta`, or similar

Replace with **mraid-first, window.open fallback** (so the file still works when previewed outside an ad SDK, e.g. in the slide deck iframe):

```js
function openStore(url){
  if(window.mraid && typeof mraid.open === 'function'){
    try { mraid.open(url); return; } catch(e) {}
  }
  try { window.open(url, '_blank', 'noopener,noreferrer'); }
  catch(e) { location.href = url; }
}
```

Then point each CTA handler at `openStore(STORE_URL)`. Do not strip the fallback — the slide deck and local previews need it.

---

## Common violations → fix

### R1 — file > 5 MB
- Re-encode embedded base64 images: PNG → WebP/JPEG, drop alpha if unused, downscale to ≤2× display res.
- Strip unused asset variants from the inline manifest.
- For 3D: reduce texture resolution, decimate meshes, drop unused animations.
- Last resort: ship a smaller asset bank and load via Scenario MCP at codegen time, not at runtime (no HTTP at runtime — see `feedback_no_internet_grounding`).

### R2 — external refs (typically Google Fonts)
- Delete `<link rel="preconnect" href="https://fonts.googleapis.com">` and friends.
- Make sure `font-family` stacks have a system fallback (`'Arial Black', Arial`, `-apple-system, sans-serif`). Almost every playable already does.
- If the font is gameplay-critical (Supercell-style display look), inline it as base64 in a `@font-face` rule. Budget against R1.
- Same fix for any `<img src="https://...">` or `<script src="https://cdn...">` — inline them.

### R3 — missing `<script src="mraid.js">`
- Add the patch block above. Even if the file already has a Voodoo/AppLovin bridge bundled, the literal tag is required.

### R4 — missing ready listener
- Use the patch block as-is. If the playable already wires its own ready logic, you can append a one-liner anywhere: `if(window.mraid){mraid.addEventListener('ready',function(){});}` — but prefer the full patch for consistency.

### R5 — missing `mraid.open(...)`
- Wire the CTA per the section above. If there are multiple CTAs (try-again, end-screen, mid-game upsell), all should route through `openStore()`.

### R6 — missing viewport
- Add: `<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">`

### R7 — `document.write`
- Always replace with DOM APIs (`document.body.appendChild(...)`, template literals into `innerHTML` for inert HTML). No exceptions.

---

## Workflow when given a new playable

1. Run the verifier on the file. Note which Rs fail.
2. Fix R1 first (size) — every other fix adds bytes, so know your budget.
3. Fix R2 (externals) — usually the cheapest delete.
4. Apply the patch block (R3+R4) and CTA wiring (R5).
5. R6/R7 — quick scans, usually already fine.
6. Re-run verifier. Must hit `summary: N/N pass, 0 fail`.
7. Smoke test in a browser: open the file directly, confirm gameplay still works (the patch is a no-op without an SDK), confirm the CTA still opens the store URL via the fallback.

---

## What NOT to do

- Don't gate game start on `mraid.ready` — the slide deck and local previews don't have an SDK; the game must boot without it. The patch sets `window.__MRAID_READY__=true` immediately when `mraid` is absent, but the game shouldn't depend on that flag at all unless the playable is explicitly designed to wait.
- Don't strip the `window.open` fallback from the CTA. It's required for the demo slides (slide 1, slide 3 phones) to function.
- Don't add CDN polyfills "for compatibility" — this re-introduces R2 failures.
- Don't touch `slides/public/playable.html` (the 13 MB Castle Clashers gold target) unless explicitly asked. It's over the size cap and needs re-export, not patching.
- Don't rename `mraid.addEventListener` calls to use a local alias — R4 won't match.
