# Proto Pipeline

TypeScript-only no-mock pipeline for turning a gameplay video plus local assets into a playable feature spec.

All outputs are confined to:

```text
eliott-pipeline/proto-pipeline/outputs/
```

Runs are not timestamped. Re-running the same `--run` overwrites that output folder.

## Run

From the repo root:

```sh
node eliott-pipeline/proto-pipeline/src/cli.ts \
  --run b01 \
  --video "ressources/Video Example/B01.mp4" \
  --assets "ressources/Castle Clashers Assets"
```

Output:

```text
eliott-pipeline/proto-pipeline/outputs/b01/
```

Useful commands:

```sh
node eliott-pipeline/proto-pipeline/src/cli.ts --list-models
node eliott-pipeline/proto-pipeline/src/cli.ts --help
```

The script reads `GEMINI_API_KEY` from the environment or the repo `.env`.

