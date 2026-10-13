# Survey 2: where seven models stalled on woodworking (`wooden_stool`)

Date: 2026-10-13. Branch `survey/fireworks-models`. Runs: `runs/s2-*` (35 runs: 5 trials each, 3 for `ember-1` and `claude-fable-5-1`), world `worlds/woodworking.json`
(perturbed; 4 recipes; stock of 3 logs; best run 6 crafts, 19 calls), goal `wooden_stool`. Same settings as survey 1, $2 cap per run.
Classified from `run.jsonl` only (the order of successful crafts and the calls after the last one); no model text read.

## Outcomes

| Model | Reached | Cost, all runs (USD) |
|---|---|---|
| `claude-fable-5-1` | 3/3 (30 to 44 calls) | 0.86 |
| `deepseek-v4p1-flash` | 4/5 | 0.09 |
| `glm-5p3-flash` | 4/5 | 0.09 |
| `kimi-k3` | 3/5 | 1.74 |
| `ember-1` | 1/3 | 2.89 |
| `minimax-m3` | 0/5 | 0.36 |
| `nemotron-3-ultra-nvfp4` | 0/5 | 0.67 |

(An earlier summary table counted `glm-5p3-flash` as 3/5 by ending; by the score's `reached` flag it is 4/5.)

## Finding 1: every model discovers the parts; the stool's shape is the main stall

The chain is plank (1 log), rod (two planks vertical, 2 rods), seat (three planks in a row), stool (seat over a row of three rods; a 5th craft needs two rod crafts for three rods).

- **9 of 16 misses held the seat and four rods (two rod crafts) and still did not make the stool**, spending 24 to 94 calls after their last craft:
  `deepseek` 002, `ember-1` 002 and 003, `glm-5p3-flash` 001, `kimi-k3` 003 and 004, `minimax-m3` 001, 004 and 005.
  The final shape, with empty cells either side of the seat, is the step they fail to find.
- **7 of 16 misses never completed the parts**: `nemotron` found the seat but not the rod (a vertical pair) in four of five runs, and `minimax-m3` 002 and 003 made only one rod craft.
- Fable made no wasted crafts and finished in 30 to 44 calls (5 or 6 crafts); the others that succeeded needed 51 to 133 calls.

## Finding 2: `ember-1`'s failures are expensive because of uncached input

| Run | Result | Uncached input tokens | Cache-read tokens | Output tokens | Cost |
|---|---|---|---|---|---|
| `ember-1` 002 | miss | 381,855 | 360,882 | 8,072 | $1.37 |
| `ember-1` 003 | miss | 213,038 | 551,387 | 8,252 | $0.93 |
| `kimi-k3` 003 | miss | 20,377 | 789,228 | 10,173 | $0.55 |

Same 80 turns, similar output; `ember-1` is billed at $3 per million for input and has far more input uncached, so a stalled run costs two to three times a comparable `kimi-k3` miss.
Whether that is the provider's caching or something about this model's prompt prefix is not known.

## Caveats

Three trials for `ember-1` and Fable; the "held all the parts" test counts successful crafts only, so a model that crafted the parts and then spent them is counted as incomplete.
