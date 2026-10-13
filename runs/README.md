# runs/

Output of `scripts/run-agent.ts`: one folder per run label (`--label`, under `--out runs`), each holding a `summary.json` and numbered run
folders (`001`, `002`, ...). The folder is gitignored except for this file and `reports/`, because runs are large, regenerable and carry
model-authored text.

## A run folder (`runs/<label>/<NNN>/`)

| File | Contents |
|---|---|
| `run.jsonl` | The craft server's log of calls and whether each was ok. No timestamps. The record that scoring replays. |
| `score.json` | The ending (`stopped`, `budget`, `error`), the score against the best run, tokens, time, cost and its source, the model and its pinned settings, retries, limits. |
| `trace.jsonl` | The harness's measurement of each tool call (timings, usage). No agent text or reasoning. |
| `conversation.jsonl` | The model's text, reasoning and calls per turn. Model-authored; kept for the NAMS recording only. Do not copy it into reports. |
| `prompt.txt`, `mcp.json` | The prompt and the craft server's configuration for the run. |

## Labels

- `s1-<model>`: survey 1, five trials per model on `glirol` in `worlds/generated/forge-7.json` (see `reports/`).
- `m1-*`, `m2-*`, `m3*-*`: earlier runtime-migration checks (a capped nemotron on the faithful world, the invented-world calibration,
  Sonnet on `vriobeno`).
- `archive/`: a tarball of the runs made before the AI SDK migration, with its checksum and `MANIFEST.md`.

## reports/

Hand-written, dated findings from a survey or calibration, one file per survey: `YYYY-MM-DD-<survey>-<topic>.md`. Each states the runs it covers,
the settings, how its numbers were computed (a script in `spikes/survey/` where there is one) and its caveats. A report may cite
run folders and counts, never model text or reasoning.
