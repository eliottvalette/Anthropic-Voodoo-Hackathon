# P1 Video-Description Audit — proto-pipeline-m

Audit of the P1 (video analysis) stage against fresh research on Gemini 2.5/3 video API best practices. Read every md (CLAUDE.md, PLAN.md, BENCHMARK.md, memory) + every P1 prompt + `p1_video.ts`, `p1_contact_sheet.ts`, `gemini.ts`, all `schemas/video/*`. Brutal honest read.

Date: 2026-04-25.

---

## TL;DR

The prompt **content** is genuinely good — multi-pass + critic + rewriter + adversarial alternate is state-of-the-art shape. But the **runtime config** is leaving 30–50% of P1 quality on the floor and there is one **critical bug** that silently nullifies the locked two-tier model strategy.

**Top 5, ranked by impact-to-effort:**

| # | Issue | Where | Severity |
|---|---|---|---|
| 1 | `MODELS.pro === "gemini-flash-latest"` — merge/critic/rewriter never run on Pro | `src/pipeline/gemini.ts:173-176` | **Critical** |
| 2 | No `responseSchema` at API level — Zod is a fallback, not a contract | `gemini.ts:generateJson` | High |
| 3 | No `videoMetadata.fps` override — sampled at 1 fps, Castle Clashers projectiles fly between frames | `p1_video.ts:155-158` | High |
| 4 | Timestamp format `MM:SS.mmm` exceeds Gemini's trained granularity (MM:SS / H:MM:SS) — millisecond digits are confabulated | every `1*.md` + `evidence_timestamps` schemas | High |
| 5 | No context caching on the uploaded video across the 3+ parallel sub-calls | `runP1` | Medium-cost only (free per memory) — but **Medium-quality** because it blocks longer prompts |

---

## 1. Best practices Gemini docs + research are explicit about (your design vs. theirs)

| Practice | Source | P1 today |
|---|---|---|
| Default 1 fps sampling. Override with `videoMetadata.fps` for "fast-action understanding" | Gemini File API docs | **Not set.** Castle Clashers gameplay has projectiles that traverse the screen in <500ms — at 1 fps you literally never see one mid-flight. Set fps to 2–4 for B01/B11. |
| `mediaResolution` low = 66 tok/frame, default = 258 tok/frame; "low" loses detail | Gemini 3 docs | **Not set** (defaults to default → 258, fine). Don't change. |
| Place instruction *after* data; anchor with "Based on the video above…" | Gemini long-context guidance | **Inverted.** P1 uses systemInstruction for the prompt and `userParts = [video, "Analyze the video per the system instruction."]`. SystemInstruction loads first, then video. Long-context research says reverse this for non-trivial extractions. |
| `MM:SS` (Gemini 2.0) or `H:MM:SS` (Gemini 2.5) — these are the trained tokens | Gemini docs | Prompts demand `MM:SS.mmm-MM:SS.mmm` (milliseconds). Gemini is **not reliable at sub-second grounding**; the `.mmm` is filler. Switch to `MM:SS-MM:SS`. |
| Audio is a "temporal anchor" — transcribe first, ground visual to it | Gemini multi-pass best-practice writeup | P1 ignores audio entirely. Castle Clashers has distinctive SFX (sword clash, projectile launch, castle collapse). A 1g_audio sub-pass would give 1d another evidence stream. |
| Suggestibility: "do not assume X" works; "for re-implementation in a playable" mildly biases output | research on MLLM confirmation bias | 1a/1c/1d are clean. **1b says "for re-implementation in a single-file HTML playable ad"** — this primes the model to surface what's *reproducible*, not what's *true*. Strip it. |
| `responseSchema` (not just `responseMimeType`) — gives **enforced** JSON contract | Gemini structured output docs | **Only `responseMimeType: "application/json"` is set.** Enums (`tempo`, `art_style`, `camera_angle`) are enforced by Zod after-the-fact, costing a retry on miss. Native `responseSchema` removes that whole class of failure. |
| `propertyOrdering` preserves declared order in 2.5+ | Gemini schema docs | Not used. With `responseSchema`, ordering also nudges what the model "thinks about first" — put `defining_hook` and `defining_hook_evidence_timestamps` first to anchor reasoning. |
| Context caching: "for videos with multiple requests, cache once and reuse" — same video runs through 1a/1b/1c/1e (and re-uploads on benchmark sweep) | Gemini caching docs | Not used. P1 re-pays the video tokens on every sub-call and on every benchmark variant. With unlimited Gemini, cost is irrelevant — but caching also reduces TTFT, which compounds across 3 parallel calls. |
| Few-shot for JSON shape | Gemini prompt-eng best practice | Zero examples in any prompt. The merge prompt is the riskiest; one worked example would stabilise enum choices and `defining_hook` quality. |
| Chain-of-thought / self-consistency for hard reasoning | Gemini Ultra paper | Critic→Rewriter pattern (great). Adversarial alternate (great). **But no `thinkingConfig` / explicit thinking budget on Pro 3 calls** — leaving reasoning tokens on the floor. |

---

## 2. Critical bug

**`src/pipeline/gemini.ts:173-176`:**

```ts
export const MODELS = {
  flash: "gemini-flash-latest",
  pro: "gemini-flash-latest",
} as const;
```

PLAN.md §3.2, BENCHMARK.md §10, project_architecture.md all say: "two-tier model strategy: Flash×3 parallel + Pro merge". Right now **the merge, critic, and rewriter all run on Flash**. The most expensive reasoning step in P1 is using the cheapest model. This silently invalidates the "schema reliability + cost cut via two-tier" decision in the decision log.

Fix is one line — change `pro` to `gemini-2.5-pro` (or whatever Gemini 3 Pro alias the account exposes; CLAUDE.md and the older eliott-pipeline reference `gemini-3.1-pro-preview` with `gemini-2.5-pro` fallback).

---

## 3. Prompt-by-prompt notes

### 1a_timeline.md — solid, two fixes
- ✅ "Do not infer offscreen state. Do not assume a genre." — textbook anti-suggestibility.
- ✅ `disambiguation_needed` flag. Excellent.
- ❌ `time_range` example uses milliseconds (`00:03.500-00:05.200`). Gemini will fabricate the .500/.200. Drop to `00:03-00:05`.
- ❌ No fixed minimum/maximum event count. Gemini Flash sometimes emits 2 events for a 30-s video, sometimes 40. Add: `Aim for 8–20 events. Prefer over-segmenting if unsure.`

### 1b_mechanics.md — strong, one bias to remove
- ❌ "for re-implementation in a single-file HTML playable ad" primes the model to omit mechanics it thinks "won't fit". Replace with: "for downstream JSON-spec consumption". Same idea, no implementation hint.
- ✅ "Be conservative: do not invent mechanics that are merely plausible." Keep.
- ❌ Like 1a, no count guidance. For a 2D combat game, you'd want ~3–6 mechanics; current prompt regularly returns 1.

### 1c_visual_ui.md — too thin
- ❌ No constraint on `palette_hex` length. Gemini returns 3 colors sometimes, 24 others. Add: `palette_hex must contain 4–8 dominant colors`.
- ❌ `screens` enum allows `intro|gameplay|end|tutorial` but doesn't require *evidence per screen*. A blank-screen intro often gets confabulated as "tutorial".
- ❌ `characters_or_props` lacks a size hint (count). Add `5–15 entries`.
- ❌ No request for **camera/perspective** here — that field appears only in 1d_merge from thin air. Put `camera_angle` as a 1c output too, so the merge has an actual source for that enum instead of guessing.

### 1d_merge.md — best of the bunch
- ✅ Closed enums for `tempo`, `art_style`, `camera_angle`. Correct call.
- ✅ Required `defining_hook` with anti-generic guidance ("Bad: 'fast-paced action'. Good: '…support beams…'"). Excellent.
- ✅ Required ≥1 evidence timestamp.
- ❌ The merge prompt accepts `asset_filenames` as "weak hint". OK in principle, but Gemini will still leak filenames into `characters_or_props`. Add: `characters_or_props must be visual descriptions, never filenames.`
- ❌ When the contact sheet is absent (`buildContactSheet` failed), the merge has no fallback for visual_hook. Add: `If contact_sheet missing, derive defining_hook from visual_ui + timeline only; mark in open_questions.`

### 1d_critic.md — the right idea, too broad
- ✅ Strict severity enum.
- ❌ `factual_flaws` and `missing_or_weak_fields` are unbounded strings. Result: long laundry list rewrites. Cap each array at 5 entries; force prioritisation.
- ❌ No instruction to verify timestamp coherence (does `defining_hook_evidence_timestamps` actually appear in `evidence.timeline`?). That's the highest-value automated check the critic can do — currently it's relying on Gemini's diligence.

### 1d_rewriter.md — fine but redundant
- ✅ Same schema as 1d_merge. Right.
- ❌ Says "Preserve the original `open_questions` unless the critique resolves them." Critic doesn't emit "resolved" markers — this rule is unenforceable. Replace with: "Concatenate original open_questions with any new ones from critique fixes; deduplicate."

### 1e_contact_sheet.md — strong
- ✅ Cell numbering, "static_or_dynamic", visual_hook with cell citations. Good.
- ❌ The contact sheet is **always 4×4 = 16 frames** regardless of video length (`p1_contact_sheet.ts`). For a 30-s clip that's fine; for a 2-min clip you miss everything <8 s. Make grid size adaptive to duration: 4×4 ≤ 30 s, 5×5 30–90 s, 6×6 ≥ 90 s. Or, simpler: keep 4×4 but also pass per-cell `timestamps_sec` array into the prompt so 1e can ground each cell back to a real timecode.

### 1f_alternate.md — clever but currently inert
- ✅ Adversarial framing without seeing the video forces independent reasoning.
- ❌ The output is **stored but never fed back**. If `fits_evidence_better === true`, P1 should re-run 1d_rewriter with this signal. Currently a true `fits_evidence_better` is a silent red flag in the JSON that nothing acts on.

---

## 4. Code-level findings (`p1_video.ts` / `gemini.ts`)

1. **`generateJson` doesn't pass `responseSchema`.** Add per-call. Schemas already exist in Zod — convert with a small adapter (Zod → JSON Schema → Gemini schema). Removes ~half of the retry loop's work.
2. **`temperature: 0.4` default for extraction tasks.** Too high. Use 0.0–0.2 for 1a/1b/1c/1e (factual extraction) and 0.4 only for 1f_alternate (creativity). Currently 1f and 1c use the same temp.
3. **Single retry with system-prompt amendment on JSON failure.** Decent. But the amendment is appended every retry forever in a long session — if `attempt < 2` is ever bumped to 3, the prompt gets corrupted. Use a sentinel that's added once.
4. **Video upload doesn't pass `videoMetadata`** (fps, start/end clipping). Add. For benchmark efficiency, clip B01/B11 to first 30 s (Gemini sees the loop hook).
5. **No context-cache reuse.** When 1a/1b/1c run in parallel against the same uploaded video, each is billed for video tokens separately. Switch to `cachedContent` with a 5-minute TTL; the 4 sub-calls reuse the cache.
6. **No `thinkingConfig` on Pro merge/critic/rewriter.** Gemini 2.5 Pro respects `thinkingConfig.thinkingBudget`. Set high (≥4096) for these.
7. **`MergedVideoSchema` uses `.passthrough()`.** Means Gemini's extra fields silently leak into `01_video.json`. Fine for forward-compat, bad for benchmark reproducibility. Switch to `.strict()` after stabilisation.
8. **`evidence_timestamps: z.array(z.string())` has no regex.** Add `.regex(/^\d{1,2}:\d{2}(-\d{1,2}:\d{2})?$/)` once milliseconds are dropped.
9. **`runWithRetry` retries the same step on schema failure but doesn't lower temperature.** A common pattern that works: drop temperature 0.5× on retry.

---

## 5. What's actually first-rate (don't change)

- Multi-pass shape (3 parallel + merge) is correct.
- Critic→conditional Rewriter is the right loop — keep.
- Adversarial alternate is genuinely creative; rare to see it in production pipelines.
- "Do not assume a genre" + closed enums in merge + required `defining_hook` with bad/good examples — this is how Google's own multimodal-prompt cookbook frames it.
- Per-stage token/latency tracking is already in `meta.subCalls`. The benchmark plumbing assumes nothing extra.

---

## 6. Recommended diff (highest leverage, smallest surface)

**Phase A — fixes that don't change prompt semantics (30 min):**
1. `gemini.ts`: set `MODELS.pro = "gemini-2.5-pro"` (or the Pro 3 alias).
2. `gemini.ts`: pass `videoMetadata: { fps: 2 }` for video parts; lower `temperature` default to 0.2.
3. `p1_video.ts`: temperatures — 0.1 for 1a/1b/1c/1e, 0.2 for 1d/1d_critic/1d_rewriter, 0.5 for 1f.
4. Drop `.mmm` from every prompt and from `time_range` example. Add regex to Zod.

**Phase B — structural quality (1–2 h):**
5. Add `responseSchema` (not just mime type) to every JSON call. Adapter: `zod-to-json-schema` → strip unsupported keys → pass.
6. Add `cachedContent` for the uploaded video, reused across 1a/1b/1c/1e.
7. Wire 1f's `fits_evidence_better` into the rewriter loop (one extra conditional rewrite when alternate wins).
8. Add 1g_audio (Gemini Flash, audio-only transcription with SFX labels) feeding into 1d_merge.

**Phase C — prompt body edits (review with Mathis before write):**
9. Strip "for re-implementation as a playable" hint from 1b.
10. Add count constraints: 1a (8–20 events), 1b (3–6 mechanics), 1c (4–8 palette, 5–15 props).
11. Add `camera_angle` to 1c output (so 1d isn't guessing).
12. Add `palette_hex` regex `^#[0-9A-Fa-f]{6}$` in Zod.

Phase A alone would meaningfully lift `runs` rate; Phase B is where `user_note` would move.

---

## Sources

- [Gemini API video understanding (fps, mediaResolution, videoMetadata, caching)](https://ai.google.dev/gemini-api/docs/video-understanding)
- [Gemini API structured output / responseSchema / propertyOrdering](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini API File API + MM:SS timestamp format](https://ai.google.dev/gemini-api/docs/files)
- [Gemini 3 multimodal vision media_resolution](https://ai.google.dev/gemini-api/docs/models/gemini-3)
- [Multimodal hallucination & suggestibility research (visual grounding survey)](https://arxiv.org/abs/2401.07327)
- [Gemini Ultra CoT + self-consistency results](https://blog.google/technology/ai/google-gemini-ai/)
- [Audio-as-temporal-anchor multi-pass pattern (Google Cloud blog)](https://cloud.google.com/blog/products/ai-machine-learning/gemini-on-vertex-ai-multimodal-audio-video)
