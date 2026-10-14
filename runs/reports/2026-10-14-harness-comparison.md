# Harness comparison on wooden_stool (spec 009, story 6)

Date: 2026-10-14. World `worlds/woodworking.json` (perturbed), goal `wooden_stool`, base prompt version 2, call budget 100.
Recordings: Fable's three runs `runs/s2-fable-5-1/001` to `003` (all reached the goal; 29, 43 and 36 calls; best run 19).
Students: `claude-haiku-5-5` and `nemotron-3-ultra-nvfp4`, five trials per cell. Costs are provider reports or OpenRouter market quotes.

## Distillation

| Harness | Generations | Skills produced | Distillation cost |
|---|---|---|---|
| `bespoke-one-shot` (`fireworks/glm-5p3-flash`, distiller prompt v1) | 3 | 3 of 3 | $0.009, $0.017, $0.015 |
| `nams-reviewed` (critic and reviser `fireworks/glm-5p3-flash`) | 3 | **0 of 3** | n/a |

All three `nams-reviewed` attempts recorded the runs, then failed with `CandidateFailed: no candidate skill: extraction did not finish in time`
(the memory service's extraction did not complete); each deleted its workspace. The record is in `distills/cmp-nams-reviewed-{1,2,3}/harness.json`.
A fourth attempt (`cmp-nams-reviewed-r2-1`) failed the same way after waiting 15 minutes for extraction. An offline comparison of the recording
payloads the old pipeline and the harness send for the same run found them identical except `durationMs` on the tool calls (measured before, 0 now),
so the harness change is an unlikely cause; the failure is most likely on the service side, which has no uptime guarantee. It was not debugged further.
**There is no NAMS arm in this comparison.**

## Student results (reached / 5)

| Skill | Haiku | Haiku median calls, cost | Nemotron | Nemotron median calls, cost |
|---|---|---|---|---|
| none (`runs/s2-*`, earlier base prompt) | 0/5 | n/a, $0.060 | 0/5 | n/a, $0.665 |
| bespoke 1 (4.6 KB) | 5/5 | 21, $0.013 | 5/5 | 24, $0.198 |
| bespoke 2 (5.8 KB) | 5/5 | 20, $0.011 | 5/5 | 34, $0.412 |
| bespoke 3 (6.8 KB) | 5/5 | 21, $0.012 | 5/5 | 22, $0.178 |

Mean extra calls over the best run (19): Haiku 2.2, 1.0, 1.6; Nemotron 6.2, 25.2, 2.4.

## What it shows

- A bare model call (one tool-less request, under two cents) over three recordings produced skills that took both students from 0/5 to 5/5 in all three generations. The skill is a recipe card with run and call citations, plus a dead-ends reference.
- The skills differ in length and in how much they help the weaker student: Nemotron's cost per five runs varied from $0.18 to $0.41 across generations, so generation-to-generation variance is real even from identical recordings.

## What it does not show

- Nothing about NAMS versus bespoke: the NAMS arm failed. The question the comparison was built for is open.
- The baselines were run under the earlier base prompt (version 1, 80-step budget), not the version 2 prompt used here, so the 0/5 is not a like-for-like control. A fresh unaided baseline under version 2 would be needed to size the effect.
- Three generations and five trials per cell; one world and goal; one distiller model.
