# Data Model: Complete the AI SDK Runtime

Shapes the feature adds or changes. Files are JSON; fields are optional only where stated.

## Provider table row (`src/harness/providers.ts`)

| Field | Meaning |
|---|---|
| `prefix` | The spec prefix: `anthropic`, `fireworks`. `claude-…` is shorthand for `anthropic/claude-…` |
| `package`, `factory` | npm package and export that create the provider; read as strings by `ai-driver.ts` |
| `keyEnv` | Environment variable holding the key |
| `expand(short)` | A short model name to the provider's id |
| `normaliseReported(id)` | A reported id to the recorded spec form |
| `routed`, `pinnedBackend` | A router must have a pinned backend (fallbacks off, order fixed) or it is refused |
| `usageReport` | Name of the provider's usage report, or null; the billing check applies only when set |
| `settings` | Which of thinking, effort and temperature the provider takes, with per-model refusals |
| `callOptions(settings)` | Provider call options (the cache option; settings mapped to the provider's names) |
| `reportedCost(meta)` | Optional: reads a per-request cost from provider metadata |

Validation: a row with `routed: true` and no `pinnedBackend` is invalid (FR-004). A spec whose prefix is not a row is
refused with a fixed message listing the prefixes (FR-001).

## Model spec

`<prefix>/<model>`, or a bare `claude-<id>`. Recorded exactly as given in `model.requested`.

## Model record (in `score.json`)

`model: { requested: string | null, resolved: string[], backend?: string }`. `resolved` holds the normalised reported ids,
sorted. An experiment whose runs' `resolved` sets differ is `mixedModels` (unchanged rule).

## Price entry (`prices.json`)

Unchanged: `{ input, output, cacheRead?, cacheWrite? }` in US dollars per million tokens, keyed by spec. A model with
no entry is unpriced. Entries for Fireworks models are added from measured usage.

## Pinned settings

`ModelSettings = { temperature?: number; effort?: "low" | "medium" | "high" | "xhigh" | "max"; thinking?: "adaptive" | "off" }`.
A settings file maps spec to `ModelSettings`. `score.json.settings` is `{ temperature: number | null, effort: string | null, thinking: string | null }`,
with `null` meaning unset.

## Retry record (in `score.json`)

`retries: { max: number, failedAttempts: number }`. `max` is the stated setting (2); `failedAttempts` counts attempts that threw,
including a final failure. The trace is unchanged.

## Cost fields

`score.json.costUsd` (computed, nullable, unchanged) and `reportedCostUsd` (optional, nullable). `summary.json.aggregate`
gains `pricedRuns` and `unpricedRuns`; `totalCostUsd` is over priced runs only.

## Live check record (`design/notes/`)

Free text with a fixed heading per check: what ran, the command, the cost, the outcome. Not machine-read.
