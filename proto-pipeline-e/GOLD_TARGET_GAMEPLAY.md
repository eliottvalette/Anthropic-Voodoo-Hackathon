# Gold Target Gameplay — Castle Clashers

This document describes, behaviorally and numerically, the playable that lives at `targets/castle_clashers_gold/`. It is the **objective the pipeline must converge on**. Generated playables are scored against this reference: the closer the runtime behavior, layout, and feedback match what is described here, the higher the run scores under `targets/castle_clashers_gold/scoring_rubric.json`.

The spec is inferred directly from `source/game.js`, `source/assets.json`, `target_manifest.json`, and `expected_behavior.json`. Numeric constants are quoted from code so the pipeline can reproduce them.

---

## 1. One-line pitch

A turn-based, drag-and-release artillery duel between two opposing castles. The player aims one of three artillery units, the enemy auto-fires back, castles crumble in three visible stages, and the match ends with a Play Now CTA.

---

## 2. Frame, viewport, and world

| Property | Value |
|---|---|
| Logical canvas | `360 × 640` (portrait, 9:16) |
| World width | `740` (camera pans inside the world) |
| Camera default y | `330` |
| Scaling | `object-fit: contain`, no scrollbars, no overflow |
| Background | `#050812` body, world filled with `images.background` cover |

The canvas is fixed-resolution and scaled to fit. Pointer events are mapped from screen space → canvas space → world space via the active camera (`pointerToWorld`).

---

## 3. Scene layout

```
   x=0                       x=370 (mid)                     x=740
   │                           │                               │
   │  ┌──────────┐                              ┌──────────┐   │
   │  │  player  │      Vs                      │  enemy   │   │
   │  │  castle  │  (HUD top)                   │  castle  │   │
   │  │  unit2   │                              │  unit2   │   │
   │  │  unit1   │                              │  unit1   │   │
   │  │  unit0   │                              │  unit0   │   │
   │  └──────────┘                              └──────────┘   │
```

| Element | Position (world coords) | Size |
|---|---|---|
| Player castle | `(34, 124)` | `235 × 386` |
| Enemy castle | `(472, 124)` | `235 × 386` |
| Player unit slots | `(131,271) (187,376) (102,455)` | per-slot anchors |
| Enemy unit slots | `(601,271) (545,376) (630,455)` | mirrored |

Enemy sprites are drawn with `ctx.scale(-1, 1)` — same artwork, flipped horizontally.

---

## 4. Unit roster

Each side has **three units, one per slot**, each owning one projectile type. Slot index determines the type on both sides:

| Slot | Unit role | Projectile role | Color | Damage label |
|---|---|---|---|---|
| 0 | `unitPoison` | `projPoison` | `#73f03f` | `-44` |
| 1 | `unitFire` | `projFire` | `#ff8a27` | `-72` |
| 2 | `unitMissile` | `projMissile` | `#ff4141` | `-100` |

Damage labels are cosmetic floating numbers — actual HP loss is always 1 per hit. The numeric label matches the unit's flavor and reinforces escalation as the duel progresses through slots.

---

## 5. Turn loop

Fixed turn rotation, no skipping:

```
player_0 → enemy_0 → player_1 → enemy_1 → player_2 → enemy_2 → (loop)
```

Phase machine:

```
loading → aiming ─(player fires)→ projectile ─(impact or out-of-bounds)→ aiming|enemy_wait
                                                                                  │
                          enemy_wait ─(650ms)→ projectile ───────────────────────┘
                                       │
                                       ↓
                                     ended (CTA visible)
```

Turn advances ~360 ms after a hit, ~260 ms after a miss. If `playerHp == 0` or `enemyHp == 0` after a hit, the match ends instead of advancing.

Active-unit affordance: a translucent disc in the unit's type color is drawn behind the active unit (alpha 0.26, radius 34). This is the visual cue that the unit is the one currently aiming.

---

## 6. Player controls — drag and release

Input is **pointer-only**: `pointerdown` → `pointermove` → `pointerup`. No tap-to-aim, no buttons.

1. Pointer must come down within 95 world units of the active unit's anchor; otherwise the drag is ignored.
2. While dragging, a **dotted ballistic preview** is drawn (20 white dots, alpha fading from 0.95 to 0.15) plus a thick white line from the muzzle to the pointer.
3. Pull is **backward and slightly up**: the further you pull left/down, the stronger and flatter the shot.
4. Release fires one projectile from the muzzle (`unitSlots[side][slot]`, y offset −20). Velocity:

```
pullX = clamp(startX − x, 26, 135)
pullY = clamp(startY − y, −85, 105)
vx    = 0.24 + pullX * 0.0038      // forward, always positive for player
vy    = −0.27 + pullY * 0.0027     // upward bias
```

5. A small recoil burst (`burst(...)` 8 white particles) plays at the muzzle on release.

The `state.inputs` counter is incremented on **both** pointerdown (when valid) and pointerup. This is the verification floor for "the player actually interacted."

---

## 7. Enemy AI

Deterministic-feeling but with bounded noise:

- Triggered by `phase == "enemy_wait"`. After a 650 ms dwell, the enemy fires.
- Aim point inside the player castle hitbox:

```
aimX = box.x + box.w * (0.42 + sin(timer*2.1 + slot) * 0.16)
aimY = box.y + box.h * (0.44 + cos(timer*1.7 + slot) * 0.14)
```

- Flight time fixed at `930 ms`. Velocities are solved analytically given the aim point and gravity (`0.00078`), so the arc lands on `(aimX, aimY)` if the hitbox hasn't moved.
- The bounded sine/cosine noise means enemies miss occasionally (especially as castle hitboxes shrink), which keeps the duel readable rather than executioner-style.

---

## 8. Projectile physics

Same model for both sides:

| Property | Value |
|---|---|
| Gravity | `0.00078` units / ms² |
| Rotation | `atan2(vy, vx)` each frame (sprite points along trajectory) |
| Trail | every ~45 ms a 2-particle burst in the projectile's type color, drifting opposite to flight |
| Glow | 16-pixel `shadowBlur` in projectile color while drawn |
| Cleanup | despawn if `x < −80`, `x > 820`, `y > 690`, or `age > 2900 ms` |

Only one projectile in flight at a time (single shot per turn), but the engine supports multiple — the array is iterated.

---

## 9. Hit detection and damage model

- AABB hitbox per castle, **shrinks with HP**:

```
visibleW = castle.w * (hp / 3)
playerBox = { x: c.x + 28,                     y: c.y+80, w: max(0, visibleW − 44), h: c.h − 125 }
enemyBox  = { x: c.x + c.w − visibleW + 18,    y: c.y+80, w: max(0, visibleW − 44), h: c.h − 125 }
```

- A projectile inside the opposing hitbox triggers `applyHit`. One hit = `-1 HP`.
- Both castles start at `3 HP` (`damage_model.castle_hp`).
- After a hit, the next turn is queued via `setTimeout(advanceTurn, 360)`.

---

## 10. Castle destruction visuals

Each castle is split into **three jagged polygonal sections** in normalized coordinates (`SECTION_POLYS` in code). Sections are stacked top-to-bottom; the **top falls first**, bottom survives longest.

For a castle at HP `h`:
- Sections `0..h-1` are drawn intact (clipped by their polygon and filled with the castle image via `drawContain`).
- The newly destroyed section is added to `state.dyingSections` and animated for **520 ms**:
  - drifts horizontally at `±0.045 px/ms` (away from the impact side)
  - falls with `0.5 * 0.001 * age²` (quadratic, free-fall feel)
  - fades alpha as `1 − t²` where `t = age / 520`
- A **smoke puff** (18 particles), a **debris cloud** (16 gray squares with rotation), a **floating damage number**, and a **screen shake of magnitude 10** (decaying at `0.045/ms`) all play on impact.

The hitbox immediately shrinks to match the new HP — subsequent shots aimed at the destroyed top will fly past, which the player feels as the duel "tightening."

---

## 11. Camera behavior

The camera lerps smoothly toward per-phase targets (`updateCamera`):

| Phase / situation | Target x | Target zoom |
|---|---|---|
| Player aiming | `165` | `1.28` |
| `enemy_wait` | `570` | `1.34` |
| `projectile` (any side) | `activeProjectile.x` | `0.82` (pulls out) |
| CTA — victory | `590` | `0.92` |
| CTA — defeat | `150` | `0.92` |

Lerp factor is `min(1, dt / 260)`. Camera y always returns toward `330`. Shake is added on top of the camera transform with `(Math.random() − 0.5) * shake` per axis.

The "punch out then track the projectile" combo is the signature feel of the playable — generated playables that hold a static camera lose visual fidelity points.

---

## 12. HUD

Drawn in screen space (`drawFixedUi`, after the camera transform is restored):

- **Top trapezoid HP bars**: blue at `(8, 8, 132 × 28)`, red at `(220, 8, 132 × 28)`, with black drop-trapezoid behind. Bar fills are flat color; HP is shown as **percentage** centered in each bar.
- **"Vs" badge**: 53 px black-outlined white text at `(180, 55)`.
- **Castle icons**: small flag-roof icons at `(30, 56)` (blue) and `(296, 56)` (red).
- **Side HP repeats**: outlined percentage text at `(13, 111)` left-aligned and `(347, 111)` right-aligned — redundant with the bars, reinforces the duel framing.
- **Bottom hint**: at `y = 594`, centered, either `PULL BACK TO SHOOT` (player aiming) or `ENEMY AIMING` (enemy turn). Hidden when projectile is in flight or CTA is up.

All HUD text uses `drawOutlinedText` — black stroke (line width = `0.18 * fontSize`) under white fill, Arial 900 weight. This is the Castle Clashers chunky-outlined-text look.

---

## 13. End state and CTA

Triggered when a castle reaches `0 HP`:

1. `state.result = "victory" | "defeat"` and `state.ctaVisible = true`.
2. A 64-particle gold burst (`#ffbf31`) plays on the destroyed castle's center.
3. End card (`drawEndCard`):
   - Black overlay at alpha `0.55` over the whole canvas.
   - `images.endOverlay` drawn cover-fit. Alpha `0.92` on defeat (heavier), `0.55` on victory (lighter).
   - Title: `UNITS DESTROYED!` (victory, 27 px) or `BATTLE FAILED` (defeat, 31 px) at `y = 223`.
   - Green rounded "PLAY NOW" button at `(72, 312, 216 × 68)`, fill `#44e537`, stroke `#0f7318`, 14 px corners, label centered at `y = 354`.
   - Subtitle `Tap to open the store` at `y = 404`.
4. While the CTA is visible, **any pointer down** anywhere on the canvas calls `openStore`.

`openStore` order:

```js
if (window.mraid && typeof window.mraid.open === "function") mraid.open(STORE_URL);
else window.open(STORE_URL, "_blank", "noopener,noreferrer");
```

Where `STORE_URL = "https://play.google.com/store/apps/details?id=com.epicoro.castleclashers"`.

The CTA **must not** call `window.location = ...` or `top.location = ...` — playable preview iframes block that and the build will be flagged in `scoring_rubric.criteria.playable_ad_compliance`.

---

## 14. Verification hooks (`window.__engineState`)

The runtime exposes a deterministic state surface used by the bench's verify harness and by `expected_behavior.json`:

```ts
window.__engineState = {
  phase:        "loading" | "aiming" | "enemy_wait" | "projectile" | "ended" | "error",
  turnIndex:    number,                  // 0..5, mod 6
  playerHp:     0..3,
  enemyHp:      0..3,
  projectiles:  number,                  // active in-flight count
  inputs:       number,                  // monotonic pointer counter
  ctaVisible:   boolean,
  snapshot():   { phase, turnIndex, playerHp, enemyHp, projectiles,
                  inputs, ctaVisible, result, camera: { x, zoom } }
}
```

- `inputs` strictly increases on pointerdown (when valid) and pointerup. Verify metric 6 (`interaction_state_change`) reads this.
- `phase` changes on input → fire → impact → end. The bench can detect a complete round by observing `aiming → projectile → aiming|enemy_wait`.
- `ctaVisible` flips exactly once per match, right when the game ends.

A generated playable that exposes these fields (matching names, matching behavior) passes the deterministic-state slice of the rubric without any other coupling.

---

## 15. Hard constraints (what the pipeline must respect)

From `target_manifest.json` and `scoring_rubric.json`:

| Constraint | Source | Hard limit |
|---|---|---|
| Single-file output | manifest `single_file_playable` | one HTML file |
| Size budget | `single_file_budget_bytes` | ≤ 5 MB |
| External runtime deps | `external_runtime_dependencies` | none (no CDN, no `<script src>`, no `<link href>`) |
| Iframe-safe CTA | `iframe_safe_cta` | use `mraid.open` or `window.open`, never iframe nav |
| Offline after load | `offline_after_load` | no fetch/XHR after boot |
| Viewport | `viewport.scaling` | `contain_no_overflow` — no scrollbars, no overflow |

Plus, from the rubric's check lines:

- Top bar must contain **player health, timer / Vs badge, enemy health**.
- Player castle on the **left**, enemy castle on the **right**.
- Trajectory preview must be visible **while dragging**.
- Hits must produce **shake, impact particles, and floating damage**.
- Castle destruction must show **three visible states** before destroyed.
- CTA must appear on **both victory and defeat**.

Violating any of these zeroes out the corresponding rubric criterion.

---

## 16. Numeric reference (for codegen prompts)

Drop-in table for the codegen stage. These are the values the gold target uses; deviating costs visual-fidelity points.

```
canvas:        360 × 640
world width:   740
camera y:      330
gravity:       0.00078
player:
  pull x:      [26, 135]
  pull y:      [-85, 105]
  vx fn:       0.24 + pullX * 0.0038
  vy fn:       -0.27 + pullY * 0.0027
  drag radius: 95
enemy:
  delay:       650 ms
  flight:      930 ms
  aim noise x: 0.16 amplitude
  aim noise y: 0.14 amplitude
projectile:
  trail every: 45 ms
  despawn x:   < -80 or > 820
  despawn y:   > 690
  max age:     2900 ms
hit:
  shake:       10 (decay 0.045/ms)
  burst:       28 particles
  debris:      16 squares
  smoke:       18 puffs
  floats life: 850 ms
  next turn:   360 ms after hit, 260 ms after miss
destruction:
  sections:    3 (jagged polys)
  dying age:   520 ms
  drift vx:    ±0.045 px/ms
  fall accel:  0.001 px/ms²
camera lerp:   dt / 260
end burst:     64 gold particles (#ffbf31)
```

---

## 17. Asset role contract

The codegen layer must resolve these roles to images. Filenames are NOT part of the contract — only roles are.

| Role | Required | Description |
|---|---|---|
| `background` | yes | World backdrop, drawn cover-fit across world width |
| `castlePlayer` | yes | Blue castle, left side, clipped per HP into 3 sections |
| `castleEnemy` | yes | Red castle, right side, same clipping logic |
| `unitPoison` | yes | Slot 0 unit sprite, both sides |
| `unitFire` | yes | Slot 1 unit sprite, both sides |
| `unitMissile` | yes | Slot 2 unit sprite, both sides |
| `projPoison` | yes | Slot 0 projectile |
| `projFire` | yes | Slot 1 projectile |
| `projMissile` | yes | Slot 2 projectile |
| `endOverlay` | yes | Cover-fit image behind the end card |

P2 (asset mapping) must produce this exact role set for the Castle Clashers target. Missing roles fall back to colored shapes — playable still works, but `visual_fidelity` drops.

---

## 18. What "tending toward this target" means in practice

The pipeline is graded on how close the generated playable comes to the behavior described above, weighted by `scoring_rubric.json`:

- **35 pts — core gameplay** — turn order, drag-release, enemy auto-fire, ballistic arcs, damage progression, end condition.
- **20 pts — visual fidelity** — extracted assets, left/right castle layout, portrait composition, HUD top bar.
- **15 pts — feedback** — drag preview, shake + particles + floating damage, three destruction states.
- **15 pts — playable-ad compliance** — single file, CTA on both outcomes, MRAID-safe CTA, no external runtime.
- **15 pts — layout & runtime** — 9:16 scaling, no overflow, deterministic `__engineState`, ≤ 5 MB.

Maximum is 100. The pipeline's job is to author P3/P4 prompts that walk Gemini toward this spec — not to embed it as a template. The gold target is the **convergence destination**; benchmark variants are graded on how close they steer.
