# Prompt version 2 against version 1: three models, two tasks

Date: 2026-10-13. Branch `008-versioned-base-prompt` (spec 008, ADR-007). Runs: `runs/p2-*` (version 2, a budget of 100 tool calls) beside `runs/s1-*`
and `runs/s2-*` (version 1, a budget of 80 steps, surveys 1 and 2). Worlds `worlds/generated/forge-7.json` (goal `glirol`) and `worlds/woodworking.json`
(goal `wooden_stool`). Five trials per cell, temperature 0.6 on the Fireworks models, adaptive thinking at medium effort on Fable, 16384 output
tokens, $2 cap per run. Costs are OpenRouter market quotes. Version 2's cost: $7.24 for 30 runs ($5.26 of it Fable).

The only differences between the two columns are the prompt (version 2: neutral wording, no "unfamiliar", "use only the craft tools" or "explore", and a
budget in tool calls stated as including several made at once) and the budget (100 calls against 80 steps).

## Results

| Model | Task | Version 1 reached | Version 2 reached | Cost per run, v1 / v2 (USD) | Exact p (two-sided) |
|---|---|---|---|---|---|
| `nemotron-3-ultra-nvfp4` | `glirol` | 0/5 | 0/5 | 0.139 / 0.192 | 1.00 |
| `nemotron-3-ultra-nvfp4` | `wooden_stool` | 0/5 | 0/5 | 0.133 / 0.189 | 1.00 |
| `glm-5p3-flash` | `glirol` | 5/5 | 4/5 | 0.006 / 0.004 | 1.00 |
| `glm-5p3-flash` | `wooden_stool` | 4/5 | 4/5 | 0.018 / 0.012 | 1.00 |
| `claude-fable-5-1` | `glirol` | 3/5 | 1/5 | 0.413 / 0.777 | 0.52 |
| `claude-fable-5-1` | `wooden_stool` | 3/3 | 5/5 | 0.288 / 0.273 | 1.00 |

## Findings

- **Version 2 moved no baseline beyond noise.** Every difference is within what five trials can show (the smallest p is 0.52, Fable on `glirol`). The wording
  change and the budget change together did not rescue Nemotron (0/5 on both tasks, all ten runs used all 100 calls), and did not hurt `glm-5p3-flash` (4/5 on both).
  The earlier faithful-world shift from 0/5 to 4/5 under a reworded prompt was not reproduced here, consistent with it having come from Claude Code's added context.
- **The early stopping is gone.** Under version 1 every miss by Fable ended with the model stopping on its own after 73 to 78 calls and 30 to 60 steps unused.
  Under version 2 Fable's four misses on `glirol` used 91 to 98 of the 100 calls (97, 91, 98, 97), meeting SC-006's 90% threshold: the call budget is something
  the model can count, and it spent it. They still ended by choice (`stopped`) at the edge of the budget, not by the harness.
- **More search did not help Fable on `glirol`.** It reached the goal 1 of 5 times with nearly the whole budget used in the other four, at about twice the cost per run
  ($0.78 against $0.41). That fits survey 1: `glirol` is decided by whether the search tries two `lugli` side by side, not by the amount of search.
- **The call budget's rule fires for `glm-5p3-flash`.** ADR-007 raises the budget if more than 1 in 10 unaided runs of a tier that otherwise reaches the goal end at it.
  Two of its ten runs ended at the budget (one per task, at 100 calls) while the other eight reached the goal in 11 to 94 calls. Whether 150 calls would turn them into
  reaches is untested; Nemotron is excluded from the rule because it reaches neither goal.
- **Enforcement works as designed.** One `glm-5p3-flash` run crossed the budget in the middle of a response: two calls were refused with the fixed line, absent from the run log
  and counted in `budgetRefused`.

## Decision

Version 2 is adopted as the base prompt for the next experiments, with the call budget as a declared parameter: it states a budget the agent can count, removes
the early stopping that made the Claude models' results not comparable with the others, and moves no baseline measurably. Version 1 results stay valid as step-budget runs
and are labelled so. The starting budget of 100 calls should be raised (to 150) before experiments on a tier like `glm-5p3-flash` that is close to the edge.

## Caveats

Five trials per cell, so a single run moves a rate by 20 points and none of the differences above is established; one world per task; the three tiers only; the two prompt
changes (wording and budget meaning) are not separated, so this cannot say which of them, if either, matters.
