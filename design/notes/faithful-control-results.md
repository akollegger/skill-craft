# Faithful-world control: results

Status: complete for the stages that could run, 2026-10-01. Spec `specs/003-faithful-minecraft-world`, protocol
ADR-003. World `worlds/minecraft-inspired.json` (prior fit: faithful) and its renamed counterpart
`worlds/generated/minecraft-inspired-7.json` (invented). Teacher Sonnet (`claude-sonnet-5-5`), student Haiku
(`claude-haiku-4-5-20251001`), 80-turn budget, no run recorded by the hooks.

**In one paragraph.** Models do far better with familiar vocabulary and recipes than with invented ones:
Sonnet solved every faithful goal at the best run's call count (15 of 15) and went 0 of 15 on the invented
counterpart. Haiku's one real gap in the faithful world was the stone pickaxe (0 of 5). The escalating route
recorded Sonnet on that gap and asked NAMS to distil a skill from it. NAMS produced skills that pass its own
gates but contain no recipe, so the skill arms did not run. The skill-repair question for this world is open.

## What ran and what it cost

| Stage | Runs | Model | Cost |
|---|---|---|---|
| Calibration, both worlds (unaided, 5 trials per model and goal) | 60 | 30 Sonnet, 30 Haiku | $16.62 |
| Teacher runs on the gap goal (stone, escalating route) | 3 | Sonnet | $0.09 |
| Teacher runs on wooden (made before the roles were assigned; not used) | 3 | Sonnet | $0.10 |
| Skill generation (6 attempts) and review | - | NAMS, then a reader | - |
| Student arms S0, S1, S2 | 0 | - | not run |

Spend came to about $16.8 of the $60 limit.

## Calibration and roles

World prior fit: faithful. Rows are stamped with the prior fit recorded in each run.
Route: escalating; primary measure: repair. Both were declared after calibration, which this route needs: the gaps are found first.

| Arm | Model | Prior fit | Goal | Reached | 95% interval | Extra calls (min / median / max) | Cost | Tokens | Skill loaded | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| calibration | claude-haiku-4-5-20251001 | faithful | held-out iron_pickaxe | 5/5 | [0.57, 1.00] | 2 / 10 / 98 | $0.49 | 95232 in / 27778 out / 1193878 cache read / 70277 cache write | - | ceiling |
| calibration | claude-haiku-4-5-20251001 | faithful | gap stone_pickaxe | 0/5 | [0.00, 0.43] | - | $2.00 | 76047 in / 106835 out / 8952759 cache read / 246261 cache write | - |  |
| calibration | claude-haiku-4-5-20251001 | faithful | solved wooden_pickaxe | 4/5 | [0.38, 0.96] | 14 / 26 / 39 | $0.64 | 91165 in / 36657 out / 1899895 cache read / 86419 cache write | - |  |
| calibration | claude-haiku-4-5-20251001 | invented | held-out iron_pickaxe | 0/5 | [0.00, 0.43] | - | $1.37 | 128898 in / 65903 out / 5969085 cache read / 157085 cache write | - |  |
| calibration | claude-haiku-4-5-20251001 | invented | gap stone_pickaxe | 0/5 | [0.00, 0.43] | - | $1.54 | 115176 in / 76929 out / 6729257 cache read / 184698 cache write | - |  |
| calibration | claude-haiku-4-5-20251001 | invented | solved wooden_pickaxe | 0/5 | [0.00, 0.43] | - | $1.24 | 127886 in / 57203 out / 5468442 cache read / 137180 cache write | - |  |
| calibration | claude-sonnet-5-5 | faithful | held-out iron_pickaxe | 5/5 | [0.57, 1.00] | 0 / 0 / 0 | $0.15 | 80 in / 5115 out / 118193 cache read / 19290 cache write | - | ceiling |
| calibration | claude-sonnet-5-5 | faithful | gap stone_pickaxe | 5/5 | [0.57, 1.00] | 0 / 0 / 0 | $0.15 | 80 in / 4964 out / 116725 cache read / 18861 cache write | - | ceiling |
| calibration | claude-sonnet-5-5 | faithful | solved wooden_pickaxe | 5/5 | [0.57, 1.00] | 0 / 0 / 0 | $0.18 | 94 in / 5774 out / 146220 cache read / 22098 cache write | - | ceiling |
| calibration | claude-sonnet-5-5 | invented | held-out iron_pickaxe | 0/5 | [0.00, 0.43] | - | $2.56 | 566 in / 78650 out / 5110312 cache read / 188312 cache write | - |  |
| calibration | claude-sonnet-5-5 | invented | gap stone_pickaxe | 0/5 | [0.00, 0.43] | - | $3.07 | 658 in / 91605 out / 6405054 cache read / 218094 cache write | - |  |
| calibration | claude-sonnet-5-5 | invented | solved wooden_pickaxe | 0/5 | [0.00, 0.43] | - | $3.24 | 686 in / 95853 out / 6868995 cache read / 225367 cache write | - |  |
| T0 | claude-sonnet-5-5 | faithful | gap stone_pickaxe | 3/3 | [0.44, 1.00] | 0 / 0 / 0 | $0.09 | 48 in / 2939 out / 69578 cache read / 11248 cache write | - | ceiling |

#### Bound (unaided; a difference is supported only when the two 95% intervals do not overlap)

- faithful against invented, claude-haiku-4-5-20251001, held-out iron_pickaxe: faithful 5/5, invented 0/5: supported (first is higher)
- faithful against invented, claude-haiku-4-5-20251001, gap stone_pickaxe: faithful 0/5, invented 0/5: within noise
- faithful against invented, claude-haiku-4-5-20251001, solved wooden_pickaxe: faithful 4/5, invented 0/5: within noise
- faithful against invented, claude-sonnet-5-5, held-out iron_pickaxe: faithful 5/5, invented 0/5: supported (first is higher)
- faithful against invented, claude-sonnet-5-5, gap stone_pickaxe: faithful 5/5, invented 0/5: supported (first is higher)
- faithful against invented, claude-sonnet-5-5, solved wooden_pickaxe: faithful 5/5, invented 0/5: supported (first is higher)

#### Repair (gap goals)

- Repair is not yet distinguished from a memory of the solution: there is no memory arm.
- none planned have data

#### No harm (solved goals)

- none planned have data

#### Transfer (held-out goals)

- none planned have data

#### Steps done by hand
- record teacher runs to NAMS (ingest spike)
- create and retire the NAMS workspace
- generate the skill
- review the skill (human, no critic loop yet)

Reading it with the ADR-003 rule (at most 1 success in 5 is a gap, at least 4 is solved):

- Haiku: `stone_pickaxe` is the **gap goal** (0 of 5); `wooden_pickaxe` is solved (4 of 5); `iron_pickaxe`, the
  goal set aside as held-out beforehand, is solved (5 of 5), so **transfer was unmeasurable** here.
- Sonnet solved every faithful goal in 11 or 13 calls, the best runs, every time. Haiku's stone failures were
  runs of 166 to 223 calls in which it made planks but never sticks, in the two I read.
- Route (escalating) and primary measure (repair) were written to the summary after calibration **and after
  the three stone teacher runs**, which is a deviation from the protocol (see "Protocol deviation" below).
  Declaring them after calibration is inherent in the route: the gaps are found first.
- The invented rows carry the faithful role labels (for example "gap stone_pickaxe"). They come from the
  faithful calibration and are only a mapping of goal names; every invented row is at the floor.

## Protocol deviation

The spec (FR-012) and the summary contract require the route, the primary measure and the roles to be written
after calibration and **before any teacher or arm trial**. Here the three stone teacher runs were made first,
right after calibration and on the goal that calibration had shown to be the gap, and the summary was written
afterward. The roles were computed from the calibration trials only, and nothing in the teacher runs (Sonnet
reached the goal at the best run each time) influenced them, but the order was not the protocol's. The
experiment should therefore be read as a run of the staged protocol with that deviation, not as a clean
instance of it. The consequence is limited: no skill arm ran, so no comparison depends on the declared route,
and the faithful-against-invented bound comes from calibration alone. Repeating the teacher stage after
declaration would cost about $0.10 and would not change the distillation finding.

## Faithful against invented

Faithful 24 of 30 (Sonnet 15 of 15, Haiku 9 of 15) against invented 0 of 30. The difference is `supported`
for Sonnet on all three goals and for Haiku on iron, and `within noise` for Haiku on wooden and stone only
because five trials give wide intervals. This is a **bound**, not an effect size: one end is at the floor and
the other near the ceiling, so it shows that prior knowledge is decisive for these recipes and says nothing
about intermediate cases. The invented counterpart keeps the faithful world's five-cell shaped recipes, which
neither model can find by brute force, so it cannot host a skill experiment (ADR-003 now lists a simpler
invented world as a follow-up).

## Distillation

Three Sonnet runs on `stone_pickaxe` (13 calls each with help and inventory, no refusals) were written to a
fresh managed NAMS workspace through the REST API (the harness did not run the hooks), and extracted.

| Attempt | Scope | Format | Result |
|---|---|---|---|
| 1 | all three runs | graph | failed: coverage 0.50 against the 0.60 threshold (`low_coverage`), grounding 1.0 |
| 2 to 4 | each run alone | graph | passed: grounding 1.0, coverage 1.0 |
| 5 | all three runs | prose | passed: grounding 1.0, coverage 1.0 |
| 6 | run 001 alone | prose | passed: grounding 1.0, coverage 1.0 |

Every skill that passed is a generic workflow: read help, inspect inventory, place materials, craft only
after the table is prepared, check inventory. A search of all of them finds no mention of sticks, planks,
cobblestone or oak, and no arrangement. NAMS's documentation says coverage is "coverage of recurring
patterns", from a consolidation step that groups recurring actions into frequency-weighted clusters; it does
not publish the formula. The pattern of results fits that reading: near-identical runs repeat the same
workflow, a graph over several of them clusters badly, and an efficient run offers no contrast (a failed
attempt beside a successful one) from which the distiller would lift the recipe. The pilot's 96-call
exploration had that contrast and its skill carried the recipe in a "why" line.

## Review

Reviewed against the ADR-003 rubric (`runs/faithful-1/review.json`, local): all six candidates are **rejected**.
None leads with a discovered fact or records anything the model does not already do, so an agent with the skill
would know no more than one without it. The reviewer was Claude reading in the session, not a person, and the
critic loop is not built, so a person should confirm the verdict. The candidates are kept in
`spikes/faithful-1/skills/`.

## What this answers

- **Is the faithful world easier than the invented one?** Yes, as a bound: 24 of 30 against 0 of 30.
- **Does the skill repair the student's gap?** Not tested. Distillation from an efficient teacher yielded no
  usable skill, so S0, S1 and S2 were not run (they would have compared an empty skill with no skill).
- **A finding for the protocol.** NAMS's gates (grounding and coverage) say a skill is well grounded in the
  recorded memory, not that it contains anything useful. The review step is what catches the difference, which
  is why ADR-003 has it.

## Cautions

- Five trials per cell. Intervals are wide; Haiku's 0 of 5 on stone could be partly chance, which is why S0
  was to use fresh trials.
- One world, one model pair, one distiller version. NAMS skill distillation changes between versions.
- The coverage explanation above is inferred from the documentation and the results, not from published code.

## Steps done by hand

Writing the experiment summary, creating the NAMS workspace, writing the teacher runs to it, generating the
skills, and reviewing them.

## What would make a skill worth testing here

Teacher material with contrast. Candidates: Haiku's own successful runs on wooden or iron (13 to 123 calls,
with wandering), distilled and tested on stone, which would also be a near-transfer test; or a world where the
teacher must explore. Neither is decided.
