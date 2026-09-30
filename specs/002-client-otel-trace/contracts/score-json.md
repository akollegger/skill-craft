# Contract: additions to a run's `score.json`

The file the harness already writes (`ended`, `turns`, `costUsd`, `text`, `score`) gains one key and
one field inside `score`. Existing keys keep their meaning.

| Where | Field | Meaning |
|---|---|---|
| top level | `measured` | a `Measured` object (see [data-model.md](../data-model.md)) |
| `score` | `reachedSeq` | run-log `seq` after which the goal was first held; `0`, or `null` |

- `measured.trace` is `absent` when no trace lines exist. Then `total` and `toGoal` are omitted, and
  everything else in the file is as it was before this feature.
- `mismatch` carries `reason` naming the first disagreement (for example `tool count: log 19, trace
  18` or `call 7: log place, trace remove`) and omits `total` and `toGoal`.
- `matched` carries `total`, and `toGoal` when `score.reached` is true. If `reachedSeq` is 0,
  `toGoal` is all zeros.
- `total.durationMs` is the interaction span's duration when known, else the largest `endMs`.
- `toGoal` sums request lines with `endMs <=` the end of the goal-reaching tool line; its
  `durationMs` is that tool line's `endMs`.
- `costUsd` at the top level (from the CLI's result JSON) is unchanged and is separate from
  `measured.total.costUsd`; for a matched real run they should be equal.
