# Eliott Pipeline

Personal sandbox for the video-to-playable experiments.

Canonical pipeline:

```text
eliott-pipeline/proto-pipeline/
```

Run from the repo root:

```sh
node eliott-pipeline/proto-pipeline/src/cli.ts \
  --run b01 \
  --video "ressources/Video Example/B01.mp4" \
  --assets "ressources/Castle Clashers Assets"
```

All generated outputs are confined to:

```text
eliott-pipeline/proto-pipeline/outputs/<run>/
```

Runs are intentionally not timestamped. Re-running the same `--run` overwrites the previous output.

