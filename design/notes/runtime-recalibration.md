# Recalibration on the AI SDK runtime: a regression check

Status: **run 2026-10-11** (spec 007, T048 and T049). The baseline and the limits were written before the rerun; the results are below.

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

The faithful world, 5 trials per cell, the base prompt as originally worded, settings pinned as in `calibration-settings.json`
(Sonnet: adaptive thinking, medium effort; Haiku: a 31,999-token thinking budget), `--max-turns 80`. Labels `rt-cal-faithful-*`.
Intervals are 95% Wilson.

| Model, goal | Claude Code era | AI SDK runtime | Same? |
|---|---|---|---|
| Haiku, wooden_pickaxe | 4/5 [38, 96] | 4/5 [38, 96] | yes |
| Haiku, stone_pickaxe | **0/5 [0, 43]** | **4/5 [38, 96]** | **differs** (the intervals overlap only between 38 and 43) |
| Haiku, iron_pickaxe | **5/5 [57, 100]** | **3/5 [23, 88]** | **differs** (the intervals overlap widely) |
| Sonnet, wooden_pickaxe | 5/5 [57, 100] | 5/5 [57, 100] | yes |
| Sonnet, stone_pickaxe | 5/5 [57, 100] | 5/5 [57, 100] | yes |
| Sonnet, iron_pickaxe | 5/5 [57, 100] | 5/5 [57, 100] | yes |

**Gross breakage: none seen.** No cell that was high is now at or near zero, and Sonnet's three cells and Haiku's wooden cell are the
same. This is what the check can show and nothing more: at 5 trials per cell it does not show the runtimes are equivalent.

**Two Haiku cells differ, in opposite directions, and the cause is not known.** Stone went from 0/5 to 4/5 and iron from 5/5 to
3/5. At 5 trials a difference of this size is within what chance produces, and chance and cause cannot be told apart from
these runs. The differences between the two runtimes' requests that this note knows of, none of them tested:

- The tools were named `mcp__craft__place`, `mcp__craft__craft` and so on under Claude Code, and are `place`, `craft` and so on
  here; the prompt says "use only the craft tools".
- Claude Code added a short system stub and several context blocks to every request that have no counterpart here.
- The earlier note on the base prompt (`design/notes/critic-loop-findings.md`) found that rewording it moved Haiku on stone from
  0/5 to 4/5 under Claude Code; the same 4/5 appears here with the original wording, which may mean the original wording's effect
  was partly the Claude Code context.

Each trial's cost: Haiku $0.12 to $0.20, Sonnet about $0.02 (priced runs only, none unpriced), $2.72 for the 30 runs.

## What this means for the experiment

Under ADR-003's rule, unchanged (at most 1 of 5 is a gap, at least 4 of 5 is solved, otherwise ambiguous), Haiku's roles on this
runtime are **wooden solved, stone solved, iron ambiguous**. There is **no gap goal** in the faithful world on the new runtime: the
earlier finding that stone is Haiku's one real gap (0/5) is not reproduced. ADR-003 says an experiment needs at least one gap goal
and that, without one, the world is made harder and calibration repeated. Whether the earlier 0/5 was a Claude Code effect or
chance is the open question; the cheap next step is more trials on stone (and iron) on both runtimes, since 5 trials cannot settle it.

The report had a bug found here: it proposed no roles ("no student trials") because it compared the summary's bare model name with
the runs' canonical one. It is fixed, with a test.

## Addendum 2026-10-12: Haiku was measured without interleaved thinking

The Haiku cells above were run with a thinking budget of 31,999 but without the `interleaved-thinking-2025-05-14` beta that the earlier runtime sent. Without it Haiku reasoned once, before its first tool call, and then only wrote text between tool results (two runs); with it, it reasoned on every turn (three runs). The Haiku stone (0/5 to 4/5) and iron (5/5 to 3/5) differences were therefore measured between a model that reasoned every turn and one that did not, which is a candidate cause that was not known when the differences were recorded. It has not been tested: the Haiku cells have not been rerun with the flag, and at 5 trials per cell a rerun would still show gross differences only. Sonnet's cells used adaptive thinking, for which no flag is sent; whether Sonnet reasons on every turn here is unchecked. The driver now sends the flag with a pinned budget (ADR-005 amendment of 2026-10-12).

