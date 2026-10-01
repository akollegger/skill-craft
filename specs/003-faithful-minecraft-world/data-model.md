# Data Model: Faithful Minecraft-Inspired World and Its Experiments

Files and records this feature adds. The world and goals formats are unchanged
([world-format](../001-crafting-table-sim/contracts/world-format.md)).

## World notes (`<world>.notes.json`)

Read by tests, the world generator and the harness's summary writer. Never read by the engine or the
server, and never sent to the agent.

| Field | Type | Rules |
|---|---|---|
| `priorFit` | `"invented"` \| `"faithful"` \| `"perturbed"` | Required |
| `inspiration` | string | Required when `priorFit` is `faithful` or `perturbed`: the source the vocabulary is drawn from, in plain words, with no edition or version |
| `derivedFrom` | string | Required for a generated world: the repository path of the world it was renamed from |
| `recipes` | map of recipe id to note | Required when `priorFit` is `faithful`. Every recipe id in the world has a note, and no note names a recipe the world lacks. A note is the familiar crafting the recipe models, in a sentence |
| `omissions` | list of strings | Required when `priorFit` is `faithful`. Each names a feature of the source the world leaves out. Not empty |

Validation beyond the shape:
- The text of a faithful world's notes MUST NOT name an edition or version of the source (the words
  "edition", "Java", "Bedrock", or a dotted version number).
- Unknown fields are rejected, as in the world format.

State: none. The file is written by hand (faithful world) or by the generator (generated worlds) and
does not change at run time.

## Faithful world

| Aspect | Value |
|---|---|
| Items | 13: 3 raw (`oak_log`, `cobblestone`, `iron_ingot`), 10 made |
| Recipes | 10: planks, sticks, crafting table, slab, and a pickaxe and a sword in each of three materials |
| Stock | `oak_log` 3, `cobblestone` 6, `iron_ingot` 6 (initial values; the slack test is the rule) |
| Goal family | `wooden_pickaxe`, `stone_pickaxe`, `iron_pickaxe`; iron is set aside as held-out beforehand, the other roles come from calibration |
| Hint level | `exact` |
| Descriptions | category-only ("A raw material.", "A made item.") |

Relationships: a pickaxe recipe needs a made item (`stick`) and, for the wooden tier, another made item
(`oak_planks`), so every goal requires intermediates made earlier in the same run.

## Invented counterpart

The faithful world and goals after `renameWorld` with seed 7. Same table, stock quantities, recipe kinds,
quantities and arrangements; item names and ids replaced; descriptions category-only. Its notes file has
`priorFit: "invented"` and `derivedFrom` set to the faithful world's path.

## Experiment summary (`runs/<experiment>/summary.json`)

Written before the first trial. See [contracts/experiment-summary.md](contracts/experiment-summary.md).

| Field | Meaning |
|---|---|
| `experiment` | A short id, used as the label prefix of every run folder |
| `priorFit` | The world the arms ran on |
| `models` | `teacher` and `student` ids |
| `arms` | The arms, each with its label, model, whether it is recorded, its skill (if any) and its prompt note (if any) |
| `labels` | Every run label folder, mapped to `calibration` or to an arm |
| `route` | `escalating` or `preemptive` |
| `primary` | `repair` or `transfer`: the measure the experiment declared |
| `goals` | The goal set, and the held-out goals set aside beforehand |
| `roles` | Each goal's role from calibration: `gap`, `solved` or `ambiguous`. Written after calibration and before any teacher or arm trial |
| `trials` | Calibration trials per combination, teacher trials per recorded goal, and arm trials per kind of goal (gap, solved, held-out) |
| `turnBudget`, `spendLimitUsd` | Fixed before the first trial |
| `manualSteps` | The steps carried out by hand |
| `workspace` | The workspace id the experiment created, and when it was retired |
| `skill` | Skill id, version id and SHA-256 of `SKILL.md`, once reviewed |

## Run record additions

Each run folder's `score.json` and the run summary gain two fields:

| Field | Meaning |
|---|---|
| `priorFit` | The world's declared prior fit, or `undeclared` |
| `promptNote` | The fixed sentence added to the base prompt, or absent |

## Review record (`runs/<experiment>/review.json`)

| Field | Meaning |
|---|---|
| `rubric` | The answers to each ADR-003 rubric question |
| `verdict` | `accept`, `revise` or `reject` |
| `reasons` | Why |
| `skillSha256` | SHA-256 of the reviewed `SKILL.md` |
| `reviewer` | `human` or the critic's model id |

## Report row

Derived, never stored. See [contracts/report.md](contracts/report.md).
