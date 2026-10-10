# Contract: What a Run and an Experiment Record

Changes to `score.json`, `summary.json` and the report. Everything not listed is unchanged. `run.jsonl` and the trace
keep their shape (ADR-002 §2.4; the only recorder change is where a request's model comes from, research R2).

## `score.json` (one per run)

Added keys, all after the existing ones:

```json
{
  "model": { "requested": "fireworks/gpt-oss-120b", "resolved": ["fireworks/gpt-oss-120b"], "backend": "optional" },
  "costUsd": null,
  "reportedCostUsd": null,
  "settings": { "temperature": null, "effort": null, "thinking": null },
  "retries": { "max": 2, "failedAttempts": 0 }
}
```

- Every model name is canonical `<provider>/<model>` (a bare Claude id is recorded as `anthropic/<id>`); `requested` is `null` when the run named none. Earlier records with a bare Claude id are read as `anthropic/<id>` and not rewritten.
- `model.resolved` is what the provider reported, normalised through the table (research R2). `backend` appears only for a routed provider.
- `costUsd` is computed and `null` for an unpriced model. `reportedCostUsd` is present only when the provider reports a cost.
- `settings` records the pinned settings the run used; `null` means unset (the provider's default applied).
- `retries.failedAttempts` counts attempts that threw before the request that succeeded, and a final failure.
- The privacy test's allowed keys for `score.json` gain `reportedCostUsd`, `settings` and `retries`. No field holds agent text or reasoning.

## `summary.json` (one per label)

`aggregate` gains `pricedRuns` and `unpricedRuns`. `totalCostUsd` sums priced runs only. `models` and `mixedModels` keep their meaning, now
over the reported models.

## Experiment summary (`runs/<experiment>/summary.json`, spec 003)

`models` gains a `settings` map from model spec to `ModelSettings`, written before the first trial and not changed after
a trial has run, as the other fixed fields are. An experiment with no pinned settings records `{}`, which means every
setting is unset.

## Report (`scripts/report.ts`)

Every cost it prints carries the unpriced count: `$3.28 (0 unpriced)`, or `$0.41 (5 unpriced)`. A cost cell for a label with only unpriced runs is `-`.

## Calibration results

`design/notes/runtime-recalibration.md` states the runtime (`ai-sdk, ADR-005`), the base prompt wording, the pinned settings,
and each goal's role under the ADR-003 §2.1 rule.
