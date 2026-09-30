# Contract: additions to a run's `score.json`

The file the harness already writes (`ended`, `turns`, `costUsd`, `text`, `score`) gains one key and
one field inside `score`. Existing keys keep their meaning.

| Where | Field | Meaning |
|---|---|---|
| top level | `measured` | a `Measured` object (see [data-model.md](../data-model.md)) |
| top level | `reason` | for `ended: "error"`: a code and message (`ReplayFailed`, `DriverFailed`, `RunTimedOut`), never personal data; absent otherwise |
| top level | `model` | a `ModelInfo`: `requested` (or `null`) and `resolved` (sorted list); present whatever the trace status |
| `score` | `reachedSeq` | run-log `seq` after which the goal was first held; `0`, or `null` |

- `measured.trace` is `absent` when no trace lines and no result figures exist. Then `total` and
  `toGoal` are omitted, and everything else in the file is as it was before this feature.
- `mismatch` carries `reason` naming the first disagreement (for example `tool count: log 19, trace
  18`, `call 7: log place, trace remove`, `output tokens: trace 3160, result 3165`, `run ended without
  a result` for trace lines with no final result, `models: trace a, result b` when the request lines'
  models differ from the result's, or `2 malformed items skipped`) and omits `total` and
  `toGoal`.
- `matched` carries `total`, and `toGoal` when `score.reached` is true. If `reachedSeq` is 0,
  `toGoal` is all zeros.
- `total.durationMs` is the result's `duration_ms`; `total.costUsd` is its `total_cost_usd`; the token
  fields are the sums of the request lines (checked equal to the result's `usage`).
- `toGoal` has duration and the four token totals only. Its duration is the goal-reaching tool line's
  `endMs`; its tokens sum request lines with `endMs` at or before that. There is no `toGoal` cost.
- The top-level `costUsd` (existing) and `measured.total.costUsd` come from the same result and are
  equal for a matched run.
