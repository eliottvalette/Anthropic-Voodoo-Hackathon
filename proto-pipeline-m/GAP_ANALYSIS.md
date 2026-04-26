# Gap Analysis — Recent Runs vs Gold Target

Comparing the two latest **complete** runs (`outputs/myrun_20260426-000714/` on B01 and `outputs/pD_b11_20260425-234756/` on B11) to the gold target spec at `proto-pipeline-e/GOLD_TARGET_GAMEPLAY.md`. Both runs **pass verify** (`runs: true`, all 6 asserts green) — yet neither plays anything close to the gold target. This is exactly the failure mode the rubric was designed to expose: the verify gate is loose enough that semantically wrong playables slip through.

The point of this document: catalog every concrete divergence, then trace each one back to a specific stage in the pipeline so we know what to harden.

---

## 1. Divergences (gold target → recent runs)

Numbered for reference. Each entry: gold behavior → observed behavior → severity.

### 1.1 Turn structure

**Gold**: 6-slot fixed turn rotation `P0→E0→P1→E1→P2→E2→loop`. Three units per side, one per slot, each owning a distinct projectile type.
**Observed (myrun_000714)**: binary turn flag `currentTurn: 'player' | 'enemy'`, no slot rotation, no multi-unit roster. The spec invents a "deployment" phase where the player drags units out of a tray.
**Observed (pD_b11)**: `unitSlots: [null, null, null]` — closer to the gold idea, but again gated behind a deploy step that doesn't exist in the source video.
**Severity**: critical. The signature feel of Castle Clashers (three units, alternating slots, escalating projectile types) is absent.

### 1.2 Drag-release input semantics

**Gold**: pull **backward** from the active unit's muzzle. Pull bounds `pullX ∈ [26,135]`, `pullY ∈ [-85,105]`. Velocity `vx = 0.24 + pullX*0.0038`, `vy = -0.27 + pullY*0.0027`. Drag radius gate of 95 around the active unit.
**Observed (myrun_000714)**: drag is gated by canvas region (`p.y > 540` = deploy, `p.x < 180` = aim) instead of "near the active unit." No pull-bound clamping. Velocity is `dx * powerMultiplier` with `powerMultiplier = 9` — no minimum forward bias, no upward bias, so a tiny pull produces a tiny shot that drops at the muzzle.
**Severity**: critical. Without the `0.24 + ...` floor, most player shots fail to clear their own castle.

### 1.3 Aim direction

**Gold**: pull **left** to fire **right** (slingshot, away from target). The preview dots project toward positive x.
**Observed**: drag vector taken raw (`dx = startX - mouseX`), so the mapping depends on which side the player drags. No enforced "pull away from target" semantic.
**Severity**: high. The interaction is unintuitive without slingshot framing.

### 1.4 Damage model

**Gold**: castles start at **3 HP**. One hit = `-1 HP`. Three discrete destruction states + destroyed.
**Observed (both runs)**: `castleMaxHealth: 100`, `projectileDamage: 25` (myrun) or `damage_per_hit: 15` (pD_b11). Continuous health bars, no destruction states.
**Severity**: critical. The gold's "3 chunks falling off a castle" is the most readable visual storytelling beat — the runs replace it with a bland HP bar.

### 1.5 Castle destruction visuals

**Gold**: castle clipped into 3 jagged polygon sections; on hit, top section detaches, drifts horizontally at `±0.045 px/ms`, falls quadratically, fades over 520 ms. Hitbox shrinks to remaining sections.
**Observed**: no section logic. Both runs use a single sprite tinted/rotated by a `tilt` term (`tilt = (1 - hp/100) * maxTiltAngle`). The "crumbling" is invented — Gemini hallucinated a tilt mechanic that isn't in the source video and isn't in the gold target.
**Severity**: critical. The runs are solving a different problem than the gold target.

### 1.6 Hitbox model

**Gold**: AABB shrinks with HP — `visibleW = c.w * (hp / 3)`, anchored on the inner edge so the part that survives is the bottom slice.
**Observed**: fixed AABB `(20-120, 450-620)` for player and `(240-340, 450-620)` for enemy. Hitbox never changes. No spatial reward for repeated hits.
**Severity**: high. Removes the "the duel tightens as castles shrink" pacing.

### 1.7 Camera

**Gold**: camera lerps between phase-specific targets — pulls out and tracks the projectile during flight (`zoom 0.82`), holds at `(165, 1.28)` while player aims, swings to `(570, 1.34)` for enemy turn.
**Observed**: no camera. Static `360x640` view. World is rendered at the same scale every frame.
**Severity**: high. The "punch out + track" combo is the signature visual rhythm.

### 1.8 Enemy AI

**Gold**: 650 ms dwell, 930 ms flight, aim point inside the **current** player hitbox with bounded sin/cos noise. Velocities solved analytically so the shot lands on (aimX, aimY) under known gravity.
**Observed**: enemy AI mentioned in prompts but the physics subsystem only fires from `state.inputCounter` increments, which only happen on player input. **Enemy never actually fires** in the generated physics file. The win/loss subsystem also has a `tutorial_loss_at_seconds: 25` timer that ends the match independently of HP — so most matches end on the timer, not on damage.
**Severity**: critical. The duel is one-sided.

### 1.9 HUD

**Gold**: blue/red trapezoidal HP bars at the top (`8,8` and `220,8`, both `132 × 28`), large black-outlined "Vs" badge at `(180, 55)`, castle icons at `(30, 56)` / `(296, 56)`, percentage text at `(13, 111)` / `(347, 111)`, hint text `PULL BACK TO SHOOT` / `ENEMY AIMING` at `y=594`.
**Observed**: tiny rectangular health bars `(80×8)` per castle, no Vs badge, no castle icons, no hint text. No outlined-text style.
**Severity**: medium-high. Visual fidelity rubric (20 pts) directly penalizes this.

### 1.10 End card

**Gold**: black overlay alpha 0.55, end-overlay image cover-fit, title text `UNITS DESTROYED!` (victory) / `BATTLE FAILED` (defeat) at `y=223`, green rounded button (`72,312,216×68`, `#44e537` fill, `#0f7318` stroke) labeled `PLAY NOW`, subtitle `Tap to open the store`.
**Observed (myrun_000714)**: black alpha 0.75 overlay, sans-serif "VICTORY!"/"DEFEAT" at center, plain rectangle button (no rounded corners, no green stroke), "PLAY NOW" text. CTA fires when `state.isOver` is true.
**Severity**: medium. Functional but visually generic.

### 1.11 CTA URL

**Gold**: `https://play.google.com/store/apps/details?id=com.epicoro.castleclashers` (Play Store).
**Observed**: `https://apps.apple.com/app/castle-clashers/id1641352927` (App Store).
**Severity**: low. Both are valid; the gold's iframe-safety logic still applies.

### 1.12 `__engineState` shape

**Gold**: `{phase, turnIndex, playerHp, enemyHp, projectiles, inputs, ctaVisible}` — `phase` is a string enum, `turnIndex` is `0..5 mod 6`.
**Observed**: `{frame, inputCounter, playerHealth, enemyHealth, playerTilt, enemyTilt, currentTurn, isOver, dragActive, dragMode, ...}` — different field names, different semantics, includes a `tilt` invention that the gold doesn't have.
**Severity**: medium. Verify metric 6 still passes because **any** mutating field counts, but the rubric's `benchmark hooks expose deterministic state` check fails on a strict reading.

### 1.13 Hallucinated mechanics

**Gold**: no tilt, no tank treads, no unit deployment from a tray.
**Observed (both runs)**: `defining_hook` invents "Castles are mounted on tank treads that tilt and crumble dynamically." This is a P1 hallucination that propagates through the entire chain — P3 builds the codegen prompt around it, P4 generates physics for it, the final HTML implements it. The gold target has none of this.
**Severity**: critical. Demonstrates that a single unchecked claim at P1 corrupts every downstream stage.

### 1.14 Unit roster + projectile typing

**Gold**: 3 unit types (`unitPoison`, `unitFire`, `unitMissile`) with flavor colors (`#73f03f`, `#ff8a27`, `#ff4141`) and damage labels (`-44`, `-72`, `-100`). The 3 projectile types are owned by their units.
**Observed**: 2 generic projectiles (`projectile_missile_a`, `projectile_missile_b`), no unit roster, no damage labels.
**Severity**: high.

### 1.15 Trajectory preview

**Gold**: 20 white dots fading from alpha 0.95 to 0.15, plus a thick white line from muzzle to pointer. Dots project the actual ballistic curve under the same gravity used for the projectile.
**Observed (myrun_000714)**: 14 dots scaled by `0.15` of drag distance — uses the same gravity formula but the launch position is `(pX, pY-40)` (a hardcoded pX of 60), not the active unit's muzzle. Visible at all times during aim drag.
**Severity**: medium.

### 1.16 Tutorial timeout

**Gold**: no time-based loss. Match ends only when one castle reaches 0 HP.
**Observed (myrun_000714)**: `winloss.frame()` ends the match at `elapsed >= 25` seconds **regardless of HP**, because P3 emitted `tutorial_loss_at_seconds: 25`.
**Severity**: critical. Most matches end on the timer, not gameplay.

---

## 2. Stage-by-stage mapping

Each divergence above ties back to one or more pipeline stages. Tracking it here so prompt iteration is targeted, not scattershot.

### P1 (video analysis)

Divergences caused or seeded here: **1.5, 1.13, 1.14, 1.16**.

- **1.5 + 1.13** — `defining_hook: "Castles are mounted on tank treads that tilt and crumble"` is fabricated. The video shows Castle Clashers; the source playable does not have tank treads or tilt. P1 invented a "hook" because the prompt asks for one. The contact-sheet pass picked up tread-like motion artifacts and the merge stage failed to discount them against direct gameplay observation.
- **1.14** — P1's `characters_or_props` lists "Red Monster (bomb thrower) / Skeleton (missile launcher) / Goblin (energy beam)" — not one of these maps to a Castle Clashers asset. Hallucinated unit roster.
- **1.16** — `tutorial_loss_at_seconds: 25` is a P1 invention. The source video does not show a tutorial loss at 25 s; this field is in the merged schema and Gemini fills it with a plausible-sounding number when no evidence is provided.

**Pipeline issue**: P1 has no "I don't know" exit. Every schema field gets a value, even when the video doesn't justify one. The contact-sheet sub-pass adds a second source of hallucination (still images mis-read as motion).

**Fix surface**:
- Make every speculative field nullable AND require timestamp evidence in a sibling field; reject the merge if evidence is empty.
- Reframe `defining_hook` as `defining_hook | null`; the merge prompt should refuse to fill it unless ≥ 2 of the 3 sub-passes independently surface the same beat.
- `tutorial_loss_at_seconds` should be derived from observed gameplay events (a banner appearing in the timeline), not a free-form integer.

### P2 (asset mapping)

Divergences caused: **1.14** (partial).

- P2 correctly maps `Blue Castle.png`, `Red Castle.png`, `Background.png`, `Weapon_1/2.png`, `Projectile_1/2.png`. Then it adds `red_monster`, `skeleton`, `goblin`, `health_bar`, `aiming_trajectory` as `null`-mapped roles — propagating P1's hallucinated unit roster downstream.
- The role names `weapon_player` / `weapon_enemy` (pD_b11) vs `player_weapon` / `enemy_weapon` (myrun) drift — the role naming convention is not stable across runs.

**Pipeline issue**: P2 inherits P1's role list verbatim. There is no "did P1 hallucinate a role that has no asset?" pruning step. Null-mapped roles still appear in P3's prompt and contaminate the codegen.

**Fix surface**:
- Drop roles where `filename: null` AND `match_confidence: low` before passing to P3 (current behavior keeps them).
- Lock the role naming convention in `prompts/_default/2_assets.md` with an explicit role vocabulary (e.g. `player_castle`, `enemy_castle`, `player_weapon`, `enemy_weapon`, `projectile_player`, `projectile_enemy`, `background`).

### P3 (aggregator + GameSpec)

Divergences caused or amplified: **1.1, 1.4, 1.5, 1.13, 1.16**.

- P3 received the hallucinated `defining_hook` and built the entire codegen prompt around it (`# Required behaviour` line: "Dynamic Tilting: When a castle's health decreases, its rotation angle should increase").
- P3 set `castleMaxHealth: 100, projectileDamage: 25` despite the gold's 3-HP discrete model. Continuous HP is the "default plausible" answer; without a strong signal from P1 (which we don't have), P3 picks the easy one.
- P3's scaffold adds a `# Constraints reminder` line `The defining_hook MUST be visibly expressed by t=10s of the playable.` This **promotes hallucinations to hard requirements**. If P1 invents a hook, P3 forces P4 to render it.
- `mechanic_name: "crumbling_castle_artillery"` (myrun) vs `aim_and_fire` (pD_b11) — the static check passes (snake_case present) but neither matches the gold's `manual_artillery_turns`. The verify metric 5 (mechanic name in JS) is satisfied trivially because P3 picks the name that ends up embedded.

**Pipeline issue**: P3 trusts P1's outputs unconditionally. There is no comparison against a known game template (Castle Clashers in V1) or against a `not_this_game` constraint. The `defining_hook MUST be visibly expressed` constraint is the wrong default — it should be `if defining_hook != null AND has_evidence`.

**Fix surface**:
- Make `defining_hook` propagation conditional on `defining_hook_evidence_timestamps.length >= 2`.
- Add a sanity rule: if `numeric_params.castleMaxHealth > 10`, also require a `destruction_states` array — forces the model to commit to discrete or continuous explicitly.
- Replace "MUST be visibly expressed" with "if `defining_hook` is non-null and evidence-grounded, render it; otherwise focus on core_loop fidelity."
- Lock the role vocabulary so `weapon_player` vs `player_weapon` doesn't toggle between runs.

### P4 (codegen, subsystem split)

Divergences caused or made worse: **1.2, 1.3, 1.7, 1.8, 1.9, 1.10, 1.15**.

- The subsystem split is producing **disconnected silos**. `physics.js` reads `state.mouseX/Y` (which doesn't exist anywhere in the state shape — `input.js` tracks `curX/curY` in module-local closure variables and never writes them to state). Result: the slingshot launch always uses `mouseX = 0`, so every shot fires straight up.
- `physics.js` and `winloss.js` both reference `state.frame`, but no subsystem **writes** to `state.frame`. The merge into `04_creative_slot.js` likely doesn't add a frame counter either.
- `winloss.js` ends the game on a 25 s elapsed timer regardless of HP — this is `tutorial_loss_at_seconds` propagating from P1 through the brief into a hard `state.isOver = true` trigger.
- No subsystem implements the gold's enemy AI (650 ms dwell, 930 ms flight). `physics.js` only fires on player input.
- No camera, no shake, no destruction states, no debris, no smoke, no floats, no outlined HUD, no Vs badge.
- The render subsystem assumes castle positions `(60, 540)` and `(240, 180)` — the enemy is in the **upper-right corner**, not the right side. `eX, eY = 240, 180` puts the enemy castle off the gold's intended ground line.

**Pipeline issue**: the subsystem split assumes each subsystem can be authored in isolation. But subsystems share state (input writes mouseX, physics reads it) — and Gemini isn't told the **exact** shared state contract. Each subsystem invents its own assumptions about which fields exist.

**Fix surface**:
- Lift `mouseX/mouseY` (or equivalently `pointerX/Y`) into `shared_state_shape` as required fields, written by `input.js` on every pointermove.
- Generate a **single** `state_contract.json` from P3 and pass it as a hard requirement to every subsystem brief — not just the human-language description in `03_subsystem_briefs.json`.
- Add a static check: each subsystem must declare which state fields it `reads` and which it `writes`. After all subsystems are generated, the orchestrator verifies that every `read` is satisfied by some `write`.
- The `tutorial_loss_at_seconds` field should never produce an `isOver` trigger; it's about the source video, not the playable. Remove the field from the codegen prompt.

### Verify harness (the big one)

The verify harness is too lenient. Both runs pass with `runs: true` despite divergences 1.1, 1.4, 1.5, 1.7, 1.8, 1.9, 1.10, 1.16 — most of which materially affect playability.

| Verify assert | What gold needs | What the runs produce | Why it passes anyway |
|---|---|---|---|
| `sizeOk` | ≤ 5 MB | 2.1–3.1 MB | trivially |
| `consoleErrors == 0` | clean load | both runs clean | trivially |
| `canvasNonBlank` | painted scene | painted scene (placeholder shapes) | trivially |
| `mraidOk` | `mraid.open(` reachable | `window.__cta` calls it | trivially |
| `mechanicStringMatch` | `mechanic_name` verbatim in JS | both runs include it | gameable — string match, not behavior |
| `interactionStateChange` | tap+drag changes state | `state.inputCounter` increments | gameable — any monotonic counter passes |

**The harness gates "loaded and reacts to clicks" but not "implements the gold mechanic."** This is the core robustness hole.

**Fix surface (prioritized)**:
1. **Turn-loop assert** — observe phase strings over 10 s; require `aiming → projectile → ...` transitions, not just `state.inputs++`.
2. **HP-state assert** — verify the win condition is reachable: simulate enough taps to fire, confirm `enemyHp` (or whatever the spec calls it) decreases.
3. **CTA-reachable assert** — drive enough state changes to end the match, then confirm `ctaVisible` flips to `true`.
4. **Asset-bound assert** — confirm at least 4 distinct sprites are loaded by reading the canvas at predetermined coordinates and hashing pixel buckets.
5. **No-fake-progress assert** — fail if `inputs` increases but `phase` never changes for 10 s straight (the playable is reacting to taps without advancing the game).

These are all behavioral, not structural. They cost ~30 s of headless run time per playable but turn the bench into something that actually distinguishes good prompts.

---

## 3. Cross-cutting issues

### 3.1 Hallucination flow is uni-directional

P1 → P3 → P4 is a strict pipeline. Each stage trusts the previous. There is no late-stage check that consults the original video to confirm a claim P1 made. By the time P4 is writing `state.playerTilt = (1 - hp/100) * 0.4`, the original frames are forgotten.

**Fix**: a post-P3 critic pass that re-reads the contact sheet (already produced in `01_contact_sheet.png`) and answers "does the GameSpec describe this image?" Currently the critic exists at P1 (`01_critique.json`) but not at P3 — and the P3 round-trip check (`03_roundtrip.json`) only validates structural consistency, not semantic alignment with the video.

### 3.2 The "must implement defining_hook" rule is the wrong direction

The gold target's signature beat is the **3-section castle destruction**, not a "hook." When P1 hallucinates a hook, the rest of the pipeline is forced to implement that hallucination as the headline mechanic. The gold target shows the right answer: faithful core loop > novelty hook.

**Fix**: invert the constraint. The codegen prompt should say "render the core loop accurately; render the defining_hook only if it is timestamp-grounded." This already aligns with the rubric — `core_gameplay` is 35 pts, `feedback` (which includes destruction states) is 15 pts; novelty is not weighted at all.

### 3.3 The subsystem split has no integration test

Each subsystem is generated, lint-passed, and merged — but there's no checkpoint that the merged `04_creative_slot.js` actually runs the gold loop. The lint pass catches syntax errors, not semantic ones (e.g. `state.mouseX` referenced but never written).

**Fix**: add a smoke-render step between subsystem generation and final assembly. Run the merged creative slot in a headless browser, drive 5 s of synthetic input, and assert phase transitions occur. This is cheaper than the full verify harness and catches the subsystem-disconnect class of bugs.

### 3.4 No reference comparison

The pipeline doesn't know the gold target exists. Every run is generated from scratch as if Castle Clashers had never been seen before. For V1 (Castle-Clashers-only corpus), this is leaving easy points on the floor.

**Fix (V1-scoped)**: pass the gold target's `expected_behavior.json` and `scoring_rubric.json` into P3 as a "this is what good looks like for this corpus" reference. Not the source code (would be cheating) — just the behavioral spec. This collapses the hallucination surface for the one game we're benchmarking, and the architecture for unseen-game generalization is preserved (the field would be empty for new games).

---

## 4. Prioritized fix list

Ordered by ROI on rubric points.

| # | Fix | Stages touched | Rubric pts at risk | Effort |
|---|---|---|---|---|
| 1 | Tighten verify harness with behavioral asserts (turn loop, HP changes, CTA reachable) | verify | gates everything else | 1 h |
| 2 | Remove `tutorial_loss_at_seconds` from the codegen prompt | P3 prompt | core_gameplay 35 | 5 min |
| 3 | Drop `defining_hook` from codegen prompt unless evidence ≥ 2 timestamps | P3 prompt | visual_fidelity + feedback 35 | 15 min |
| 4 | Lock role vocabulary in P2 prompt | P2 prompt | visual_fidelity 20 | 10 min |
| 5 | Add `pointerX/Y` to shared state shape; require `input.js` to write them every move | P3 brief, P4 input subsystem | core_gameplay 35 | 30 min |
| 6 | Switch HP from continuous (100) to discrete (3) in P3 numeric_params for Castle Clashers | P3 prompt | feedback 15, visual_fidelity 20 | 15 min |
| 7 | Pass `expected_behavior.json` from gold target as a reference into P3 | P3 prompt | quality across all criteria | 30 min |
| 8 | Add post-P3 semantic critic that compares GameSpec against contact sheet | new critic pass | upstream of all | 1 h |
| 9 | Subsystem read/write declaration + integration smoke test | P4 orchestrator | core_gameplay 35 | 1.5 h |
| 10 | Replace P1's `defining_hook` with nullable + evidence-required | P1 prompt + schema | upstream of all | 30 min |

Total ≈ 5–6 h of focused work to lift the runs from "passes the loose gate" to "approaches the gold target on the rubric."

---

## 5. The single biggest finding

**The verify harness is the bottleneck, not the prompts.** Both runs analyzed pass with `runs: true` and look nothing like Castle Clashers. Until the harness can distinguish "loaded an HTML file" from "implements the gold mechanic," prompt iteration is graded by an instrument that cannot tell the variants apart. Fix the harness first; everything else is downstream.
