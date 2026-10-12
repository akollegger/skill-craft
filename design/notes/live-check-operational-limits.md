# Live check: the spend cap and the step timeout on a real model

Run 2026-10-12 (spec 007, T079), by hand with `scripts/run-agent.ts`, `claude-haiku-4-5-20251001`, goal `glirol` on `forge-7`, no settings pinned. Total spend about US$0.08.

| Check | Command option | Result |
|---|---|---|
| Token cap | `--max-total-tokens 2000` | Ended as a budget stop with the reason `SpendCap: the player reached its spend cap`, after 2 turns (3,084 input and 96 output tokens, US$0.0036). The step that crossed the cap finished, and the run stopped there. `score.json` records the limits the run ran under |
| Step timeout, too short | `--step-timeout-seconds 1` | The first step did not return within a second. The run ended as an error with `DriverFailed: the player reported step_timeout`, with no turns and no usage |
| Step timeout, long enough | `--step-timeout-seconds 3` | No step took longer: the run finished normally (31 turns, reached the goal) |
| Orphans | after all runs | No craft server was left running by these runs. Three server processes were running afterwards, all about 2 days 16 hours old and children of an earlier session's tools, so they predate the check (checked by age and parent) |

## What it found

A run whose first step timed out was recorded with `costUsd: 0`, counted as a priced, free run. No response had come back, so there was no cost figure. The report's totals say a run with no response is unpriced, and the driver now returns `null` when no step completed. Fixed with a test written first (`test/ai-driver-faults.test.ts`); a rerun of the one-second timeout then recorded `costUsd: null` and the summary line `cost - (1 unpriced)`.

## What it did not cover

The tool timeout (`--tool-timeout-seconds`) and a dead craft server were not run live; the scripted tests cover them with the real craft server. A timeout that cuts a real step off after some steps have finished (so a cost is recorded) did not happen: the one-second run failed on its first step and the three-second run never timed out. The scripted test covers that case.
