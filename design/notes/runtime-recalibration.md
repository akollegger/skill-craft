# Recalibration on the AI SDK runtime: a regression check

Status: **baseline and limits written; the rerun (spec 007, T048) has not run.** Results are added below when it has.

## What this is, and what it is not

ADR-005 moved every run from Claude Code (through the Claude Agent SDK) to the AI SDK. This note compares the faithful world's
calibration on the new runtime with the calibration already measured under Claude Code, cell by cell. It is a **regression
check**: it can show that the migration broke something badly. It cannot show the two runtimes behave the same.

**The limit, stated plainly.** Each cell is 5 trials. At 5 trials a result of 0 of 5 has a 95% upper bound (Wilson) of about
43%, and 5 of 5 a lower bound of about 57%; 4 of 5 spans roughly 38% to 96%. So only a gross change can be seen: a cell that
was 5/5 and is now 0/5, or the reverse. A cell that moves from 4/5 to 2/5, or from 0/5 to 1/5, is within what chance alone
produces at this size, and a cell that agrees is not evidence of equivalence either. A difference that appears cannot be told
apart as chance or cause from these runs; it can only be flagged and followed up with more trials or a direct look at a trace.

Equivalence with the Claude Code runtime is checked in two tiers and is not proven by either: tier 1 compares a component
(the critic and reviser roles' schema-valid rate, `design/notes/role-parse-rate.md`), tier 2 is this end-to-end check.

## The baseline: Claude Code era calibration, faithful world

From `runs/faithful-1-cal-faithful-*` (5 trials per cell, base prompt as then worded, no pinned settings).

| Model | iron_pickaxe | stone_pickaxe | wooden_pickaxe |
|---|---|---|---|
| `claude-haiku-4-5-20251001` | 5/5 | 0/5 | 4/5 |
| `claude-sonnet-5-5` | 5/5 | 5/5 | 5/5 |

Other Claude Code era runs the new runtime is also compared with:

| Runs | What | Result |
|---|---|---|
| `runs/calib-haiku`, `runs/calib-sonnet` | forge-7, `pluzhouvio` (22 calls, no slack) | 0/5 each |
| `runs/live-s1`, `runs/live-s2` | Haiku with a skill installed, stone_pickaxe | 3/3 each |

The invented world's cells (`runs/faithful-1-cal-invented-*`, 0/5 throughout) are outside this feature (spec 007 reruns the
faithful world only).

## What differs besides the runtime

A difference in a cell may come from the runtime or from these, and the rerun cannot separate them:

- Claude Code's system prompt and its skill discovery are gone. Its thinking and effort settings are reproduced by the pinned settings below.
- The new runs pin settings (`calibration-settings.json`) to what the earlier runtime was found to send (request shapes captured
  2026-10-11, see `role-parse-rate.md`): Sonnet with adaptive thinking at **medium** effort, Haiku with a thinking budget of 31,999
  tokens and the default temperature (Anthropic requires it while thinking is on). The earlier runs pinned nothing themselves;
  Claude Code supplied these. An earlier draft of this note pinned Haiku to thinking off and temperature 0, which would have
  compared different configurations.
- The base prompt is whichever wording is in place when the rerun starts; its wording is a separate open decision.

## Results

_Not yet run._ When T048 has run: the table of each cell now beside the baseline above, each goal's role under the unchanged
ADR-003 §2.1 rule, the cost with its unpriced count, and any cell that differs with what is known about why.
