# Track 2 - Automate playable ads creation

<aside>
🎯

**Your mission:** Build an AI-powered pipeline that turns gameplay videos into lightweight, interactive HTML playable ads. You have 30 hours to ship a working playable prototype for *Castle Clasher* and document your process.

</aside>

## The Challenge

At Voodoo, **playable ads** let players experience a game's core mechanics directly inside an ad unit — they're a key part of our user acquisition strategy. These ads must be lightweight, fast-loading, and follow strict technical constraints imposed by ad networks.

Your task is to **analyze a gameplay video**, identify the core interaction, and **build a single-file HTML playable** that reproduces it. You are not expected to recreate the full game — focus on the smallest version of the gameplay that still feels engaging.

> The goal is not a pixel-perfect clone. It's a prototype that shows you can deconstruct a game loop, ship fast, and think critically about what makes a playable ad effective.
> 

---

## Materials Provided

You will receive the following at kick-off:

- **Video creatives** from the game Castle Clasher (you can also download the game): [Google Drive — Videos](https://drive.google.com/drive/folders/1vh0R_LHUPH3B7UZjQF1XzvjUcwtneIGt?usp=sharing)
- **Asset folder** containing images and audio you can use: [Google Drive — Assets](https://drive.google.com/drive/folders/1TDheXaG9xMZrTdVJyD3PX8IAM1IFYalv?usp=sharing)
- **Example folder** containing two real playables made by Voodoo: [Google Drive — Playables](https://drive.google.com/drive/folders/1S7hqxbGiaKS7Gc6h5Y0bNQTDuYfusqhB)

---

## Deliverables

1. **Single HTML file playable**
    - [ ]  **Playable prototype** — a single HTML file, no external dependencies
    - [ ]  **Core gameplay interaction** from the video is functional and interactive
    - [ ]  **Runs in a browser**
    - [ ]  **Runs on** [AppLovin Playable Preview](https://p.applov.in/playablePreview?create=1) and your mobile device(you can download the app to scan the QR code to test on your phone)
    - [ ]  **File size under 5 MB** with fast loading time
2. **Multiple variations** generated from configurable parameters (spawn speed, enemy count, difficulty, etc.)
3. **Bonus: full AI pipeline** — video ingestion → game analysis → playable generation, end to end

---

## Rules

| **Team size** | 3 to 5 people (organized by Unaite) |
| --- | --- |
| **AI usage** | At least 75% of your code must be written by AI agents (Claude, Cursor, Copilot, etc.) |
| **Output format** | A single self-contained HTML file. No external dependencies, no CDN links, no iframes. |
| **File size** | Maximum 5 MB. Assets must be inlined (base64) or generated at runtime. |
| **Pre-existing assets** | The provided asset folder, plus any assets you generate yourself. Be crafty. |
| **Platform** | Must run in mobile browsers. Test on [AppLovin Playable Preview](https://p.applov.in/playablePreview?create=1) before submitting. |

---

## Submission

### How to Submit

Send the following:

- Your **single HTML file** (the playable prototype) and **Variations**

Present the following:

- Demo on multi-variation generation
- Bonus: Demo on full AI pipeline

### Presentation Format

Every team presents to the full jury panel.

1. **Max 3 slides** covering:
    - Your pipeline and workflow
    - How AI helped analyze the video and generate the playable
    - What you would improve with more time
2. **5-minute walkthrough** demoing your playable and explaining your approach
3. **Q&A** with the jury

---

## Evaluation Criteria

All teams present to the full panel of judges. There is a **single winner** per track.

<aside>
🏆

**Prize: €1,500** for the winning team

</aside>

Your submission will be evaluated on four dimensions:

| Category | What the jury looks for |
| --- | --- |
| **Quality** |   • Core gameplay loop is clear and engaging
  • Smooth performance on mobile (no lag, no crashes)
  • Polish(effects, animations, or sound) that improve the juiciness
  • Meets all ad-network constraints (single file, < 5 MB, fast load) |
| **Speed** |   • How fast can produce a variation?
  • How easy can produce a variation?  |
| **Process Robustness** |   • Configurable parameters for generating variations
  • Could the pipeline handle a different game or video? |
| **AI Usage & Creativity** |   • AI tools used effectively across the workflow (video analysis, code generation, asset creation)
  • Creative problem-solving in simplification choices
  • Original ideas for automation or iteration |

---

## What You Get

<aside>
🤖

**Claude Credits**
40$ credits for all Claude models (Opus, Sonnet) courtesy of Anthropic. Recommended setup: VS Code + Claude Code

</aside>

<aside>
🎨

**Scenario Credits**
AI-generated 2D and 3D game art. Get your account at [scenario.com](http://scenario.com) at the start of the event. Tip: stick to 2D for faster results.

</aside>

<aside>
🧑‍💻

**Mentors**
Voodoo tech directors and senior developers will be on-site to help with technical questions, architecture advice, and game design feedback.

</aside>

<aside>
💬

**WhatsApp**
Unaite will set up a **WhatsApp loop** for coordination, questions, and team communication during the event.

</aside>

---

## Jury

| **Judge** | **Role** |
| --- | --- |
| Tong Li | Growth / Market Intelligence |
| Baptiste Lahanque | Marketing Developer |
| Guillaume Portes | Publishing / Strategy |
| Antoine Colin | Technical / Data |

---

## Tips for Success

- **Watch the video carefully.** Identify the one mechanic that makes the game fun. That's your playable.
- **Use AI to analyze the video.** Gemini can break down gameplay footage into structured descriptions of mechanics, pacing, and interactions.
- **Use Claude Code for the HTML.** AI coding tools are fastest for single-file prototypes with inlined assets.
- **Test early on AppLovin.** Upload your HTML to [AppLovin Playable Preview](https://p.applov.in/playablePreview?create=1) before submitting — don't wait until the last minute.
- **Scope aggressively.** A tight, smooth one-level playable beats a buggy three-level one every time.
- **Think pipeline, not prototype.** The jury rewards reusable workflows. If you can show "change the video, get a new playable," you win points on robustness.
- **Set up your tools early.** Install VS Code, Claude Code, and get your Scenario account when the event starts.