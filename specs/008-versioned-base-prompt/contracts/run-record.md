# Contract: what a run, a loop and an experiment record

`score.json` (all fields optional so older runs still parse):

```json
{
  "prompt": { "version": "2", "baseSha256": "…", "sha256": "…",
              "armSentence": { "version": "1", "sha256": "…" },
              "skillTool": { "version": "1", "sha256": "…" } },
  "budget": { "kind": "calls", "limit": 100 },
  "budgetRefused": 0
}
```

- `prompt.version` is the base prompt's numbered version, or `"custom"`; `armSentence` and `skillTool` appear only when used.
- `budget.kind` is `"steps"` for `--max-turns` and `"calls"` for `--call-budget`.
- `ended` is `stopped` when the goal is held (including by the last call within a call budget), `budget` when the budget is
  used and it is not, `error` otherwise; `reason` keeps the `code: fixed message` form.

`loop.json`: the existing rubric block gains `kindVersion`.

Batch `summary.json`: `prompt: { version, baseSha256 }`, `budget: { kind, limit }`.

Experiment `summary.json`: optional `promptSet: { base, callBudget?, armSentence?, skillTool?, reviewRubric? }`. When present, a
run folder or loop whose recorded version of a pinned kind differs, or whose call budget differs, is refused by the report;
`run-agent --experiment` and `critic-loop --experiment` refuse it before any spend.

Bundle manifest: optional `prompt` block as in the score.

The report: `unversioned` for a run without `prompt`; the prompt set printed; unpinned kinds listed; a warning when arms'
`baseSha256` differ; an informational line when only `sha256` differs; "not pinned" when the summary has no `promptSet`.

The run log (`run.jsonl`) is unchanged and holds no refused call.
