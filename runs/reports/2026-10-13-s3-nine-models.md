# Survey 3: nine models on `glirol` and woodworking

Date: 2026-10-13. Branch `survey/fireworks-models`. Combines [survey 1](2026-10-13-s1-glirol-search-strategy.md) (`glirol`, `worlds/generated/forge-7.json`) and
[survey 2](2026-10-13-s2-woodworking-stages.md) (`wooden_stool`, `worlds/woodworking.json`) and adds `claude-sonnet-5-5` and `claude-haiku-5-5` on both tasks
(`runs/s1-*`, `runs/s2-*`). Five trials per model and task, except three for `ember-1` and `claude-fable-5-1` on woodworking. 80 turns, 16384 output tokens,
$2 cap per run (the first Fireworks and Fable `glirol` runs used $1), temperature 0.6 on Fireworks models, adaptive thinking at medium effort on Fable and Sonnet,
Haiku 5.5 unpinned. Costs are OpenRouter market quotes, not any host's rate. Classified from `run.jsonl` and `score.json` only
(`spikes/survey/classify-search.ts` and `spikes/survey/craft-stages.ts`).

## Results

| Model | `glirol` (forge-7) | `wooden_stool` | Cost per run, glirol / stool (USD) | Cost per success, glirol / stool (USD) | Misses that ended by choice, not the turn limit |
|---|---|---|---|---|---|
| `claude-fable-5-1` | 3/5 | 3/3 | 0.413 / 0.288 | 0.688 / 0.288 | 2 of 2 |
| `claude-sonnet-5-5` | 1/5 | 5/5 | 0.165 / 0.160 | 0.823 / 0.160 | 4 of 4 |
| `claude-haiku-5-5` | 4/5 | 0/5 | 0.006 / 0.012 | 0.008 / none | 6 of 6 |
| `kimi-k3` | 5/5 | 3/5 | 0.229 / 0.348 | 0.229 / 0.580 | 0 of 2 |
| `glm-5p3-flash` | 5/5 | 4/5 | 0.006 / 0.018 | 0.006 / 0.023 | 0 of 1 |
| `deepseek-v4p1-flash` | 3/5 | 4/5 | 0.013 / 0.017 | 0.022 / 0.021 | 0 of 3 |
| `minimax-m3` | 5/5 | 0/5 | 0.014 / 0.072 | 0.014 / none | 0 of 5 |
| `ember-1` | 3/5 | 1/3 | 0.615 / 0.962 | 1.026 / 2.887 | 0 of 4 |
| `nemotron-3-ultra-nvfp4` | 0/5 | 0/5 | 0.139 / 0.133 | none / none | 0 of 10 |

Per-run tables and stage sequences are in the two earlier reports and regenerate with the two scripts above.

## What each task measures

- **`glirol`:** order of search. All 24 earlier hits and every newly added hit tried two `lugli` side by side; no miss did (the pair-probe table below extends survey 1 to Haiku and Sonnet:
  0 of 10 runs that tried no same-item pair reached the goal, against 29 of 35 that tried at least one).
- **Woodworking:** a five-craft chain with a shaped last step. All nine models find the plank, rod and seat. Of 21 misses, 12 held every part and never found the stool's shape
  (a seat over a row of three rods, empty cells either side), and 9 never completed the parts (`nemotron-3-ultra-nvfp4` and `minimax-m3` rarely found the rod, a vertical pair of planks).
  Fable and Sonnet made no wasted crafts.

## Finding: the Claude models stop on their own, counting calls as turns

- The prompt gives "a budget of 80 turns". The harness counts a turn as one model step; Claude models issue about 2.4 to 2.6 tool calls per step (Fable 1.0, the Fireworks models 1.0 to 1.6).
- Every miss by Sonnet (4), Haiku (6) and Fable (2) ended `stopped` after 70 to 110 calls with 30 to 60 steps unused; their final messages describe the budget as nearly used. No Fireworks miss ended that way: all hit the step limit or errored.
- So the Claude models' misses are shortened by their own reading of "turns", and their results are not like-for-like with models that used all 80 steps. This is a prompt ambiguity, and the base prompt is a standing open decision
  (every arm of an experiment must share it), so it is recorded here, not changed.

## Reading the table

- **Reliable on both tasks:** none. `glm-5p3-flash` (5/5 and 4/5) comes closest and is among the cheapest (about $0.006 and $0.018 a run). `deepseek-v4p1-flash` is 3/5 and 4/5 at about a cent and a half.
- **Frontier tier:** Fable is the only model that is quick and tidy on woodworking (3/3, 30 to 44 steps, no waste) but it is 3/5 on `glirol` and costs $0.29 to $0.41 a run. Sonnet 5.5 is 5/5 on woodworking and 1/5 on `glirol` at about $0.16 a run. `kimi-k3` is 5/5 and 3/5 at $0.23 to $0.35.
- **Weak tier, with a gap a skill could close:** `claude-haiku-5-5` (4/5 on `glirol`, 0/5 on woodworking, about a cent a run) and `nemotron-3-ultra-nvfp4` (0/5 on both). `minimax-m3` (5/5 and 0/5) is another.
- **Not worth its price:** `ember-1` at $0.62 to $0.96 a run and $1.03 to $2.89 per success, with its misses driven by uncached input.

## Caveats

Five trials per cell, so a single run moves a rate by 20 points; one world per task; Haiku 5.5 ran unpinned; temperature was pinned only on Fireworks models; the turn ambiguity above affects the Claude models' misses.
