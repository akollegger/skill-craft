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
| Goal | The goal's role (`gap`, `solved`, `ambiguous` or `held-out`) and the item |
| Reached | Successes out of trials |
| Rate interval | 95% Wilson score interval for the success rate |
| Extra calls | Minimum, median and maximum calls over the best run, over successful trials |
| Cost, tokens | Totals for the row |
| Skill loaded | For skill arms: the share of runs that loaded it, and the median call count at load |
| Flag | `ceiling` when at least 90% of trials succeed |

## Comparisons

For each pair the experiment asks about (faithful against invented, unaided; each skill arm against S0),
a line states `supported` when the two success-rate intervals do not overlap and `within noise`
otherwise, with the counts. They are grouped under three headings that stay apart:

- **Repair**: the gap goals, skill arms against S0. A note says the result is not yet distinguished from
  memory while there is no memory arm.
- **No harm**: the solved goals.
- **Transfer**: the held-out goals. When a held-out goal is solved unaided the section reads
  "unmeasurable: the held-out goal is solved without help".

Before the roles are in the summary the report prints, per goal, the role the calibration rule would assign
from the student's unaided rows (5 trials: at most 1 success is a gap, at least 4 is solved, otherwise
ambiguous) and stops there, so the roles can be copied into the summary by hand. The header shows the
route and primary measure and says they were declared after calibration.

## Rules

- Contains only measured quantities, counts and fixed labels. No agent text and no reasoning.
- A combination with fewer trials than planned is shown with its actual count and a `short` flag; it is
  not silently dropped.
- Ends with the experiment summary's `manualSteps`, one per line, under "Steps done by hand".
- Deterministic: the same inputs produce the same output byte for byte.
- Exit status is non-zero if the summary is missing, a run folder is missing, a run's skill fingerprint
  differs from the reviewed one, or a run's `promptNote` disagrees with its arm's.
