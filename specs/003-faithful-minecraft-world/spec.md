# Feature Specification: Faithful Minecraft-Inspired World and Its Experiments

**Feature Branch**: `003-faithful-minecraft-world`

**Created**: 2026-10-01

**Status**: Implemented; the skill arms were not run (distillation produced no usable skill). Results: `design/notes/faithful-control-results.md`

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

ADR-003 gives each goal a role by measurement. The student plays every goal unaided: a goal it mostly
fails is a *gap goal*, one it mostly solves is a *solved goal*, and a goal set aside before any trial is
*held-out*. This experiment follows the *escalating* route: the teacher is recorded only on the gap goals,
and a skill is distilled from that. Which goals are gaps is a result of the calibration, not an assumption.

The world is inspired by Minecraft's crafting, which is widely known. Minecraft is a trademark of its
owner, and this project is not affiliated with or endorsed by it.

### User Story 1 - A faithful world the experiments can trust (Priority: P1)

The experiment runner opens the repository and finds a world made of familiar Minecraft crafting
vocabulary and recipes, with its goals beside it. The goals form a family of three pickaxe tiers that
share a recipe shape and differ in material. One tier, the iron pickaxe, is set aside as the held-out
goal before any trial; the roles of the other two come from measurement. Each recipe notes the familiar crafting it is modelled on, and the world states
which parts of the game it leaves out. Every goal leaves room for a wasted craft or two. A note
beside the world credits the game as its inspiration and states that the project is unaffiliated.

**Why this priority**: Everything else, including the invented and perturbed worlds, is derived from
this world. A wrong recipe here spoils every comparison made from it.

**Independent Test**: Load the world and its goals, run the solver on every goal, and check each recipe
against its note. Delivers a world that is proven solvable and traceable to what it models.

**Acceptance Scenarios**:

1. **Given** the faithful world and its goals, **When** the solver runs on each goal, **Then** each is
   reachable and the solver reports its best run and its slack.
2. **Given** any goal, **When** its slack is read, **Then** at least two wasted crafts can be
   absorbed without making the goal unreachable.
3. **Given** any recipe in the world, **When** the reviewer looks it up, **Then** a note names the
   familiar crafting it models, and nothing in the world lacks one.
4. **Given** the orientation tools and every refusal in this world, **When** they are swept for leaks,
   **Then** none reveals a recipe or a solution.
5. **Given** the repository's documentation, **When** it is read beside the world, **Then** it credits
   the game as inspiration and states that the project is not affiliated with or endorsed by it. The
   text the agent sees contains no such note.

---

### User Story 2 - Run every arm on the faithful world, by the escalating route (Priority: P2)

The experiment runner follows ADR-003's staged protocol on the faithful world. The two models play every
goal unaided, and the student's results assign each goal a role: gap, solved or ambiguous. The teacher is
then recorded on the gap goals only, one skill is distilled from the trials that reached their goal, and
the skill is reviewed before any student sees it. The student plays again with no help (fresh trials), with
the skill under a neutral prompt, and with the skill under a prompt that points at it. The result is a
table that keeps three measures apart: repair (the gap goals), no harm (the solved goals) and transfer (the
held-out goal), with how often each goal was reached, how many calls it took compared with the best run,
and whether and when each skill arm loaded the skill, all stamped with the world's prior fit.

**Why this priority**: This is the control the other worlds are compared against. In a world the models
already know, most goals are solved unaided and the interesting question is narrow: does a skill repair the
specific failure that remains? A skill that repairs it shows the pipeline works where little is left to
gain, and one that does not sets the floor of the effect.

**Independent Test**: Run calibration, then the arms with the fixed trial counts, and produce the table.
The roles are in the summary before the first teacher or arm trial, every arm has the same number of
trials per kind of goal under the same budget, each skill run names the exact skill text it had, and the
table is stamped faithful.

**Acceptance Scenarios**:

1. **Given** unaided student trials on every goal, **When** roles are assigned by ADR-003's rule, **Then**
   each goal is a gap, solved or ambiguous goal, the held-out goal is reported as measured, and the roles
   are written to the experiment summary before any teacher or arm trial.
2. **Given** at least one gap goal, **When** the teacher trials have run, **Then** the teacher was
   recorded only on gap goals, the reached trials are written to a fresh workspace, and one skill is
   distilled from them with the conversation ids kept in its provenance.
3. **Given** the distilled skill, **When** it is reviewed, **Then** a verdict (accept, revise or reject)
   with reasons is recorded before any student run, and the accepted version's fingerprint is stored.
4. **Given** the accepted skill, **When** the student arms have run, **Then** the no-help, neutral-skill
   and pointed-skill arms each have the same number of trials on each kind of goal, the no-help arm uses
   fresh trials, and each skill run records whether the agent loaded the skill and after how many calls.
5. **Given** the held-out goal is solved unaided, **When** the report is read, **Then** it says transfer
   is unmeasurable in this experiment, and it states the gap-goal result as repair that is not yet
   distinguished from a memory of the solution.
6. **Given** the experiment has finished, **When** its workspace is retired, **Then** the results, the
   skill package, the run folders and the recorded ids are saved first, and only the workspace the
   experiment created is retired.

---

### User Story 3 - Bound the prior's effect with an invented counterpart (Priority: P3)

The experiment runner derives an invented counterpart of the faithful world with the existing renamer, and
finds it has the same recipe structure under invented names, is valid, and is solvable for the same goals.
Both models then play both worlds with no help and no memory. The result is a bound, not an experiment:
it shows how much of a model's success comes from knowing the vocabulary and recipes, and how far apart
the two ends of the prior-fit scale sit. The counterpart keeps the faithful world's recipe depth, which the
models cannot discover by brute force, so it is expected to sit at the floor and is not a world for skill
experiments. An invented world that can host one is separate work.

**Why this priority**: It tests the assumption that real vocabulary and recipes are easier with the
cheapest possible runs and fixes the property that later derivation relies on, but the arms in story 2 are
the larger deliverable.

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
4. **Given** the counterpart is at the floor for both models, **When** the report is read, **Then** it
   states that the comparison is a bound with one end at the floor and the other near the ceiling, makes no
   claim about intermediate effects, and says the counterpart cannot yield teacher recordings.

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
- Stock so generous that a goal needs no thought: the slack requirement bounds it, and the
  report states each goal's slack.
- A model that stops early, loops, or uses its whole budget without a result: each is a failed trial.
- A model that answers from what it knows rather than using the tools: a goal counts as reached only if
  the game state shows it, never from the agent's words.
- No goal is a gap goal: calibration finds nothing the student mostly fails, so there is nothing for a skill
  to repair, and the experiment ends there and reports it (the world is made harder, as ADR-003 says).
- A goal with 2 or 3 successes in 5 unaided trials is ambiguous: it takes no role and is reported.
- No teacher trial reaches a gap goal: there is nothing to distil, and the experiment ends there and
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
  least three pickaxe tiers), plus the intermediate items they need, so that every goal requires
  intermediates made earlier.
- **FR-004**: A goals file MUST list the three pickaxe goals and mark the held-out one (the iron pickaxe).
  No other role is written in the file, because roles come from calibration. Each goal's best run and
  slack MUST be computed by the solver.
- **FR-005**: Every goal MUST have slack of at least two wasted crafts.
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
  existing renamer, with the same recipe structure, valid and solvable for the same goals. It serves the
  unaided comparison only; this feature does not run skill arms on it.
- **FR-011**: The experiment MUST follow ADR-003's staged protocol on the faithful world: calibration of
  both models on every goal (5 trials each) that assigns roles by the ADR's rule; the escalating route,
  recording the teacher only on gap goals; one skill distilled from the reached trials; a reviewed skill;
  then the student arms (no help on fresh trials, skill under a neutral prompt, skill under a pointed
  prompt) on the gap, solved and held-out goals.
- **FR-012**: The route, the primary measure, the wording of the pointed prompt, the trial counts per
  kind of goal, the turn budget and the spend limit MUST be written into the experiment's summary with the
  arms, goals and models before any teacher or arm trial. The roles MUST be written after calibration and
  before any teacher or arm trial, and the report MUST say that the route and primary measure were
  declared after calibration when they were.
- **FR-013**: Teacher trials MUST be recorded to a fresh workspace created for the experiment, no
  development session may record to it, and only workspaces the experiment created may be retired.
- **FR-014**: Each skill run MUST name the exact skill text it had, and MUST record whether and after
  how many calls the agent loaded the skill.
- **FR-015**: A skill MUST be reviewed against the ADR-003 rubric before any student sees it, with the
  verdict and reasons recorded, by the critic loop if it exists and by a human reading otherwise.
- **FR-016**: Each trial's reached or not-reached outcome MUST come from the game state, and its calls
  over the best run, tokens, time and cost MUST come from the existing harness measurements.
- **FR-017**: The report MUST list, per arm, model, world, goal role and goal, the successes out of
  trials and the distribution (minimum, median, maximum) of calls over the best run, MUST keep repair,
  no harm and transfer apart, MUST state when a difference is within what the trial count can support, MUST
  call transfer unmeasurable when the held-out goal is solved, and MUST label a repair result as not yet
  distinguished from memory while the memory arm is absent.
- **FR-018**: The report MUST contain only measured quantities and fixed labels; agent text and
  reasoning MUST NOT appear in it, and it MUST state which steps were carried out by hand.
- **FR-019**: Reproducing the world and its counterpart from the repository MUST give identical files.

### Key Entities

- **Faithful world**: the crafting table populated with familiar Minecraft-inspired vocabulary and
  recipes, with a note per recipe and a stated list of omissions.
- **Goal family**: the pickaxe tiers, recipes of one shape that differ in material. The iron tier is set
  aside as held-out beforehand.
- **Goal role**: gap, solved, ambiguous or held-out, assigned by the rule in ADR-003 from the student's
  unaided trials.
- **Invented counterpart**: the faithful world after renaming, with the same recipe structure.
- **Experiment**: one pass of ADR-003's protocol on one world, with its fixed summary, workspace, skill
  and results.
- **Arm**: one condition of the experiment (teacher on the gap goals, student with no help, student
  with the skill under a neutral prompt, student with the skill under a pointed prompt).
- **Reviewed skill**: the distilled skill with its fingerprint and the review verdict that cleared it.
- **Attribution note**: the documentation text crediting the game as inspiration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All goals in the faithful world and in its invented counterpart are proven solvable by
  tests that pass in the repository's existing test run.
- **SC-002**: Every goal has slack of at least two wasted crafts, as reported by the solver.
- **SC-003**: 100% of the recipes in the faithful world have a note, each omission from the game is
  listed, and no edition or version of the game is named anywhere in the world.
- **SC-004**: The leak sweep over the faithful world finds zero revealed recipes or solutions.
- **SC-005**: The attribution note is present in the documentation and absent from every text the agent
  receives, as checked by a search of the world and the tool output.
- **SC-006**: The invented counterpart has the same recipe graph as the faithful world, with no
  Minecraft names among its items.
- **SC-007**: Every arm has the same trial count on each kind of goal, fixed before the first arm trial,
  and each skill run names the skill text it had, for 100% of skill runs.
- **SC-008**: The report has an entry for every arm, model, world and goal combination planned, and
  states its prior fit and which steps were manual.
- **SC-009**: Total spend stays under a limit set before the first trial; at pilot rates the calibration
  (about $17), the escalating teacher recordings, review and the arms together are expected to come to
  about $30 to $40.
- **SC-010**: The report answers two questions in a sentence each, supported by its counts: whether the
  faithful world is easier for the models than the invented one (a bound between the floor and the
  ceiling), and whether the skill repairs the student's gap in the faithful world.
- **SC-011**: Regenerating the world and its counterpart yields byte-identical files.
- **SC-012**: The roles are in the experiment summary before the first teacher or arm trial, and the
  report shows repair, no harm and transfer as separate rows or sections.

## Assumptions

- ADR-003 orders the first experiment as the invented world. This feature runs the faithful world
  first, as an important control, and notes the change of order above.
- The route is escalating and the primary measure is repair on the gap goals. They are declared after the
  calibration trials, which is inherent in the escalating route (the gaps are found first), and before any
  teacher or arm trial; the report says so. In the first run of this experiment the three teacher runs came
  before the declaration, a deviation recorded in the results note. Which goals are gaps is read from calibration; the first calibration put the student's gap on
  the stone pickaxe (0 of 5), and left the iron pickaxe held-out goal solved (5 of 5), so transfer is
  expected to be unmeasurable here.
- The invented counterpart, as built, is at the floor for both models in calibration (0 of 30 unaided
  trials), so it cannot yield teacher recordings. It supports the unaided comparison only. An invented world
  that can host a skill experiment is a follow-up (ADR-003): simpler recipes of one pattern with different
  parameters, perhaps a smaller table or the `partial` hint level, calibrated so the teacher reaches the
  goals and the student mostly fails.
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
  uses 5 trials per model, world and goal. The arms use 10 trials on each gap goal (the primary
  measure) and 3 on each solved or held-out goal, and the turn budget is 80, all written to the summary
  before the first arm trial.
- Controls and arms use the existing harness: user settings are not loaded, and recording happens after
  the run.
- Using the game's item names and recipes in a published replay bundle is not decided here; no bundle
  of the faithful world is published by this feature.
