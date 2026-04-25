# RESEARCH.md — proto-pipeline-m

Deep research on best practices, papers, and open-source projects relevant to the video → playable-HTML pipeline. Companion to `P1_AUDIT.md`. Findings ordered by likely impact in the next 24 h, not alphabetically.

Scope guards (locked, not re-debated):
- Gemini for both video AND codegen.
- No runtime internet calls.
- Single-file ≤5 MB Canvas2D HTML, MRAID 2.0.
- 4-prompt chain P1 → P2 → P3 → P4 with Playwright verify (≤2 retries).

---

## Top 5 actions for the remaining 24 h

1. **Pre-write a Template-Skill skeleton library and have P3 route to it instead of free-generating.** Inspired by OpenGame (`arxiv.org/abs/2511.17000`). Single highest-impact change in the entire research set.
2. **Manifest-grounded asset validation in P4.** Inject the literal asset manifest as a fenced JSON block into the codegen prompt; have the lint/critic AST-walk the generated code and reject any `Image()` src not in the manifest. From De-Hallucinator (`arxiv.org/abs/2401.01701`).
3. **Run codegen output through `smoudjs/playable-scripts` and the AppLovin Playable Preview tool as part of verify.** This is the literal moderation surface; cribs the per-network MRAID wrapping for free.
4. **Adopt the IG-VLM 6-cell uniform contact sheet + Set-of-Mark numeric labels.** Concretely supports keeping the contact-sheet path; cell IDs Gemini grounds reliably.
5. **Add a Gemini-Flash judge between P3 and P4.** Pairwise prompt critique before paying P4's codegen cost. Cheap insurance using LLM-as-Judge best practices.

---

## 1. Gemini video understanding patterns we may have missed (P1)

### 1.1 IG-VLM — *An Image Grid Can Be Worth a Video* (Mar 2024)
- Paper: https://arxiv.org/abs/2403.18406 · Code: https://github.com/imagegridworth/IG-VLM
- A 2×3 = 6-frame grid into a single VLM call beats dedicated video models on 9/10 zero-shot VQA benchmarks. Zero training. Frames sampled by uniformly partitioning into 6 intervals, taking the first frame of each interval.
- **Why it matters:** Empirical green-light for the contact-sheet path. Suggests current 4×4 = 16 cells is over-spending tokens on short ads; 2×3 or 3×3 is likely sufficient and cheaper. Test against current grid as a benchmark variant.

### 1.2 Set-of-Mark prompting (Microsoft, Oct 2023)
- Paper: https://arxiv.org/abs/2310.11441 · Code: https://github.com/microsoft/SoM
- Burning numeric/alphanumeric marks into image regions lets the VLM ground answers to mark IDs ("describe #3"). Outperforms fully fine-tuned RefCOCOg models on GPT-4V.
- **Why it matters:** Already labelling cells 1–16 in `1e_contact_sheet.md`. Make the numerals visible inside each cell at render time (ffmpeg `drawtext`), not just in the prompt — that's what makes them groundable.

### 1.3 TRACE — Causal event modelling for video temporal grounding (2025)
- Paper: https://arxiv.org/abs/2410.05643
- Represents video LLM output as a sequence of `(timestamp, salience, caption)` triples; outperforms standard captioning for fine-grained temporal grounding.
- **Why it matters:** P1's `TimelineSchema` should mirror this triple structure. Adding a per-event salience score gives P3 a principled way to drop noise events instead of arbitrary truncation.

### 1.4 MP-GUI — GUI-tailored perceiver for screen recordings (Mar 2025)
- Paper: https://arxiv.org/abs/2503.14021
- Three GUI-specific perceivers (visual, layout, semantic) fused with a vision backbone. Designed for screen recordings.
- **Why it matters:** For the UI-extraction sub-pass (1c_visual_ui), prompt Gemini to emit `(bbox, class∈{button|hud|sprite|text}, ocr_text)` tuples — the same structure MP-GUI uses internally. Gives P3 stable IDs to refer back to instead of free-text labels.

### 1.5 Adaptive Keyframe Sampling (CVPR 2025)
- Paper: https://arxiv.org/abs/2502.21271
- Optimises keyframe selection jointly for prompt-relevance and video-coverage; plug-and-play module.
- **Why it matters:** Once the IG-VLM uniform-sampling baseline works, AKS-style coverage-vs-relevance scoring is the single biggest quality lever for ads where the "hook" frame is non-uniformly placed (typical for ad creatives). Stretch goal, not 24h.

### 1.6 LLaVA-NeXT-Interleave (Jul 2024)
- Paper: https://arxiv.org/abs/2407.07895 · Code: https://github.com/LLaVA-VL/LLaVA-NeXT
- Treats video as multi-frame interleaved images; "pooling to 1/4" tradeoff between frame count and tokens/frame. 7B model matches prior 34B.
- **Why it matters:** Reinforces that interleaved frames beat monolithic video tokens for short clips with temporal QA. Don't switch off contact sheets.

### 1.7 Gemini 3 Pro variable-sequence-length tokenisation
- Docs: https://ai.google.dev/gemini-api/docs/video-understanding
- Gemini 3 Pro abandoned the older "Pan and Scan" frame-fitting in favour of variable-sequence-length per frame. `mediaResolution`: high=280 tok/frame, default=258, low=70.
- **Why it matters:** Already covered in P1_AUDIT.md (the `MODELS.pro` bug). Don't pick "low" — short ads can afford "high".

### 1.8 *Can LLMs Capture Video Game Engagement?* (Feb 2025)
- Paper: https://arxiv.org/abs/2502.05979
- First eval of LLMs predicting time-continuous engagement labels from gameplay video.
- **Why it matters:** Adds a candidate sub-pass: ask Gemini for a per-segment "fun-curve" estimate. P4 can then prioritise implementing the high-engagement beats first when token budget gets tight. Stretch.

### 1.9 Orak benchmark (Jun 2025)
- Paper: https://arxiv.org/abs/2506.03610
- Trajectory dataset across game genres; MCP-based agentic interface. Trajectory format: `observation → action → state_delta`.
- **Why it matters:** That trajectory format is a clean schema for P1 mechanics extraction — describe gameplay as state machines, not free text. Schema upgrade for `MechanicsSchema`.

---

## 2. Gemini codegen for constrained single-file HTML/JS (P4)

### 2.1 OpenGame + GameCoder-27B + OpenGame-Bench (2025) — directly on-target
- Paper: https://arxiv.org/abs/2511.17000
- End-to-end agentic web-game creation. Two reusable skills: **Template Skill** (skeleton library grown from past runs) and **Debug Skill** (verified-fix protocol).
- **Why it matters:** Pre-write 4–5 single-file Canvas2D skeletons (lane-defender, tap-to-shoot, match-3, swipe-aim, drag-drop) and have P3 aggregator route to a skeleton instead of free-generating from zero. **Single highest-impact change in this report.** Maps cleanly onto the locked `template_id` field already in CLAUDE.md.

### 2.2 De-Hallucinator — API-grounded retrieval for codegen
- Paper: https://arxiv.org/abs/2401.01701
- Iteratively retrieves real API references and re-queries the model.
- **Why it matters:** Inject the literal asset manifest (filenames, dimensions, durations) into P4 context as a fenced JSON block. Have a critic AST-walk the generated code and flag any `Image()` src that isn't in the manifest. Hard-fails the asset-hallucination class — the most common P4 failure mode in `outputs/`.

### 2.3 Code-hallucination taxonomy (Apr 2024)
- Paper: https://arxiv.org/abs/2404.00971
- Categories: Task / Factual / Project conflicts; "Non-code Resource Conflicts" subcategory matches the sprite-reference failure mode exactly.
- **Why it matters:** Name lint categories after this taxonomy in `4_lint.md` so the rewriter prompt has clean classes to reason over instead of ad-hoc error strings.

### 2.4 Type-constrained decoding (Apr 2025)
- Paper: https://arxiv.org/abs/2504.09246
- Prefix automata + inhabitable-type search; cuts compile errors by >50%.
- **Why it matters:** Gemini doesn't expose this directly, but post-decode AST validation in the verify loop approximates it. Reject and retry on undefined identifiers before opening the browser. Cheaper than a full render-test cycle.

### 2.5 AlphaCodium — flow-engineered codegen with test-anchored iteration
- Repo: https://github.com/Codium-ai/AlphaCodium
- "Iterate-on-public-tests then iterate-on-AI-tests" two-loop.
- **Why it matters:** The 6 binary asserts are the public tests. Add a second loop where Gemini *generates* additional tests from the GameSpec and self-corrects against those. Adds a layer between current verify and a full re-codegen.

### 2.6 Reflexion — verbal self-reflection on test failure
- Repo: https://github.com/noahshinn/reflexion
- The canonical prompt template for "here's what failed, here's what to change". Self-reflection added as memory before re-prompting.
- **Why it matters:** Wire 6-assert failures into a Reflexion-style memory and re-prompt Gemini for retry 2. Bigger gain than appending raw error strings (current behaviour).

### 2.7 Self-Debugging (Chen et al., Google 2023)
- Paper: https://arxiv.org/abs/2304.05128
- "Explain-then-fix" prompt on execution feedback.
- **Why it matters:** Explicit prompt scaffold to drop into the repair stage. Two phases: explain *why* the assert failed, then propose the fix. Gains > error-message-only retry.

### 2.8 Self-Refining LLM Unit Testers (Apr 2025)
- Paper: https://arxiv.org/abs/2504.06639
- Gemini-2.0-flash gained +32 pp on assertion correctness with self-refinement.
- **Why it matters:** Confirms ≤2 retry budget is correctly sized — gains plateau hard after retry 2–3. Invest in *error message quality* (structured Playwright failure: selector, expected, actual, console errors, network 404s) instead of more retries.

### 2.9 screenshot-to-code (canonical baseline)
- Repo: https://github.com/abi/screenshot-to-code
- Image → HTML/Tailwind/Vue, multi-LLM (incl. Gemini).
- **Why it matters:** Read their prompt templates for single-file output discipline — particularly "no external CDNs, inline everything" enforcement at decode time. Direct cookbook for the ≤5 MB single-file constraint.

### 2.10 Phaser AI-skills repo
- Repo: https://github.com/phaserjs/phaser
- Ships an "AI agent skills" subfolder with subsystem-level docs designed for Claude/Gemini consumption.
- **Why it matters:** Even if staying vanilla Canvas2D, skim Phaser's skills for state-machine + scene-loading patterns. Gemini already knows Phaser idiomatically — using Phaser-shaped vocabulary in P4 prompts triggers stronger priors.

### 2.11 VideoGameBench / lmgame-Bench (May 2025) — eval harnesses
- VideoGameBench: https://arxiv.org/abs/2505.18134
- lmgame-Bench: https://arxiv.org/abs/2505.15146
- Gym-style APIs for VLM gameplay eval, with playability/perception/reasoning sub-scores.
- **Why it matters:** Their playability scoring rubric (does it run? can input affect state? is there a win/loss?) is exactly the verify-loop scoring schema. Lift it into the P4 judge prompt directly.

---

## 3. MRAID 2.0 / playable-ad ecosystem

### 3.1 smoudjs/playable-scripts — production playable-ad CLI
- Repo: https://github.com/smoudjs/playable-scripts · npm: https://www.npmjs.com/package/@smoud/playable-scripts
- Builds, optimises, and packages HTML5 playables for AppLovin, IronSource, Vungle, Mintegral, Unity, Meta, Google. Auto-injects MRAID protocol per network.
- **Why it matters:** Drop-in replacement for hand-rolled bundling; gives per-network wrappers free. Run P4 output through this CLI as final assembly step.

### 3.2 AppLovin Playable Preview Tool (official)
- Tool: https://www.applovin.com/playablepreview/
- Drag-and-drop simulator for `index.html`. The actual moderation gate.
- **Why it matters:** Verify loop should screenshot/scrape this in CI. It's the literal acceptance surface.

### 3.3 indiesoftby/defold-playable-ads
- Repo: https://github.com/indiesoftby/defold-playable-ads
- Reference Gulp pipeline that inlines all assets into a single HTML for AppLovin/IronSource/Mintegral/Vungle/Facebook.
- **Why it matters:** Copy the build script verbatim — single-file inlining is exactly the output stage.

### 3.4 IAB MRAID-3.0-Compliance-Ads (golden test creatives)
- Repo: https://github.com/InteractiveAdvertisingBureau/MRAID-3.0-Compliance-Ads
- Official IAB compliance test creatives.
- **Why it matters:** Use as golden inputs for the Playwright shim. If the shim runs these correctly, codegen output will too. (MRAID 3 is backward-compatible with 2.0 for the methods used here.)

### 3.5 IAB MRAID 2.0 spec (canonical)
- Spec: https://www.iabtechlab.com/standards/mobile-rich-media-ad-interface-definitions-mraid/
- Required: `mraid.ready` event, 50×50 close region, `mraid.open()` for redirects, single-file packaging.
- **Why it matters:** The literal checklist the codegen prompt must encode. Make it part of P4's system prompt verbatim.

### 3.6 KP-DEV/mraid-js + appnexus/mraid-extension
- https://github.com/KP-DEV/mraid-js · https://github.com/appnexus/mraid-extension
- MRAID+VPAID shim implementations and a polyfill browser extension.
- **Why it matters:** Side-by-side reference for the hand-written shim's missing methods. The browser extension lets you preview in plain Chrome instead of an SDK.

### 3.7 MRAID WebTester
- Tool: http://webtester.mraid.org/
- Browser harness for MRAID ad units.
- **Why it matters:** Second-opinion validator alongside AppLovin's tool.

### 3.8 image2base64 + the +33% overhead reality
- Repo: https://github.com/shanginn/image2base64
- **Why it matters:** Base64's +33% overhead means asset compression must come *before* base64 inlining for the 5 MB cap. Wire `oxipng`/`mozjpeg` into the assembly stage.

---

## 4. Headless Playwright / DOM eval harnesses (Verify)

### 4.1 Playwright Clock API for deterministic canvas testing
- Docs: https://playwright.dev/docs/clock
- Deterministic time control for canvas/animation E2E.
- **Why it matters:** Lets the 6-assert verify loop sample frames at fixed `t = 0/1/2/3 s` deterministically — flaky FPS goes away. Replace `page.waitForTimeout(1200)` with `page.clock.fastForward()`.

### 4.2 Canvas blank-detection via `getImageData` hash
- MDN: https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData
- Sample 8 random pixels, hash, fail if all-equal.
- **Why it matters:** 5 lines in `page.evaluate`. Already partially in `verify.ts`; tighten the assertion to "≥3 distinct hashes across 4 timestamps" so a static loaded-but-frozen frame fails.

### 4.3 PaperBench (OpenAI, Apr 2025)
- Page: https://openai.com/index/paperbench/
- Agents complete missing code, graded by execution.
- **Why it matters:** The rubric pattern (per-task pass/fail with LLM-judge fallback) is exactly the structure needed around the 6 asserts. Add an LLM-judge fallback for the soft `user_note` axis when a human reviewer isn't available mid-batch.

### 4.4 WebArena + VisualWebArena
- https://webarena.dev · https://jykoh.com/vwa
- Natural-language browser-task benchmarks with fuzzy LLM-judged success.
- **Why it matters:** Their scoring harness is open-source and wraps Playwright; cribbable for "did the game respond to a tap" without writing it from scratch.

---

## 5. Meta-prompting / prompt-as-output (P3)

### 5.1 Suzgun & Kalai — *Meta-Prompting* (Stanford, Jan 2024)
- Paper: https://arxiv.org/abs/2401.12954 · Code: https://github.com/suzgunmirac/meta-prompting
- One LM acts as a "conductor" writing prompts for "expert" instances of the same LM. +17.1% over standard prompting on GPT-4. Scaffold fixed; only inner prompt varies.
- **Why it matters:** This is the literal P3 pattern. Their scaffold is the reference design for stopping P3 from drifting in shape across runs. Adopt their conductor-instructions template directly into `3_aggregator.md`.

### 5.2 Prochemy — *Prompt Alchemy: Automatic Prompt Refinement for Code Generation* (Mar 2025)
- Paper: https://arxiv.org/abs/2503.11085
- The only paper specifically optimising prompts for downstream codegen. Emphasises *prompt consistency during inference* — fixed scaffold across runs.
- **Why it matters:** Closest analogue to P3 → P4 (prompt synthesis where downstream is codegen). Their "consistency" finding directly supports locking P3 output shape — already an invariant in `BENCHMARK.md`.

### 5.3 DSPy + GEPA (Stanford NLP, ICLR 2026 oral)
- Repo: https://github.com/stanfordnlp/dspy · Docs: https://dspy.ai
- Signatures = fixed input/output schemas; optimisers (GEPA, COPRO, MIPROv2) only mutate instructions/demos around the signature. GEPA: +10pp on AIME-2025 with 35× fewer rollouts than GRPO.
- **Why it matters:** GameSpec is a DSPy signature in disguise. GEPA's reflective trace-based mutation is the cheapest offline way to harden the P3 prompt without training. Stretch — but if benchmark plateau hits Sunday morning, this is the next move.

### 5.4 PRewrite (Jan 2024)
- Paper: https://arxiv.org/abs/2401.08189
- RL-trained rewriter that refines user inputs before a frozen downstream LLM.
- **Why it matters:** Direct architectural mirror of P3 (rewriter) → P4 (frozen Gemini codegen). Validates that splitting "synthesiser" from "executor" is a known-winning pattern.

### 5.5 TextGrad (Nature 2024)
- Repo: https://github.com/zou-group/textgrad · Paper: https://arxiv.org/abs/2406.07496
- PyTorch-style "textual gradients" backpropagated through LLM feedback.
- **Why it matters:** If P4 fails compile or judge fails playability, TextGrad gives a clean primitive for "blame the meta-prompt and edit it" — a critic loop on P3 itself. Stretch for V1.

### 5.6 LLM-as-Judge survey (Nov 2024)
- Paper: https://arxiv.org/abs/2411.15594
- Best practices and known biases (position, verbosity, severity).
- **Why it matters:** Add a Gemini-Flash judge between P3 and P4 — pairwise comparison (less position bias) over absolute scoring. Cheap insurance before paying P4's cost.

### 5.7 Background trio: OPRO, Promptbreeder, APE
- OPRO: https://arxiv.org/abs/2309.03409 · Code: https://github.com/google-deepmind/opro
- Promptbreeder: https://arxiv.org/abs/2309.16797
- APE: https://arxiv.org/abs/2211.01910 · Code: https://github.com/keirp/automatic_prompt_engineer
- **Why it matters:** Background priors only. Promptbreeder convergence cost (>32 iters) confirms why a fixed P3 scaffold + small instruction edits beats free-form evolution within 24 h.

---

## 6. Asset-role inference (P2)

Honest gap: there is no public "match-asset-bank-to-game-spec" repo. The field is thin. Best moves are general vision-LLM patterns plus a cross-check.

### 6.1 Google Gemini Cookbook (few-shot + classification)
- Repo: https://github.com/google-gemini/cookbook
- Canonical few-shot pattern with images; system-instruction + examples + constraints.
- **Why it matters:** `2_asset_describe.md` and `2_assets.md` should mirror this exactly. Pass all N assets in one call with K role definitions and require strict JSON out.

### 6.2 OpenAI CLIP — zero-shot cross-check
- Repo: https://github.com/openai/CLIP
- Text-prompt-based image classifier, no training.
- **Why it matters:** Cheap second opinion — score Gemini's role assignment against CLIP's similarity between asset and role-description text. Disagreement = P3 sees an explicit `confidence: low` flag instead of a silent error. (Local-only model; respects no-network rule.)

### 6.3 Vertex AI Batch Prediction
- Docs: https://cloud.google.com/vertex-ai/docs/predictions/batch-predictions
- For >50 assets, batch is much cheaper than serial.
- **Why it matters:** Only relevant if asset banks grow past tens. Castle Clashers = ~12 assets, so skip in V1.

---

## 7. Gaps / things the search did not find

- No public "video → playable HTML5 ad" reference pipeline. Strong differentiator for the demo.
- No standard benchmark for "playable ad quality from a gameplay video". The team's own benchmark (BENCHMARK.md §3) is novel; consider open-sourcing it post-hackathon.
- No literature on the specific P3 pattern of "LLM writes another LLM's codegen prompt + emits a typed spec in one call". Closest analogues (Prochemy, PRewrite) split these; the team's design is more compact and a defensible architectural choice.

---

## Sources (consolidated)

Gemini & video understanding: [video understanding docs](https://ai.google.dev/gemini-api/docs/video-understanding) · [Video-MME](https://video-mme.github.io/) · [TRACE](https://arxiv.org/abs/2410.05643) · [MP-GUI](https://arxiv.org/abs/2503.14021) · [Engagement paper](https://arxiv.org/abs/2502.05979) · [Orak](https://arxiv.org/abs/2506.03610) · [IG-VLM](https://arxiv.org/abs/2403.18406) · [IG-VLM code](https://github.com/imagegridworth/IG-VLM) · [Set-of-Mark](https://arxiv.org/abs/2310.11441) · [SoM code](https://github.com/microsoft/SoM) · [AKS](https://arxiv.org/abs/2502.21271) · [LLaVA-NeXT-Interleave](https://arxiv.org/abs/2407.07895) · [Frame-Voyager](https://arxiv.org/abs/2410.03226) · [NExT-QA](https://arxiv.org/abs/2105.08276)

Codegen & repair: [OpenGame](https://arxiv.org/abs/2511.17000) · [De-Hallucinator](https://arxiv.org/abs/2401.01701) · [Code hallucination taxonomy](https://arxiv.org/abs/2404.00971) · [Type-constrained decoding](https://arxiv.org/abs/2504.09246) · [Self-Refining LLM Unit Testers](https://arxiv.org/abs/2504.06639) · [Self-Debugging](https://arxiv.org/abs/2304.05128) · [AlphaCodium](https://github.com/Codium-ai/AlphaCodium) · [Reflexion](https://github.com/noahshinn/reflexion) · [screenshot-to-code](https://github.com/abi/screenshot-to-code) · [Phaser](https://github.com/phaserjs/phaser) · [VideoGameBench](https://arxiv.org/abs/2505.18134) · [lmgame-Bench](https://arxiv.org/abs/2505.15146)

MRAID & playable-ads: [smoudjs/playable-scripts](https://github.com/smoudjs/playable-scripts) · [AppLovin Playable Preview](https://www.applovin.com/playablepreview/) · [defold-playable-ads](https://github.com/indiesoftby/defold-playable-ads) · [IAB MRAID-3.0-Compliance-Ads](https://github.com/InteractiveAdvertisingBureau/MRAID-3.0-Compliance-Ads) · [IAB MRAID spec](https://www.iabtechlab.com/standards/mobile-rich-media-ad-interface-definitions-mraid/) · [mraid-js](https://github.com/KP-DEV/mraid-js) · [appnexus mraid-extension](https://github.com/appnexus/mraid-extension) · [MRAID WebTester](http://webtester.mraid.org/) · [image2base64](https://github.com/shanginn/image2base64)

Verify & eval: [Playwright Clock](https://playwright.dev/docs/clock) · [getImageData MDN](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData) · [PaperBench](https://openai.com/index/paperbench/) · [WebArena](https://webarena.dev/) · [VisualWebArena](https://jykoh.com/vwa)

Meta-prompting: [Meta-Prompting (Suzgun)](https://arxiv.org/abs/2401.12954) · [meta-prompting code](https://github.com/suzgunmirac/meta-prompting) · [Prochemy](https://arxiv.org/abs/2503.11085) · [DSPy](https://github.com/stanfordnlp/dspy) · [DSPy docs](https://dspy.ai) · [PRewrite](https://arxiv.org/abs/2401.08189) · [TextGrad](https://github.com/zou-group/textgrad) · [TextGrad paper](https://arxiv.org/abs/2406.07496) · [LLM-as-Judge survey](https://arxiv.org/abs/2411.15594) · [OPRO](https://arxiv.org/abs/2309.03409) · [Promptbreeder](https://arxiv.org/abs/2309.16797) · [APE](https://arxiv.org/abs/2211.01910)

Asset role inference: [Gemini Cookbook](https://github.com/google-gemini/cookbook) · [CLIP](https://github.com/openai/CLIP) · [Vertex AI Batch Predictions](https://cloud.google.com/vertex-ai/docs/predictions/batch-predictions)
