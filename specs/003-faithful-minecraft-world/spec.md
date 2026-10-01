# Feature Specification: Faithful Minecraft-Inspired World and Its Experiments

**Feature Branch**: `003-faithful-minecraft-world`

**Created**: 2026-10-01

**Status**: Draft

**Input**: User description: "experiments on the faithful minecraft world as detailed in @design/adr/ADR-003-experiment-protocol.md and mentioned in discussion above"

**Derived From**: ADR-003 (design/adr/ADR-003-experiment-protocol.md)

## User Scenarios & Testing *(mandatory)*

The people who use this feature are the **experiment runner**, who needs a world whose vocabulary and
recipes match a well-known source and the results of every experiment arm on it; and the **reviewer**,
who reads those results to judge how much a skill's effect comes from what the model already knew.
ADR-003 calls a world's *prior fit* the degree to which a model's existing knowledge predicts its
recipes. A *faithful* world sits at the far end: the source's own names and recipes, with nothing
invented. It is the control for the other two kinds of world (invented and perturbed) and the base from
which both are derived.

This feature builds that world, runs the full set of arms of ADR-003 on it, and compares unaided
results with an invented counterpart. ADR-003 puts the invented world first in the order of
experiments. The faithful world comes first here for two reasons: the invented and perturbed worlds
derive from it, and it is the control that bounds what any skill or memory can add. Establishing the
control early is worth the change of order.

The world is inspired by Minecraft's crafting, which is widely known. Minecraft is a trademark of its
owner, and this project is not affiliated with or endorsed by it.

### User Story 1 - A faithful world the experiments can trust (Priority: P1)

The experiment runner opens the repository and finds a world made of familiar Minecraft crafting
vocabulary and recipes, with its goals beside it. The goals form a family: two learn goals and one
held-out goal that share a recipe shape and differ in material (wooden and stone pickaxes to learn, an
iron pickaxe held out). Each recipe notes the familiar crafting it is modelled on, and the world states
which parts of the game it leaves out. The held-out goal leaves room for a wasted craft or two. A note
beside the world credits the game as its inspiration and states that the project is unaffiliated.

**Why this priority**: Everything else, including the invented and perturbed worlds, is derived from
this world. A wrong recipe here spoils every comparison made from it.

**Independent Test**: Load the world and its goals, run the solver on every goal, and check each recipe
against its note. Delivers a world that is proven solvable and traceable to what it models.

**Acceptance Scenarios**:

1. **Given** the faithful world and its goals, **When** the solver runs on each goal, **Then** each is
   reachable and the solver reports its best run and its slack.
2. **Given** the held-out goal, **When** its slack is read, **Then** at least two wasted crafts can be
   absorbed without making the goal unreachable.
3. **Given** any recipe in the world, **When** the reviewer looks it up, **Then** a note names the
   familiar crafting it models, and nothing in the world lacks one.
4. **Given** the orientation tools and every refusal in this world, **When** they are swept for leaks,
   **Then** none reveals a recipe or a solution.
5. **Given** the repository's documentation, **When** it is read beside the world, **Then** it credits
   the game as inspiration and states that the project is not affiliated with or endorsed by it. The
   text the agent sees contains no such note.

---

### User Story 2 - Run every arm on the faithful world (Priority: P2)

The experiment runner follows ADR-003's protocol on the faithful world. The teacher plays the learn
goals and is recorded. One skill is distilled from the trials that reached their goal and is reviewed
before any student sees it. The student then plays the held-out goal (and the learn goals as a sanity
check) with no help, with the skill under a neutral prompt, and with the skill under a prompt that points
at it. The result is a table per arm of how often the goal was reached and how many calls it took
compared with the best run, with whether and when each skill arm loaded the skill, all stamped with the
world's prior fit.

**Why this priority**: This is the control the other worlds are compared against. It shows what the
skill adds when the model already knows the recipes, which is expected to be little. A skill that helps
here is a strong result, and one that does not sets the floor of the effect.

**Independent Test**: Run the arms with the fixed trial count and produce the table. Every arm has the
same number of trials under the same budget, each skill run names the exact skill text it had, and the
table is stamped faithful.

**Acceptance Scenarios**:

1. **Given** the faithful world, **When** the teacher trials on the learn goals have run, **Then** the
   reached trials are recorded to a fresh workspace and one skill is distilled from them, with the
   conversation ids kept in its provenance.
2. **Given** the distilled skill, **When** it is reviewed, **Then** a verdict (accept, revise or
   reject) with reasons is recorded before any student run, and the accepted version's fingerprint is
   stored.
3. **Given** the accepted skill, **When** the student arms have run, **Then** the no-help, neutral-skill
   and pointed-skill arms each have the same number of trials, and each skill run records whether the
   agent loaded the skill and after how many calls.
4. **Given** the faithful world's no-help student result is near the ceiling (almost every trial
   succeeds), **When** the report is read, **Then** it says so and does not claim a skill effect that
   the counts cannot support.
5. **Given** the experiment has finished, **When** its workspace is retired, **Then** the results, the
   skill package, the run folders and the recorded ids are saved first, and only the workspace the
   experiment created is retired.

---

### User Story 3 - Faithful against invented, unaided (Priority: P3)

The experiment runner derives an invented counterpart of the faithful world with the existing renamer,
and finds it has the same recipe structure under invented names, is valid, and is solvable for the same
goals. Both models then play both worlds with no help and no memory. The result answers the assumption
that real vocabulary and recipes are easier for a model than invented ones, and shows how much room a
skill would have in each.

**Why this priority**: It tests the assumption directly with the cheapest possible runs, but the arms in
story 2 are the larger deliverable.

**Independent Test**: Derive the counterpart, compare its recipe graph with the faithful world's, run the
unaided trials on both, and produce the table.

**Acceptance Scenarios**:

1. **Given** the faithful world and goals, **When** the renamer derives the counterpart, **Then** the
   counterpart passes validation, every goal is solvable with the same best-run call counts, and none of
   its item names is a Minecraft name.
2. **Given** the unaided trials on both worlds, **When** the table is produced, **Then** every model,
   world and goal combination has the same number of trials under one budget, and each row names its
   world's prior fit.
3. **Given** a trial in which the agent never reaches the goal, **When** the table is produced, **Then**
   it counts as a failure and the run's measured cost is still included.

---

### Edge Cases

- A recipe the game allows in a mirrored arrangement: the world accepts the arrangement the game
  accepts, or the world states that it does not and the recipe's note says why.
- Game recipes that accept any of several materials (for example any kind of planks): the world uses one
  material and states the simplification, since the engine has no way to say "any of".
- Game mechanics outside the crafting table (gathering, smelting, durability, enchantments, stations):
  these are left out and the world states each omission, so "faithful" is judged within the crafting-table
  mechanic.
- Recipes that differ between versions of the game: the world uses recipes that are the same across
  the versions commonly played, and leaves out any that are not.
- Two recipes that make the same output, or two that the matcher cannot tell apart: world validation
  rejects the world.
- Stock so generous that the held-out goal needs no thought: the slack requirement bounds it, and the
  report states each goal's slack.
- A model that stops early, loops, or uses its whole budget without a result: each is a failed trial.
- A model that answers from what it knows rather than using the tools: a goal counts as reached only if
  the game state shows it, never from the agent's words.
- No teacher trial reaches a learn goal: there is nothing to distil, and the experiment ends there and
  reports it.
- The reviewer rejects the skill: the experiment reports that distillation did not yield a usable skill,
  and the skill arms do not run.
- The results land on the ceiling or the floor in all arms: the report says which and does not claim a
  difference between arms.
- A recording or review step that the project has not yet built as its own feature: the step is carried
  out by hand as in the pilot, and the report states which steps were manual.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The faithful world MUST be a world file in the existing world format, loadable without
  any change to the simulation.
- **FR-002**: Every recipe MUST carry a note naming the familiar crafting it models, and the world MUST
  state the features of the game it leaves out. No game edition or version is named.
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
- **FR-009**: Repository documentation beside the world MUST credit the game as inspiration and state
  that the project is not affiliated with or endorsed by its owner. That text MUST NOT appear in
  anything the agent sees.
- **FR-010**: An invented counterpart MUST be derived from the faithful world and its goals by the
  existing renamer, with the same recipe structure, valid and solvable for the same goals.
- **FR-011**: The experiment MUST follow ADR-003's protocol on the faithful world: calibration of both
  models on the held-out goal (a measurement in this world, not a gate), teacher trials on the learn
  goals, one skill distilled from the reached trials, a reviewed skill, then the student arms: no help,
  skill under a neutral prompt, skill under a pointed prompt.
- **FR-012**: The wording of the pointed prompt, the trial count per arm, the turn budget and the spend
  limit MUST be fixed before the first trial and written into the experiment's summary with the arms,
  goals and models.
- **FR-013**: Teacher trials MUST be recorded to a fresh workspace created for the experiment, no
  development session may record to it, and only workspaces the experiment created may be retired.
- **FR-014**: Each skill run MUST name the exact skill text it had, and MUST record whether and after
  how many calls the agent loaded the skill.
- **FR-015**: A skill MUST be reviewed against the ADR-003 rubric before any student sees it, with the
  verdict and reasons recorded, by the critic loop if it exists and by a human reading otherwise.
- **FR-016**: Each trial's reached or not-reached outcome MUST come from the game state, and its calls
  over the best run, tokens, time and cost MUST come from the existing harness measurements.
- **FR-017**: The report MUST list, per arm, model, world and goal, the successes out of trials and the
  distribution (minimum, median, maximum) of calls over the best run, and MUST state when a difference
  is within what the trial count can support.
- **FR-018**: The report MUST contain only measured quantities and fixed labels; agent text and
  reasoning MUST NOT appear in it, and it MUST state which steps were carried out by hand.
- **FR-019**: Reproducing the world and its counterpart from the repository MUST give identical files.

### Key Entities

- **Faithful world**: the crafting table populated with familiar Minecraft-inspired vocabulary and
  recipes, with a note per recipe and a stated list of omissions.
- **Goal family**: the learn goals and the held-out goal, drawn from recipes of one shape that differ in
  material.
- **Invented counterpart**: the faithful world after renaming, with the same recipe structure.
- **Experiment**: one pass of ADR-003's protocol on one world, with its fixed summary, workspace, skill
  and results.
- **Arm**: one condition of the experiment (teacher on the learn goals, student with no help, student
  with the skill under a neutral prompt, student with the skill under a pointed prompt).
- **Reviewed skill**: the distilled skill with its fingerprint and the review verdict that cleared it.
- **Attribution note**: the documentation text crediting the game as inspiration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All goals in the faithful world and in its invented counterpart are proven solvable by
  tests that pass in the repository's existing test run.
- **SC-002**: The held-out goal has slack of at least two wasted crafts, as reported by the solver.
- **SC-003**: 100% of the recipes in the faithful world have a note, each omission from the game is
  listed, and no edition or version of the game is named anywhere in the world.
- **SC-004**: The leak sweep over the faithful world finds zero revealed recipes or solutions.
- **SC-005**: The attribution note is present in the documentation and absent from every text the agent
  receives, as checked by a search of the world and the tool output.
- **SC-006**: The invented counterpart has the same recipe graph as the faithful world, with no
  Minecraft names among its items.
- **SC-007**: Every arm has the same trial count, fixed before the first trial, and each skill run
  names the skill text it had, for 100% of skill runs.
- **SC-008**: The report has an entry for every arm, model, world and goal combination planned, and
  states its prior fit and which steps were manual.
- **SC-009**: Total spend stays under a limit set before the first trial; at recent pilot rates this is
  expected to be about $30 to $60 for the arms, the teacher recordings, review and the unaided
  comparison together.
- **SC-010**: The report answers two questions in a sentence each, supported by its counts: whether the
  faithful world is easier for the models than the invented one, and whether the skill changes the
  student's result on the faithful world.
- **SC-011**: Regenerating the world and its counterpart yields byte-identical files.

## Assumptions

- ADR-003 orders the first experiment as the invented world. This feature runs the faithful world
  first, as an important control, and notes the change of order above.
- The perturbed world is out of scope. It needs the generator to keep names and apply rules, which is
  separate work.
- The recording of a finished run, the workspace lifecycle and the critic loop are separate features,
  specified on their own. Where one is not yet built when this feature is carried out, its step is done
  by hand as in the pilot (replay and write the run, create and retire the workspace, a human reading
  against the rubric), and the report says so.
- No game edition or version is pinned. The world uses crafting that is the same across the versions
  commonly played, and credits the game as its inspiration without claiming affiliation.
- Recipes use a single material where the game accepts several (for example oak planks only), because
  the simulation has no "any of" matching.
- The subset is small: the pickaxe family (wooden, stone, iron), the planks and sticks they need, and a
  few unrelated items as decoys, within the 3x3 table. Exact items and stock are settled in planning.
- Models are the teacher (`claude-sonnet-5-5`) and the student (`claude-haiku-4-5-20251001`). Calibration
  uses 5 trials per model, world and goal. The trial count of the arms (ADR-003 assumes ten) and the
  turn budget are decided before the first trial.
- Controls and arms use the existing harness: user settings are not loaded, and recording happens after
  the run.
- Using the game's item names and recipes in a published replay bundle is not decided here; no bundle
  of the faithful world is published by this feature.
