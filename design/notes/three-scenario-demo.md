# Three-scenario demo: results

Status: complete for the stages that ran, 2026-10-04. Branch `spike/woodworking-world`. Plan:
[woodworking-spike.md](woodworking-spike.md). Protocol background: [ADR-003](../adr/ADR-003-experiment-protocol.md).
Teacher Sonnet (`claude-sonnet-5-5`), student Haiku (`claude-haiku-4-5-20251001`), 80-turn budget, 5 trials per
cell, no run recorded by the hooks.

**In one paragraph.** A skill built from Sonnet's successful runs lifted whichever model had room to improve.
Sonnet reached `glirol` in 2 of 5 unaided trials and in 5 of 5 with the skill, at 4 calls each. Haiku reached the
wooden stool in 1 of 5 unaided trials and in 4 of 5 with the skill. On the pickaxe, which both models already
solved, the skill removed Haiku's wandering (+9 to +52 extra calls down to none). At 5 trials per cell the reach
differences are suggestive but not supported by the report's rule (the intervals overlap). The skills were not
distilled by NAMS: its extraction stalled on the larger recordings (below), so subagents authored them from
replayed transcripts and the critic loop reviewed them.

## The scenarios

| # | World | Prior fit | Goal | Best run |
|---|---|---|---|---|
| 1 | `worlds/minecraft-inspired.json` | faithful | `wooden_pickaxe` | 13 calls, 4 crafts |
| 2 | `worlds/generated/forge-7.json` | invented | `glirol` | 3 calls, 1 craft |
| 3 | `worlds/woodworking.json` (new) | perturbed | `wooden_stool` | 19 calls, 6 crafts |

Scenario 3 is a hand-authored world: log, plank, rod and seat, stool. A log makes 4 planks, a column of two planks
makes 2 rods (the deviation from the game it resembles), a row of three planks makes a seat, and a seat centred over
a bottom row of three rods makes the stool. Tests and the solver confirm the best run.

## Results

Stage A (unaided, labels `b-*`) and stage C (with the critic-accepted skill, labels `g-*`). "Extra calls" is over the
best run, for runs that reached the goal.

| Scenario | Model | Arm | Reached | 95% interval | Extra calls (min / median / max) | Cost | Skill loaded |
|---|---|---|---|---|---|---|---|
| 1. wooden_pickaxe (faithful) | sonnet | unaided | 5/5 | [0.57, 1.00] | 0 / 0 / 0 | $0.17 | - |
| 1. wooden_pickaxe (faithful) | sonnet | skill | 5/5 | [0.57, 1.00] | 0 / 0 / 0 | $0.19 | 1/5 |
| 1. wooden_pickaxe (faithful) | haiku | unaided | 5/5 | [0.57, 1.00] | 9 / 20 / 52 | $0.55 | - |
| 1. wooden_pickaxe (faithful) | haiku | skill | 5/5 | [0.57, 1.00] | 0 / 0 / 0 | $0.24 | 5/5 |
| 2. glirol (invented) | sonnet | unaided | 2/5 | [0.12, 0.77] | 96 / 136 / 176 | $1.85 | - |
| 2. glirol (invented) | sonnet | skill | 5/5 | [0.57, 1.00] | 1 / 1 / 1 | $0.10 | 5/5 |
| 2. glirol (invented) | haiku | unaided | 5/5 | [0.57, 1.00] | 5 / 22 / 29 | $0.31 | - |
| 2. glirol (invented) | haiku | skill | 5/5 | [0.57, 1.00] | 0 / 2 / 26 | $0.21 | 1/5 |
| 3. wooden_stool (perturbed) | sonnet | unaided | 5/5 | [0.57, 1.00] | 36 / 49 / 64 | $0.93 | - |
| 3. wooden_stool (perturbed) | sonnet | skill | 5/5 | [0.57, 1.00] | 0 / 0 / 0 | $0.24 | 5/5 |
| 3. wooden_stool (perturbed) | haiku | unaided | 1/5 | [0.04, 0.62] | 82 / 82 / 82 | $1.16 | - |
| 3. wooden_stool (perturbed) | haiku | skill | 4/5 | [0.38, 0.96] | 0 / 11.5 / 67 | $0.60 | 4/5 |

Skill against unaided, reach (a difference is supported only when the two intervals do not overlap):

- 1. wooden_pickaxe (faithful), sonnet: unaided 5/5, skill 5/5: within noise
- 1. wooden_pickaxe (faithful), haiku: unaided 5/5, skill 5/5: within noise
- 2. glirol (invented), sonnet: unaided 2/5, skill 5/5: within noise
- 2. glirol (invented), haiku: unaided 5/5, skill 5/5: within noise
- 3. wooden_stool (perturbed), sonnet: unaided 5/5, skill 5/5: within noise
- 3. wooden_stool (perturbed), haiku: unaided 1/5, skill 4/5: within noise

Cost of the whole demo: stage A about $5.0, the critic loops about $0.6, stage C about $1.6.

## What the runs show

- **Sonnet's trouble on `glirol` was strategy, not knowledge.** The goal is two `lugli` placed together. Haiku made exactly one craft, the goal, in every unaided run, after
  placing a doubled `lugli` (in run 004 it previewed each raw item alone first, then two `lugli`). Sonnet, within about
  20 calls in every run, crafted the first thing a preview offered (`glavruzael` from `doudrur`, `naeviozhum`
  from a single `lugli`), then built on those. In 3 of 5 runs it never placed two `lugli` alone. A skill that names
  the recipe and the dead-end crafts removed the failure.
- **For Haiku, loading the skill decides the outcome.** On the stool, the two runs that loaded the skill within 2 calls
  hit the best run exactly. The runs that loaded it after 29 and 91 calls took 42 and 86 calls, and the one that never
  loaded it failed. On `glirol` Haiku loaded it in only 1 of 5 runs and was already near the best run. On the pickaxe it
  loaded it in 5 of 5 and made the best run every time.
- **No harm showed where there was no room.** Sonnet on the pickaxe loaded the skill in 1 of 5 runs and was unchanged.
- **Cost follows calls.** Sonnet's stool dropped from $0.93 to $0.24 for five runs, and `glirol` from $1.85 to $0.10.
- **The turn budget does not bound calls.** Sonnet issues several tool calls per model request, so `maxTurns` counts
  requests: runs of 160 and 180 calls ended inside an 80-turn budget. Per-call figures are comparable between arms of one
  model, less so between models.

## How the skills were made

1. **NAMS distillation (the plan).** `scripts/critic-loop.ts --allow-workspace` records the teacher runs to a throwaway
   workspace, asks NAMS to generate a skill, downloads it, deletes the workspace and runs the critic and reviser.
   Scenario 1 worked (3 runs of 13 calls; extraction took about 5.5 minutes; the critic revised once and then
   accepted; `loops/c-mc`). Scenarios 2 and 3 failed five times in all (labels `c-forge`, `c-wood`, `d-forge`,
   `d-wood`, `e-wood`) with `extraction did not finish in time`. In the last, with a 30-minute wait, a poller read
   `extraction-status` every 3 minutes: every message stayed `pending` with `attempts: 0` and no error, from the
   first reading to the deadline. So extraction was never started; more time would not have helped. The API has no
   call to start or retry it. Each failed loop deleted its own workspace. The recordings that failed were larger than
   the one that worked (roughly 190 and 280 calls against 39), but this spike did not establish that size is the cause.
2. **Run-derived authoring (what was used).** For each scenario a fresh subagent (Sonnet) was given only replayed
   transcripts of the teacher's successful runs (the prompt, every call and what came back; no world file) and told to
   write the skill and a provenance file citing run and call numbers. The critic loop then reviewed each with
   `--candidate` (labels `f-mc`, `f-forge`, `f-wood`): scenarios 2 and 3 were accepted in round 1, scenario 1
   in round 2. Inputs: scenario 1, Sonnet runs 001 to 003; scenario 2, the two that reached (003, 005); scenario 3,
   the three with the fewest extra calls (001, 003, 004). The skills are in `spikes/woodworking/skills/`.

Blindness to the world files was by instruction, not by a technical block; the critic's citation check is the
independent test that each claim is in the runs.

## Caveats

- **Small samples.** Five trials per cell give wide intervals. By the report's rule (a difference is supported only
  when the 95% intervals do not overlap) none of the reach differences is supported. The call, cost and loading
  figures are descriptive.
- **Same goal in training and test.** Each skill was built from Sonnet's runs on a goal and then tested on that
  same goal in the same world, and it states the recipe, as a skill from a successful run should. This shows that
  experience from a past run speeds up a repeat of the same task. It does not show that a skill helps with a different
  goal or a changed version of the task. If the claim is to be about generalisation, the next step is a held-out
  goal (ADR-003), such as `vriobeno` after learning from `glirol`.
- **Not NAMS-distilled.** Only the scenario-1 NAMS skill exists, and it was not played as an arm. The comparison of
  NAMS-distilled against run-derived skills is open. The oracle arm (a skill written from the world files, an upper
  bound) was left out on purpose.
- **A leftover.** `runs/a-*` holds the 30 failed-authentication attempts from the first Stage A try. They are
  gitignored and measured nothing.

## Open items

- Why NAMS stopped extracting the larger recordings, and whether a smaller recording (one run) extracts.
- A `--prompt-note` arm that points Haiku at the skill, since loading is what decides its outcome.
- Larger `n` on the two cells that look like effects (Haiku's stool, Sonnet's `glirol`).
- A held-out goal in the woodworking world, for transfer.
