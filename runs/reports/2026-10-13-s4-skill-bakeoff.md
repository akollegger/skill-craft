# Survey 4: skill bake-off on woodworking, and the nominated models

Date: 2026-10-13. Branch `survey/fireworks-models`. Builds on [survey 3](2026-10-13-s3-nine-models.md). Runs: `runs/s4-skill-*`
(`claude-haiku-5-5` and `nemotron-3-ultra-nvfp4`, 5 trials each, `wooden_stool` in `worlds/woodworking.json`, 80 turns, $2 cap per run, temperature 0.6 on Nemotron,
Haiku unpinned). Their unaided baselines are survey 2 and 3's `runs/s2-*`, 0/5 each. Costs are OpenRouter market quotes, not any host's rate.

## How the skill was made

| Role | Model | Detail |
|---|---|---|
| Teacher | `claude-fable-5-1` | Its three woodworking successes (`runs/s2-fable-5-1/001` to `003`), 30 to 44 steps, no wasted crafts |
| Distiller | NAMS 1.3.0 (production, commit `27263eb`) | Managed workspace created, the three runs recorded, skill generated and downloaded, workspace deleted |
| Critic and reviser | `glm-5p3-flash`, temperature 0.6 | Round 1: critic asked for a revision, reviser revised; round 2: critic accepted |
| Spend | $0.056 for the three review stages | 45k input and 46k output tokens, all stages priced |

The accepted skill (`loops/wood-fable-glm/skill/`, sha256 `6686997c4a62`, not copied here because `loops/` is the home of model-authored text) is a short recipe card:
the chain from logs to planks, seat and rods, the stool's final layout, the log budget from a stock of three, and layouts that returned nothing. The recordings carried no
solver output or score. The loop record is `loops/wood-fable-glm/loop.json`.

## Results

| Model | Unaided | With the skill | Steps, with skill (unaided) | Crafts per run, with skill (unaided) | Cost per run, with skill (unaided) |
|---|---|---|---|---|---|
| `claude-haiku-5-5` | 0/5 | **5/5** | 12 to 16 (30 to 42) | 6 (3 to 7) | $0.002 ($0.012) |
| `nemotron-3-ultra-nvfp4` | 0/5 | **5/5** | 26 to 42 (all 80) | 6 or 7 (3 to 4) | $0.040 ($0.133) |

- **The skill was loaded in every run (10 of 10)**, once, early: at step 2 for Haiku and step 3 for Nemotron. Earlier skill-loading runs saw it loaded about one time in three.
- Both models turned a 0/5 into a 5/5 and cut spend per run by 5 to 3 times. The best run is 6 crafts; every Haiku run made exactly that.
- Nemotron followed the card more slowly (26 to 42 steps against Haiku's 12 to 16), and one of its runs made a seventh craft.

## Caveats

- The skill is a full recipe card with exact coordinates and yields, so this tests whether a model **loads and follows** a skill, not whether it can transfer. It was tested on the goal it was distilled from, with no held-out goal.
- One skill, one distillation, one teacher, five trials per model.
- OpenRouter prices Haiku 5.5 with a tier above 100k prompt tokens (about five times the rate) which our cost code ignores; Haiku's recorded cost may be slightly low on long runs. Nemotron's quote is for the 550B model, while the runs used Fireworks's `nvfp4` build.
- The Claude models count tool calls as turns against the "80 turns" budget and stop early (survey 3); the skill removed that problem here, since these runs finished well inside it.

## Recommendation: the three tiers

| Tier | Model | Why |
|---|---|---|
| Weak | `nemotron-3-ultra-nvfp4` | The best candidate for showing improvement. It failed both tasks unaided (0/5 on `glirol`, 0/5 on woodworking, every run at the turn limit) and followed a skill to 5/5. A larger gap leaves more room to measure a skill's effect. |
| Strong | `glm-5p3-flash` | The best all-around performer: 5/5 on `glirol` and 4/5 on woodworking, at about $0.006 and $0.018 a run. It also ran the critic and reviser roles well enough to produce an accepted skill for $0.056 across the loop. |
| Frontier | `claude-fable-5-1` | For the hard stuff. 3/3 on woodworking in the fewest steps and with no wasted crafts, which also made it the teacher for the skill. Weaker on `glirol` (3/5), and the most expensive ($0.29 to $0.41 a run), so it is reserved for escalation. |

Each of the three can play any role (unaided, distiller, skill user); the cast schema already allows one model in several roles.

### Notes on the choices

- `claude-haiku-5-5` remains a strong cheap alternative for the weak tier: it reached 5/5 in 12 to 16 steps for about $0.002 a run. It was not nominated because its unaided gap is task-dependent (4/5 on `glirol`), so it shows less improvement than Nemotron does.
- `kimi-k3` (5/5 and 3/5, $0.23 to $0.35 a run) is the next candidate if a second strong or frontier model is wanted.
- Not recommended: `ember-1` ($0.62 to $0.96 a run, 3/5 and 1/3), `minimax-m3` (0/5 on woodworking), `claude-sonnet-5-5` (1/5 on `glirol`).

### Before expanding

1. Test transfer: a held-out goal, or a world where the skill's coordinates do not apply, since the bake-off only shows that the recipe is followed.
2. Try a skill from a different teacher (`glm-5p3-flash` itself) to see whether the skill's source matters.
3. Decide how to treat the Claude models' calls-as-turns behaviour before comparing across providers on a shared budget.
4. Pin Haiku's settings if it is used again, and handle OpenRouter's price tiers in the cost code if long Haiku runs matter.
