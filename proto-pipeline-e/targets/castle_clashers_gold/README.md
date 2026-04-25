# Castle Clashers Gold Target

This target is the reference playable for the Castle Clashers benchmark. It is not a pipeline output. It is the intended end-state used to compare generated playables against a known-good implementation.

## Format

- `source/index.html` is the readable source entrypoint.
- `source/styles.css` contains the shell layout only.
- `source/game.js` contains the playable logic.
- `source/assets.json` maps semantic asset roles to files.
- `dist/playable.html` is generated as a single-file playable.

## Gameplay Reference

- Portrait phone canvas, fixed logical size `360x640`, scaled with `object-fit: contain`.
- Player castle on the left, enemy castle on the right.
- Three units per castle. Each unit owns one cannon/projectile type.
- Turn order alternates between matching unit slots:
  `player unit 1`, `enemy unit 1`, `player unit 2`, `enemy unit 2`, `player unit 3`, `enemy unit 3`, then loops.
- Player turns use drag and release. Pulling left/back from the active unit previews a dotted trajectory to the right. Releasing fires.
- Enemy turns auto-fire with controlled aim noise toward the player side.
- Projectiles follow visible ballistic arcs.
- Hits spawn impact feedback, floating damage numbers, screen shake, and castle damage.
- Castles lose collision area in three destruction states: full, two-thirds, one-third, destroyed.
- The match ends when either castle is destroyed, then shows a CTA.

## CTA

The CTA uses `mraid.open` when available and falls back to `window.open`. It must not replace the iframe location, because that causes Play Store iframe/X-Frame-Options errors inside dashboards.

## Build

From the repository root:

```sh
node proto-pipeline-e/targets/castle_clashers_gold/build.mjs
```

