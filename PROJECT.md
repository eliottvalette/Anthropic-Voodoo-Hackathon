Voodoo x Anthropic Hackathon Plan: Track 2
1. Context and objective
Hackathon: Voodoo x Anthropic, Saturday 10:00 AM to Sunday 4:00 PM, 30 hours. Team: Mathis, Eliott, Nicolas. Track: Track 2, "Automate playable ads creation". Prize: 1,500 euros, single winner per track.
Actual deliverable: a 100% generic system / pipeline that takes any gameplay video as input and outputs an interactive HTML playable. Castle Clashers is the imposed demo but the deliverable is the pipeline, not a single playable.
Demo targets:
Castle Clashers (2D), assets provided by Voodoo, already in our possession.
Epic Plane Evolution (3D), assets generated automatically via Scenario.com.
Winning strategy: pipeline genericity and end to end demo are the differentiating axes.

2. Technical constraints of the produced playable
Constraint
Detail
Format
Single HTML file
External dependencies
None, no CDN, no iframe
Max size
5 MB
Assets
Inlined as base64 or generated at runtime
Targets
AppLovin Playable Preview + mobile browser


3. Jury criteria (4 axes equally weighted a priori)
Quality: clear and engaging core gameplay loop, smooth on mobile, visual and audio polish, compliance with ad network constraints.
Speed: speed and ease of producing a variation.
Process Robustness: configurable parameters, ability to handle another game or another video.
AI Usage & Creativity: AI usage across the whole workflow (video analysis, code generation, asset creation), creativity in simplification, originality in automation.

4. Pipeline architecture (TO DISCUSS NOT FIXED)
4.1 Overview
┌─────────────────┐
│ Gameplay video  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│ Gemini #1: video analysis   │
│ (vision, design breakdown)  │
│ Output: spec JSON            │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ 2D / 3D routing             │
│ is_2d flag from spec        │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Asset resolution            │
│ 1) Voodoo bank lookup       │
│ 2) Scenario generation      │
│ 3) geometric fallback       │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ HTML codegen: Gemini        │
│ (Fallback Sonnet 4.6)       │
│ Fixed template + params     │
│ + inlined base64 assets     │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────┐
│ Single HTML     │
│ file < 5MB      │
└─────────────────┘

4.2 Detailed steps
Step 1: Gemini #1, video analysis
Input: raw gameplay video.
Model: Gemini Flash or Pro with native video vision capability.
System prompt: strict JSON structure expected.
Output: spec JSON containing the gameplay breakdown, the list of required assets, the template_id (equivalent to core_mechanic), the routing flag render_mode: "2d" | "3d", and the game design parameters.
Step 2: 2D / 3D routing
Read render_mode from the spec.
Determines the target HTML template and the runtime engine (vanilla Canvas 2D or vanilla Three.js).
Step 3: asset resolution (cascade)
Step 3a: lookup in the local bank (Castle Clashers full coverage).
Step 3b: on miss, Scenario.com generation via MCP (dedicated project credits).
Step 3c: geometric fallback (simple colored shapes) on full failure. Guarantees we always render something.
Step 4: HTML codegen
Model: Gemini.
Fallback: Claude Sonnet 4.6 (Anthropic credits offered for the hackathon).
Input: spec JSON + resolved base64 assets + target HTML template.
Output: self contained single file HTML.

5. Tech stack
5.1 Tools and infra
Claude Code: main codegen for the pipeline and the Next.js UI.
Gemini API: video analysis call in the pipeline.
Scenario.com: missing asset generation, MCP connector wired to Claude Code.
Voodoo bank: Castle Clashers assets already in hand.
Three.js vanilla: 3D engine inlined in 3D templates (~650 KB minified, under the 5 MB budget).
Canvas 2D vanilla: 2D engine, no framework, hand written primitives library.
5.2 Demo UI
Next.js: custom UI for the jury presentation.
First half: pitch slides.
Switch to the prototype: video upload + assets folder (automated pre staging).
Pipeline runs in front of the jury, HTML output rendered in an iframe or shadow DOM.
Fallback: pivot to a previously generated video if the live demo struggles.

6. Locked decisions
ID
Decision
Choice
Q1
2D/3D scope
Single polymorphic pipeline, routing via flag in the spec, identical architectures with runtime adaptation on the 3D side
Q2
HTML codegen strategy
Fixed templates per genre, the LLM fills in the parameters
Q3
End to end runtime
No hard constraint, video fallback if live takes too long
Q4
core_mechanic field
Identified as template_id, value in a closed enum
Q6
Demo posture
Live, possible pivot to recorded video on failure
Q8
LLM stack
Gemini for codegen and video analysis, Claude Sonnet 4.6 as fallback
Q10
3D engine
Three.js vanilla
Q11
Assets
Castle Clashers in hand, other games via auto Scenario generation
Q12
Audio
Voodoo assets if available, generated otherwise


7. Open decisions
Q7. Exact list of templates to commit
Probable target: 3 2D templates + 3 3D templates, to be confirmed based on the inventory done Saturday 10:00 AM.
Q9. Granularity of Gemini #1 output
Secondary question, to refine throughout the hack once we have a first working prototype.
Q5. Asset matching strategy
We check if there are preloaded assets in the folder: if yes use them, otherwise fallback to generation.
Direct lookup on the Voodoo Castle Clashers bank.
Scenario generation for other games.
Still to decide: manual tagging of the Voodoo bank or not, and prompt strategy for Scenario to guarantee visual consistency between generated assets (implicit or explicit style guide?).

8. Risks and fallbacks
Risk
Probability
Impact
Mitigation
Gemini produces broken HTML on a template
Medium
High
JSON schema check + retry, robust templates with typed params, unit tests of each template before the hackathon
Inlined Three.js blows the 5 MB budget on a 3D playable loaded with assets
Medium
High
Strict asset quota per 3D template (max N sprite textures), aggressive compression, low poly geometry fallback
Scenario MCP crashes live in front of the jury
Medium
Medium
Local cache of assets generated upfront for Castle Clashers and Epic Plane, geometric fallback otherwise (preferably this will already be generated at demo time)
AppLovin Playable Preview rejects the HTML
Low
Critical
Test each template on AppLovin Preview before the hackathon, validate compliance (preferably this will already be generated at demo time)
Pipeline too slow in live demo
Medium
Low
No hard constraint, switch to recorded demo video if necessary


9. Demo for the jury
9.1 Structure
Next.js slides (5 minutes): problem, approach, pipeline architecture, differentiating axes.
Switch to prototype: upload interface, video selection (Castle Clashers or Epic Plane).
Live pipeline: execution in front of the jury, real time display of stages (Gemini analysis, asset resolution, codegen).
Rendered output: playable played directly in the UI, we tap or drag to show it works.
9.2 Pivot plan if live fails
Recorded video of the pipeline running on both target demos, 2 minutes max.
Prepare the video upfront, keep it accessible in the Next.js UI under a "fallback recording" button.
Assumed honesty if challenged: "we have a live case, here is the validation video in case the live demo is not enough".
9.3 Pitch narrative
Three angles to insist on with the jury:
Genericity: "we take any video, we output a playable, here are 2 different games in 2D and 3D".
AI usage end to end: "Gemini understands the video, Claude writes the code, Scenario generates the missing assets. No human step in the production loop."
Robustness: "typed JSON schema, cascading fallbacks, on demand asset generation, we don't crash if an asset is missing".

