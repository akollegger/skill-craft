# Survey 1: how each model searched for `glirol` (forge-7)

Date: 2026-10-13. Branch `survey/fireworks-models`. Runs: `runs/s1-*` (seven models, five trials each, 35 runs), world `worlds/generated/forge-7.json`,
goal `glirol` (best run: 1 craft, 3 calls). Settings: 80 turns, 16384 output tokens, $1 cap per run, temperature 0.6 on Fireworks models,
adaptive thinking at medium effort on `claude-fable-5-1`. Costs are OpenRouter market quotes, not any host's rate.

Classified by `spikes/survey/classify-search.ts` from `run.jsonl` (the calls) and `score.json` (the ending) only, so no model text was read for the table.
Reproduce with `pnpm dev spikes/survey/classify-search.ts runs/s1-*`.

## Outcomes

| Model | Reached `glirol` | Cost per run (USD) |
|---|---|---|
| `kimi-k3` | 5/5 | 0.11 to 0.38 |
| `minimax-m3` | 5/5 | 0.003 to 0.037 |
| `glm-5p3-flash` | 5/5 | 0.001 to 0.011 |
| `deepseek-v4p1-flash` | 3/5 | 0.003 to 0.029 |
| `ember-1` | 3/5 | 0.24 to 1.03 (two runs stopped at the $1 cap) |
| `claude-fable-5-1` | 3/5 | 0.05 to 0.68 |
| `nemotron-3-ultra-nvfp4` | 0/5 | about 0.14 |

## Finding: the winning move is one specific pair, and every miss skipped it

The recipe for `glirol` is two `lugli` side by side. The survey has four base items (`doudrur`, `lugli`, `tepitil`, `thegen`).

| | tried two `lugli` | never tried two `lugli` |
|---|---|---|
| reached `glirol` | 24 | 0 |
| missed `glirol` | 0 | 11 |

- Every one of the 11 misses tried fewer than all four same-item pairs and none tried `lugli`: some tried pairs of other base items (`doudrur`, `tepitil`, `thegen`), some tried none.
- The misses spent their turns on three-or-more-cell shapes and on chains built from the intermediates that single-item crafts produce (single `doudrur` and single `lugli` each craft into something). Fable's two misses (001, 004) and the nemotron runs are examples.
- So `glirol` measures the order of a search over a small space, not reasoning about it. Fable's successes finished in 9 calls (two runs) and its misses ran 73 to 78; the pattern is the same across models.
- "Pairs of same base item first" is a cheap, checkable rule: it should turn each miss in this survey into a hit within about 10 calls (untested). That makes `glirol` a clean target for a distilled skill, and a model that already finds it (`glm-5p3-flash`, `minimax-m3`, `kimi-k3`) has no gap to close.

Caveats: five trials per model; a "pair probe" is a settled two-cell arrangement of one base item, so a pair that was placed and then replaced before clearing or crafting is not counted; Fable's reasoning is mostly empty under adaptive thinking, so intent is inferred from the calls.

## Per-run table

Base items placed before a first craft, across these runs: doudrur, lugli, tepitil, thegen (4).

| model | run | reached | ended | calls | base items tried as a pair | first pair probe (call) | first 3+ cell arrangement (call) | 3+ before pair | distinct arrangements | crafts (single-item) |
|---|---|---|---|---|---|---|---|---|---|---|
| s1-deepseek-v4p1-flash | 001 | no | budget | 81 | 3/4: doudrur, tepitil, thegen | 26 | 31 | no | 18 | 3 (2) |
| s1-deepseek-v4p1-flash | 002 | yes | stopped | 29 | 2/4: doudrur, lugli | 16 | - | no | 9 | 1 (0) |
| s1-deepseek-v4p1-flash | 003 | yes | stopped | 21 | 2/4: doudrur, lugli | 17 | - | no | 7 | 1 (0) |
| s1-deepseek-v4p1-flash | 004 | no | error | 75 | 2/4: tepitil, thegen | 22 | 61 | no | 16 | 2 (2) |
| s1-deepseek-v4p1-flash | 005 | yes | stopped | 29 | 2/4: doudrur, lugli | 16 | - | no | 9 | 1 (0) |
| s1-ember-1 | 001 | yes | stopped | 34 | 2/4: doudrur, lugli | 30 | - | no | 5 | 1 (0) |
| s1-ember-1 | 002 | no | budget | 104 | 1/4: tepitil | 44 | 50 | no | 23 | 3 (2) |
| s1-ember-1 | 003 | yes | stopped | 49 | 2/4: doudrur, lugli | 45 | - | no | 8 | 3 (2) |
| s1-ember-1 | 004 | no | budget | 63 | 0/4: - | - | 13 | yes | 13 | 3 (2) |
| s1-ember-1 | 005 | yes | stopped | 28 | 1/4: lugli | 27 | 24 | yes | 4 | 1 (0) |
| s1-fable-5-1 | 001 | no | stopped | 78 | 0/4: - | - | 13 | yes | 14 | 3 (2) |
| s1-fable-5-1 | 002 | yes | stopped | 9 | 1/4: lugli | 9 | 6 | yes | 2 | 1 (0) |
| s1-fable-5-1 | 003 | yes | stopped | 74 | 1/4: lugli | 74 | 13 | yes | 10 | 4 (2) |
| s1-fable-5-1 | 004 | no | stopped | 73 | 0/4: - | - | 41 | yes | 7 | 3 (2) |
| s1-fable-5-1 | 005 | yes | stopped | 9 | 1/4: lugli | 9 | 6 | yes | 2 | 1 (0) |
| s1-glm-5p3-flash | 001 | yes | stopped | 14 | 1/4: lugli | 13 | - | no | 2 | 1 (0) |
| s1-glm-5p3-flash | 002 | yes | stopped | 39 | 1/4: lugli | 38 | - | no | 2 | 1 (0) |
| s1-glm-5p3-flash | 003 | yes | stopped | 63 | 1/4: lugli | 62 | - | no | 2 | 1 (0) |
| s1-glm-5p3-flash | 004 | yes | stopped | 39 | 1/4: lugli | 38 | 31 | yes | 2 | 1 (0) |
| s1-glm-5p3-flash | 005 | yes | stopped | 42 | 1/4: lugli | 41 | 34 | yes | 3 | 1 (0) |
| s1-kimi-k3 | 001 | yes | stopped | 41 | 1/4: lugli | 40 | 14 | yes | 6 | 1 (0) |
| s1-kimi-k3 | 002 | yes | stopped | 35 | 2/4: doudrur, lugli | 31 | - | no | 5 | 1 (0) |
| s1-kimi-k3 | 003 | yes | stopped | 33 | 2/4: doudrur, lugli | 29 | - | no | 6 | 1 (0) |
| s1-kimi-k3 | 004 | yes | stopped | 66 | 3/4: doudrur, lugli, tepitil | 45 | 14 | yes | 12 | 3 (2) |
| s1-kimi-k3 | 005 | yes | stopped | 87 | 3/4: doudrur, lugli, tepitil | 16 | 53 | no | 21 | 3 (2) |
| s1-minimax-m3 | 001 | yes | stopped | 32 | 1/4: lugli | 31 | 21 | yes | 8 | 1 (0) |
| s1-minimax-m3 | 002 | yes | stopped | 30 | 2/4: doudrur, lugli | 21 | 18 | yes | 5 | 1 (0) |
| s1-minimax-m3 | 003 | yes | stopped | 29 | 1/4: lugli | 28 | 13 | yes | 5 | 1 (0) |
| s1-minimax-m3 | 004 | yes | stopped | 86 | 2/4: doudrur, lugli | 82 | 8 | yes | 23 | 3 (2) |
| s1-minimax-m3 | 005 | yes | stopped | 15 | 1/4: lugli | 14 | - | no | 1 | 1 (0) |
| s1-nemotron-3-ultra-nvfp4 | 001 | no | budget | 80 | 0/4: - | - | 24 | yes | 13 | 2 (2) |
| s1-nemotron-3-ultra-nvfp4 | 002 | no | budget | 80 | 0/4: - | - | 20 | yes | 12 | 2 (2) |
| s1-nemotron-3-ultra-nvfp4 | 003 | no | budget | 80 | 1/4: doudrur | 12 | 21 | no | 15 | 3 (2) |
| s1-nemotron-3-ultra-nvfp4 | 004 | no | budget | 80 | 0/4: - | - | 21 | yes | 11 | 2 (2) |
| s1-nemotron-3-ultra-nvfp4 | 005 | no | budget | 80 | 1/4: doudrur | 14 | 21 | no | 12 | 2 (2) |

- 0 of 4 base items tried as a pair: 0/6 reached
- 1 of 4 base items tried as a pair: 13/16 reached
- 2 of 4 base items tried as a pair: 9/10 reached
- 3 of 4 base items tried as a pair: 2/3 reached
- 4 of 4 base items tried as a pair: 0/0 reached
- A 3+ cell arrangement before any pair probe: 12/18 reached
