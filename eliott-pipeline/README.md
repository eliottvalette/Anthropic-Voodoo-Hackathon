# Gemini video probe

Small sandbox for testing what Gemini can extract from the Castle Clashers gameplay videos.

Current default model: `gemini-3.1-pro-preview`.

## Run

```sh
node eliott-pipeline/gemini-video-probe.ts \
  --video "ressources/Video Example/B01.mp4" \
  --out-dir eliott-pipeline/runs/b01_gemini31
```

Useful options:

```sh
node eliott-pipeline/gemini-video-probe.ts --list-models
node eliott-pipeline/gemini-video-probe.ts --video "ressources/Video Example/B11.mp4" --model gemini-3.1-pro-preview
node eliott-pipeline/gemini-video-probe.ts --video "ressources/Video Example/B01.mp4" --fps 2
```

The script reads `GEMINI_API_KEY` from the environment, or from the repo `.env` file.
It saves raw API JSON plus extracted text/JSON artifacts in the output directory.

The TypeScript is written with erasable syntax so it can run directly on Node 25:

```sh
node eliott-pipeline/gemini-video-probe.ts --help
```
