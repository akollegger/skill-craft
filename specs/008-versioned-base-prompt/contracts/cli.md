# Contract: command options

## `run-agent.ts`

| Option | Meaning |
|---|---|
| `--prompt-version <N>` | The base prompt, `prompts/base/v<N>.txt`. Default `1` |
| `--prompt-file <file>` | An ad hoc base template (existing); recorded as `custom`. Exclusive with `--prompt-version` |
| `--max-turns <n>` | A step budget (existing, default 40); the meaning for `{turns}` or no budget placeholder |
| `--call-budget <n>` | A call budget; required for a prompt with `{budget}` and refused for any other |
| `--arm-sentence <N>` | The arm sentence, `prompts/arm-sentence/v<N>.txt` |
| `--prompt-note <text>` | Existing free-text sentence; recorded as `custom`. Exclusive with `--arm-sentence` |
| `--experiment <folder>` | Optional. Reads `<folder>/summary.json`'s `promptSet` and refuses an arm whose base version, call budget, arm sentence or skill tool version differs |
| `--skill-tool-version <N>` | The skill tool's description, `prompts/skill-tool/v<N>.txt`. Default `1`, so a new version never changes a command that does not ask for it |

Refusals, exit 1, before any model call: a `{budget}` prompt with `--max-turns` and no `--call-budget`; a `{turns}` prompt with
`--call-budget`; both flags; an unknown version; two ways to give the base or the sentence; an experiment mismatch.
`--dry-run` shows every version, both hashes and the budget.

Each run's line gains `prompt v<N>` and, for a call budget, `budget calls <limit> (refused <n>)`.

## `critic-loop.ts`

Gains optional `--experiment <folder>`: refuses a rubric `kindVersion` that differs from `promptSet.reviewRubric`, before any
spend. The loop record names the kind version beside the existing hash.

## `prompts.ts`

`pnpm dev scripts/prompts.ts` lists every kind and version (contracts/prompt-file.md) and exits 1 on a missing changelog entry.
