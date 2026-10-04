# Data model: The Skillcraft Visualizer

Shapes are defined as zod schemas in `src/viz/contract.ts` (no Node imports) and shared with the page.
Field names here are the contract; types are text (`string`), `number`, flag (`boolean`).

## Catalog

```text
Catalog       { format: 1, runs: CatalogEntry[] }          # no timestamp: same folder, same bytes
CatalogEntry  { id, kind, status, reason?, attributes, preview?, bundle? }
```

| Field | Meaning |
|---|---|
| `id` | first 16 hex of SHA-256 of `<kind>:<relative path with />` (R3 of research); stable across scans |
| `kind` | `run` (a run folder) or `bundle` (an exported bundle folder) |
| `status` | `ready` (opens), `unfinished` (no `score.json`), `unreadable` (cannot be opened) |
| `reason` | for `unfinished` and `unreadable`: `code: fixed message`, never a wrapped error's text. Codes: `Unfinished`, `WorldMissing`, `ReplayFailed`, `BundleInvalid` (a bundle folder), `RunInvalid` (a run folder whose files cannot be read) |
| `attributes` | flat record, below; present for every status, with whatever the folder yields |
| `preview` | `ready` only: `{ strip, table, made? }` (`made` names the goal item when the run reached it) |
| `bundle` | `ready` only: relative address prefix of the bundle, `bundles/<id>/` |

## Attributes

A flat record of name to `string | number | boolean`. A name is absent when the run lacks the value; nothing is
defaulted. The page treats the set of names as open.

| Group | Name | Kind | Source |
|---|---|---|---|
| Identity | `label` | text | folder name of the run's parent (run folders) or the manifest's `label` (bundles) |
| | `run` | text | the run's folder name (`001`) |
| | `world` | text | world name |
| | `rows`, `cols` | number | world grid |
| | `goalItem` | text | score goal |
| | `goalQty` | number | score goal |
| Conditions | `modelRequested` | text | `model.requested` |
| | `modelRan` | text | `model.resolved` joined with `, ` |
| | `priorFit` | text | `score.json` `priorFit` (`invented`, `perturbed`, `faithful`, `undeclared`) |
| | `promptNote` | text | `score.json` `promptNote` |
| | `skill` | text | `skill.name` |
| | `skillLoaded` | flag | `skill.invoked` |
| | `skillLoadedAfter` | number | `skill.loadedAfterCalls`, when loaded |
| Result | `outcome` | text | `reached`, `gave up`, `out of turns`, `error`, `unfinished` (derivation in research R4) |
| | `actionCalls` | number | `score.actionCalls` |
| | `bestCalls` | number | `score.best.minCalls` |
| | `extraCalls` | number | `score.extraCalls` |
| | `crafts`, `failedCrafts`, `refusals` | number | `score.craftsMade`, `score.failedCrafts`, sum of `score.refusals` |
| Cost | `durationMs` | number | `measured.total.durationMs` (matched traces only) |
| | `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheCreationTokens` | number | `measured.total` |
| | `costUsd` | number | `measured.total.costUsd` (a run total only; matched traces only) |
| | `traceMatched` | flag | `measured.trace === "matched"` |

Run folders with no `priorFit` or `skill` fields (older harness) simply lack those attributes.

## Preview

```text
Preview { strip: string, table: (string | null)[][] }
```

- `strip`: one character per action call, in order: `p` placement, `c` craft, `r` refused call, `t`
  take-back (`remove` or `clear`), `.` an action that changed nothing and was not refused. Reads (`look`,
  `inventory`, `help`) are not in the strip.
- `table`: the grid after the last call (item ids and nulls). Item ids are already in frames; no recipe or
  description is present.

## Replay bundle (unchanged shape, additive manifest)

Files per run: `bundle.json`, `frames.jsonl`, `trace.jsonl`, `score.json`, as ADR-002 and
[spec 002's contract](../002-client-otel-trace/contracts/replay-bundle.md) define them. `bundle.json`
(`format: 1`) gains optional fields:

| Field | Meaning |
|---|---|
| `priorFit` | the run's recorded prior fit |
| `promptNote` | the fixed sentence added to the prompt, when there was one |
| `skill` | `{ name, loaded, loadedAfter }` where `loadedAfter` is a number or `null` |

Readers ignore fields they do not know. Bundles exported earlier lack the new fields; their catalog entries
lack the matching attributes.

## View (page only, not persisted)

```text
View   { group: string | null, sort: { attr: string, dir: "asc" | "desc" } | null, search: string,
         presentation: "grid" | "list" }
```

The bar offers sort by `actionCalls` or `durationMs` and group by `world` or `goalItem`; search matches any text attribute. There are no
filters (ADR-004 amendment, 2026-10-04). The page also holds the
selected runs (shift-click; at most two for comparison) and the open tables (at most two). None of this is written
anywhere; a saved or shareable view is an extension left out for now.

## State and transitions

- A run entry's `status` is decided at scan time and recomputed on each catalog request. `unfinished` may
  become `ready` when the harness writes `score.json`; nothing else changes state.
- An open table moves through `paused` at start, `playing`, `paused`, `at end`; the playhead is a frame
  `seq`. Playback pacing and scrubbing are presentation only.
