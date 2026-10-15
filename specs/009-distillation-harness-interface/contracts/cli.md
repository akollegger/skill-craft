# Contract: `scripts/distill.ts`

```text
pnpm dev scripts/distill.ts --harness <name> --runs <run folder>... [--allow-workspace]
   [--critic-model m] [--reviser-model m] [--distiller-model m] [--format graph|prose] [--max-rounds n] [--max-role-usd n]
   [--timeout-minutes n] [--out distills] [--label name] [--settings <file>] [--experiment <folder>] [--dry-run]
```

| Option | Meaning |
|---|---|
| `--harness` | `nams-reviewed` or `bespoke-one-shot`; an unknown name is refused before anything runs |
| `--runs` | finished run folders of one task; run folders may follow without repeating the option |
| `--allow-workspace` | required by `nams-reviewed` (it creates and deletes a managed workspace); refused without it before any account write |
| `--critic-model`, `--reviser-model` | for `nams-reviewed`; default to the one model the recordings came from |
| `--distiller-model` | for `bespoke-one-shot`; required |
| `--settings` | pinned settings per model, as for a player |
| `--max-role-usd`, `--max-rounds`, `--timeout-minutes` | as `critic-loop.ts` had them |
| `--experiment` | refuses a distiller prompt version that differs from the experiment's pinned set |
| `--dry-run` | shows the harness, the runs, the models, the prompts and what it would do; spends nothing, calls no account |

Output: `distills/<label>/` holding `harness.json`, `skills/` (contracts/skill-set.md) and, for `nams-reviewed`, its own working files
(`workspace.json`, `candidate/`, `rounds/`) as the loop folder had them. Exit codes: 0 done, 130 cancelled, 1 refused or failed (a refusal prints
its fixed code). `NAMS_API_KEY` is read from the environment only, and `NAMS_WORKSPACE_ID` is never used.

`scripts/critic-loop.ts` is removed.
