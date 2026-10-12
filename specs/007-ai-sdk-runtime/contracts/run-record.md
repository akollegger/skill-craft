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
- `model.resolved` is what the provider reported, normalised through the table (research R2). Runs whose `backend` values differ make an experiment `mixedModels`, as differing `resolved` models do. `backend` appears only for a routed provider.
- `costUsd` is the first available of a provider-reported cost, a pin in `prices.json` and a market quote, and `null` when none applies, never zero, and `null` for a run that never got a response. `costSource` is `provider`, `pin`, `market-quote` or `null`, and is absent from a run made before sources were recorded. `reportedCostUsd` is present only when the provider reports a cost. `priceQuote` is present when the cost was computed (a pin or a quote): `{ source, openRouterId (null for a pin), fetchedAt (null for a pin; for a quote the time the list was read, which is the cache's when the cache was used), perMillion: { input, output, cacheRead?, cacheWrite? }, note? }` (ADR-006 §2.4 as amended; FR-046 to FR-048).
- `settings` records the pinned settings the run used; `null` means unset (the provider's default applied).
- `retries.failedAttempts` counts attempts that threw before the request that succeeded, and a final failure.
- The privacy test's allowed keys for `score.json` gain `reportedCostUsd`, `settings`, `retries`, `costSource` and `priceQuote`. No field holds agent text or reasoning.

## `summary.json` (one per label)

`aggregate` gains `pricedRuns` and `unpricedRuns`, and `costSources` (the sorted sources of the priced runs, none for a run with no source) and `mixedCostSources` (true when there is more than one). `totalCostUsd` sums priced runs only, and a run whose cost is the provider's counts as priced. `models` and `mixedModels` keep their meaning, now
over the reported models.

## Experiment summary (`runs/<experiment>/summary.json`, spec 003)

`models` gains a `settings` map from model spec to `ModelSettings`, written before the first trial and not changed after
a trial has run, as the other fixed fields are. An experiment with no pinned settings records `{}`, which means every
setting is unset.

## Report (`scripts/report.ts`)

Every cost it prints carries the unpriced count: `$3.28 (0 unpriced)`, or `$0.41 (5 unpriced)`. A cost cell for a label with only unpriced runs is `- (N unpriced)`, never `$0.00`. A run with no cost figure at all (a model with no price, or a run that never got a response) counts as unpriced. A row whose runs say where their cost came from carries the source after the unpriced count: `$0.40 (0 unpriced) [market quote]`, `[provider-reported]` or `[pin]`. When the report's costs come from more than one source it says so and says they are not one comparable figure, and when any is a market quote it says that a quote is a marketplace price and not a record of any host's rate (FR-049).

## Calibration results

`design/notes/runtime-recalibration.md` states the runtime (`ai-sdk, ADR-006`), the base prompt wording, the pinned settings,
and each goal's role under the ADR-003 §2.1 rule.
