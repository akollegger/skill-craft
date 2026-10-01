# Contract: results report

`pnpm dev scripts/report.ts --experiment runs/<experiment> <run label folder>...` prints markdown to
standard output and writes nothing else.

Inputs: the experiment summary, the review record (when a skill was used), and the run folders named
(each with `summary.json` and per-run `score.json`).

## Table

One row per arm, model, world and goal:

| Column | Meaning |
|---|---|
| Arm, model, world | From the run labels and the experiment summary |
| Prior fit | The world's declared prior fit as recorded in the runs' scores |
| Goal | Learn or held-out, with the item |
| Reached | Successes out of trials |
| Rate interval | 95% Wilson score interval for the success rate |
| Extra calls | Minimum, median and maximum calls over the best run, over successful trials |
| Cost, tokens | Totals for the row |
| Skill loaded | For skill arms: the share of runs that loaded it, and the median call count at load |
| Flag | `ceiling` when at least 90% of trials succeed |

## Comparisons

For each pair the experiment asks about (faithful against invented, unaided; each skill arm against S0),
a line states `supported` when the two success-rate intervals do not overlap and `within noise`
otherwise, with the counts.

## Rules

- Contains only measured quantities, counts and fixed labels. No agent text and no reasoning.
- A combination with fewer trials than planned is shown with its actual count and a `short` flag; it is
  not silently dropped.
- Ends with the experiment summary's `manualSteps`, one per line, under "Steps done by hand".
- Deterministic: the same inputs produce the same output byte for byte.
- Exit status is non-zero if the summary is missing, a run folder is missing, a run's skill fingerprint
  differs from the reviewed one, or a run's `promptNote` disagrees with its arm's.
