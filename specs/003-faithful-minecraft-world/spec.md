# Feature Specification: Faithful Minecraft World and Control Experiments

**Feature Branch**: `003-faithful-minecraft-world`

**Created**: 2026-10-01

**Status**: Draft

**Input**: User description: "experiments on the faithful minecraft world as detailed in @design/adr/ADR-003-experiment-protocol.md and mentioned in discussion above"

**Derived From**: ADR-003 (design/adr/ADR-003-experiment-protocol.md)

## User Scenarios & Testing *(mandatory)*

The people who use this feature are the **experiment runner**, who needs a world whose vocabulary and
recipes match a well-known source, and numbers showing how well models do in it without any help; and
the **reviewer**, who reads those numbers to judge how much of a later skill's effect comes from what
the model already knew. ADR-003 calls a world's *prior fit* the degree to which a model's existing
knowledge predicts its recipes. A *faithful* world sits at the far end: the source's own names and
recipes, with nothing invented. It is the control for the other two kinds of world (invented and
perturbed), and the base from which both are derived.

This feature builds that world and measures how models do in it unaided. It does not run any
skill or memory arm, which depend on recording and review work specified separately.

### User Story 1 - A faithful world the experiments can trust (Priority: P1)

The experiment runner opens the repository and finds a world made of Minecraft's crafting vocabulary and
recipes, with its goals beside it. The goals form a family: two learn goals and one held-out goal
that share a recipe shape and differ in material (wooden and stone pickaxes to learn, an iron pickaxe
held out). Every recipe in the world names the release of the game it comes from, and the world states
which parts of the game it leaves out. The held-out goal leaves room for a wasted craft or two.

**Why this priority**: Everything else, including the invented and perturbed worlds, is derived from
this world. A wrong recipe here spoils every comparison made from it.

**Independent Test**: Load the world and its goals, run the solver on every goal, and compare each
recipe against its stated source. Delivers a world that is proven solvable and traceable to its source.

**Acceptance Scenarios**:

1. **Given** the faithful world and its goals, **When** the solver runs on each goal, **Then** each is
   reachable and the solver reports its best run and its slack.
2. **Given** the held-out goal, **When** its slack is read, **Then** at least two wasted crafts can be
   absorbed without making the goal unreachable.
3. **Given** any recipe in the world, **When** the reviewer looks it up, **Then** a source reference
   (game release and recipe name) is found, and nothing in the world lacks one.
4. **Given** the orientation tools and every refusal in this world, **When** they are swept for leaks,
   **Then** none reveals a recipe or a solution.

---

### User Story 2 - Measure models without help, faithful against invented (Priority: P2)

The experiment runner plays each of the two models (teacher and student, as ADR-003 fixes them) on the
faithful world with no skill and no memory, then plays the same models on an invented counterpart of
the same world, under the same conditions. The result is a table, per model, world and goal, of how
often the goal was reached and how many calls it took compared with the best run. It answers the
assumption that real vocabulary and recipes are easier for a model than invented ones, and it shows how
much room a skill would have in each.

**Why this priority**: This is the experiment the feature exists for, but it needs the world from
story 1 first.

**Independent Test**: Run the planned trials on both worlds and produce the table. The table has an
entry for every combination, each states its world's prior fit, and no difference is claimed that the
trial count cannot support.

**Acceptance Scenarios**:

1. **Given** the faithful world and its invented counterpart, **When** the planned trials have run,
   **Then** every model, world and goal combination has the same number of trials, run under the same
   budget.
2. **Given** the finished trials, **When** the table is produced, **Then** each row names the world's
   prior fit, the successes out of trials, and the distribution of calls over the best run.
3. **Given** the faithful world's held-out result is near the ceiling (almost every trial succeeds),
   **When** the report is read, **Then** it says so and states that no skill or memory arm is run on this
   world, since there is little left to improve.
4. **Given** a trial in which the agent never reaches the goal, **When** the table is produced, **Then**
   it counts as a failure and the run's measured cost is still included.

---

### User Story 3 - The faithful world as the base for the other two (Priority: P3)

The experiment runner derives the invented counterpart from the faithful world and its goals with the
existing renamer, and finds it has the same recipe structure under invented names, is valid, and is
solvable for the same goals. The same faithful world is the base from which the perturbed world will be
made later, once the generator can keep names and apply rules.

**Why this priority**: The invented counterpart is needed by story 2, but deriving the perturbed
world is out of scope here. This story fixes the property that makes later derivation possible.

**Independent Test**: Derive the counterpart and compare its recipe graph with the faithful world's;
they are the same up to item names.

**Acceptance Scenarios**:

1. **Given** the faithful world and goals, **When** the renamer derives the counterpart, **Then** the
   counterpart passes validation and every goal is solvable with the same best-run call counts.
2. **Given** the counterpart, **When** its item names are read, **Then** none is a Minecraft name.

---

### Edge Cases

- A recipe the game allows in a mirrored arrangement: the world accepts the arrangement the game
  accepts, or the world states that it does not and the recipe's source note says why.
- Game recipes that accept any of several materials (for example any kind of planks): the world uses one
  material and states the simplification, since the engine has no way to say "any of".
- Game mechanics outside the crafting table (gathering, smelting, durability, enchantments, stations):
  these are left out and the world states each omission, so "faithful" is judged within the crafting-table
  mechanic.
- Two recipes that make the same output, or two that the matcher cannot tell apart: world validation
  rejects the world.
- Stock so generous that the held-out goal needs no thought: the slack requirement bounds it, and the
  report states each goal's slack.
- A model that stops early, loops, or uses its whole budget without a result: each is a failed trial, as
  in any other run.
- A model that answers from what it knows rather than using the tools: a goal counts as reached only if
  the game state shows it, never from the agent's words.
- The trial results land on the ceiling or the floor in both worlds: the report says which, and does not
  claim a difference between worlds.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The faithful world MUST be a world file in the existing world format, loadable without
  any change to the simulation.
- **FR-002**: Every recipe MUST carry a reference to the game release and recipe it comes from, and the
  world MUST state the features of the game it leaves out.
- **FR-003**: The world MUST include a family of recipes that share a shape and differ in material (at
  least three pickaxe tiers), plus the intermediate items they need, so that the held-out goal requires
  intermediates made earlier.
- **FR-004**: A goals file MUST give two learn goals and one held-out goal from that family, and each
  goal's best run and slack MUST be computed by the solver.
- **FR-005**: The held-out goal MUST have slack of at least two wasted crafts.
- **FR-006**: Item descriptions MUST be category-only, and no tool or refusal in this world may reveal a
  recipe or a solution.
- **FR-007**: The world MUST be proven solvable for every goal by an automated check that runs with the
  existing tests.
- **FR-008**: The world MUST declare its prior fit as faithful, and every result produced from it MUST
  name that prior fit.
- **FR-009**: An invented counterpart MUST be derived from the faithful world and its goals by the
  existing renamer, with the same recipe structure, valid and solvable for the same goals.
- **FR-010**: The control experiment MUST play each of the two models on each world and each goal
  without recording, without a skill and without recall, for the same number of trials per combination
  and under one budget, all fixed before the first trial.
- **FR-011**: Each trial's reached/not-reached outcome MUST come from the game state, and its calls over
  the best run, tokens, time and cost MUST come from the existing harness measurements.
- **FR-012**: The report MUST list, per model, world and goal, the successes out of trials and the
  distribution (minimum, median, maximum) of calls over the best run, and MUST state when a difference
  between worlds is within what the trial count can support.
- **FR-013**: The report MUST contain only measured quantities and fixed labels; agent text and
  reasoning MUST NOT appear in it.
- **FR-014**: Reproducing the world and its counterpart from the repository MUST give identical files.

### Key Entities

- **Faithful world**: the crafting table populated with a source game's vocabulary and recipes, with a
  source reference per recipe and a stated list of omissions.
- **Goal family**: the learn goals and the held-out goal, drawn from recipes of one shape that differ in
  material.
- **Invented counterpart**: the faithful world after renaming, with the same recipe structure.
- **Control measurement**: the unaided trials of one model on one world and goal, and the table that
  summarizes them with the world's prior fit.
- **Source reference**: a game release and recipe name tied to one recipe.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All goals in the faithful world and in its invented counterpart are proven solvable by
  tests that pass in the repository's existing test run.
- **SC-002**: The held-out goal has slack of at least two wasted crafts, as reported by the solver.
- **SC-003**: 100% of the recipes in the faithful world have a source reference, and each omission from
  the game is listed.
- **SC-004**: The leak sweep over the faithful world finds zero revealed recipes or solutions.
- **SC-005**: The invented counterpart has the same recipe graph as the faithful world, with no
  Minecraft names among its items.
- **SC-006**: The control table has an entry for every combination of two models, two worlds and three
  goals, each with the same trial count (5 per combination at the protocol's calibration size, 60 trials
  in all).
- **SC-007**: The control experiment's total spend stays under a limit set before the first trial; at
  recent pilot rates of $0.15 to $0.40 per run this is expected to be about $10 to $25.
- **SC-008**: The report answers one question in a sentence supported by its counts: whether the
  faithful world is easier for the models than the invented one.
- **SC-009**: Regenerating the world and its counterpart yields byte-identical files.

## Assumptions

- ADR-003 orders the first experiment as the invented world; this feature builds the faithful world
  first because both the invented and perturbed worlds derive from it, and because the faithful world
  is the control the others are compared against.
- Skill arms (S1, S2) and the memory arm are out of scope. They depend on recording a finished run,
  the critic loop and the experiment runner, each specified separately. If the faithful baseline is
  below the ceiling, a later feature may run them on this world.
- The perturbed world is out of scope. It needs the generator to keep names and apply rules, which is
  separate work.
- The game release is the current stable Java Edition (assumed 1.21) and is pinned in the world's source
  references; the exact release is confirmed during planning.
- Recipes use a single material where the game accepts several (for example oak planks only), because
  the simulation has no "any of" matching.
- The subset is small: the pickaxe family (wooden, stone, iron), the planks and sticks they need, and a
  few unrelated items as decoys, within the 3x3 table. Exact items and stock are settled in planning.
- Models are the teacher (`claude-sonnet-5-5`) and the student (`claude-haiku-4-5-20251001`), 5 trials
  per model, world and goal, and one shared turn budget, as ADR-003 sets out. The turn budget's value is
  decided before the first trial.
- Controls use the existing harness unchanged: no recording, no skill, user settings not loaded.
- Using Minecraft item names and recipes in a published replay bundle is not decided here; no bundle
  of the faithful world is published by this feature.
