# Data Model: Versioned Prompts and a Call Budget

## Prompt kind

A series of immutable versions under `prompts/<kind>/`. `src/prompts/` holds one table row per kind.

| Kind | Extension | Placeholders | Word check | First version |
|---|---|---|---|---|
| `base` | `.txt` | `{what}` (required), `{item}`, and at most one of `{turns}` (steps) and `{budget}` (tool calls) | no `skill`, `memory` or `learn`; version 2 also no `explore` or `unfamiliar` | v1 is today's prompt; v2 is ADR-007 §2.3 |
| `arm-sentence` | `.txt` | none | none | v1 is the S2 sentence |
| `skill-tool` | `.txt` | `{name}`, `{described}` | none | v1 is today's description |
| `review-rubric` | `.json` | none (the file is the existing rubric schema) | none | v1 is the existing file, bytes unchanged |

Every version has a `## v<N>` section in its kind's `CHANGELOG.md` saying what changed and why; a version without one, a
kind without a first version, or an unknown placeholder is refused before any run or loop.

## Prompt version identity

| Value | Definition |
|---|---|
| `version` | `N` from the file name; `custom` for `--prompt-file` and a free-text `--prompt-note` |
| `sha256` | SHA-256 of the file's bytes (a kind's own fingerprint, used for the arm sentence, the skill tool and the rubric) |

## Filled base prompt

The base version with placeholders replaced, trimmed, plus the arm sentence on its own line if any. This is what `prompt.txt`
holds (plus a trailing newline) and what the agent receives.

| Value | Definition |
|---|---|
| `baseSha256` | SHA-256 of the filled text before the arm sentence is appended |
| `sha256` | SHA-256 of the full text sent, without the trailing newline |

`baseSha256 == sha256` when the arm has no sentence.

## Budget

| Kind | Declared by | Enforced by | Ends the run when |
|---|---|---|---|
| `steps` | `--max-turns`, a `{turns}` or absent placeholder | the SDK's step limit | N responses are made (`ended: budget`) |
| `calls` | `--call-budget`, a `{budget}` placeholder | the driver's craft-tool wrapper | N craft-tool calls have been executed, after that response |

State: `used` (calls executed), `refused` (calls answered with the fixed line). `used + refused` is every craft call the
model emitted; `refused` is zero unless a response crossed the budget.

## Run score additions (`score.json`)

| Field | Type | Notes |
|---|---|---|
| `prompt` | `{ version, baseSha256, sha256, armSentence?: { version, sha256 }, skillTool?: { version, sha256 } }` | `version` is the base prompt's; `armSentence` present when the arm added one; `skillTool` present when a skill was installed; the whole block absent in older runs |
| `budget` | `{ kind: "steps" \| "calls", limit: number }` | absent in older runs |
| `budgetRefused` | integer | calls refused for being over a call budget; 0 for a step budget; absent in older runs |

Reused unchanged: `turns` (responses), `score.totalCalls` (all executed craft-tool calls), `score.actionCalls`
(table-changing calls; `callsToGoal`, `extraCalls` and slack keep their meaning).

## Loop record addition (`loop.json`)

The existing rubric block (`version`, `sha256`) gains `kindVersion` (the `N` of `prompts/review-rubric/v<N>.json`). Earlier
records without it are read as before.

## Prompt set (experiment `summary.json`)

```json
"promptSet": { "base": "2", "callBudget": 100, "armSentence": "1", "skillTool": "1", "reviewRubric": "1" }
```

`base` is required when `promptSet` is present; the other keys are optional and checked only where they apply
(`reviewRubric` by loops, `armSentence` and `skillTool` by arms that use them). `callBudget` is required with a `{budget}`
base prompt and refused with a `{turns}` one.

## Summaries and bundle

- Batch `summary.json`: `prompt: { version, baseSha256 }` and `budget: { kind, limit }`; a call budget writes `callBudget`
  and no `maxTurns`.
- Bundle manifest: optional `prompt` block as in the score; the viewer's schema accepts it.

## State transitions: a run under a call budget

```
start (used=0, refused=0)
  └ response emits k craft calls
      ├ used + k <= N: all execute; if used == N the run ends after this response
      └ used + k > N: the first N - used execute, the other k - (N - used) are refused; the run ends after this response
  └ response emits no call: the run ends (stopped)
end: ended = budget if the goal is not held, stopped if it is (decided by the harness from the replayed log)
```
