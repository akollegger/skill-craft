---
id: ADR-003
title: Experiment protocol: arms, models, isolation and skill review
status: accepted
created: 2026-10-01
specs: [specs/003-faithful-minecraft-world, specs/005-critic-loop-harness]
---

# ADR-003: Experiment protocol: arms, models, isolation and skill review

## 1. Context

The demo's claim is that a skill distilled from a strong model's recorded runs lets a smaller model finish a task it cannot finish alone. A *skill* is a folder an agent can load (a `SKILL.md` plus reference files); Neo4j Agent Memory (NAMS), a memory service for agents, *distills* one from recorded runs. The strong model is the *teacher* and the smaller model the *student*.

The task is a simulated crafting table (ADR-001). The agent places items on a 3x3 grid, and `craft` consumes the grid's contents and produces whatever recipe they match. Raw items are limited (the *stock*), so a wrong craft costs something. A recipe is *shapeless* (the right items in any arrangement) or *shaped* (the right items in the right arrangement). A *goal* is an item to hold. The *best run* for a goal is the fewest calls the solver (an exact search) finds, and *slack* is how many wasted crafts a run can absorb and still reach the goal.

A goal's role is set by measurement, not chosen in advance. The student plays each goal unaided first. A goal it mostly fails is a *gap goal* and one it mostly solves is a *solved goal*. The teacher is recorded on the gap goals, since those are what a skill is for, and may be recorded on more. A *held-out goal* is set aside before any teacher run: the teacher is never recorded on it and no skill is distilled from it, so success on it measures whether the skill *transfers* to a goal it was not built from and not whether it memorized an answer. After the skill is installed, the student's success on a gap goal is its *repair rate*, and its success on a solved goal shows whether the skill does *no harm*.

A skill can enter a workflow in two ways. In the *preemptive* route a strong model works many goals first and skills are distilled from all of it. In the *escalating* route the weaker model goes first, and only the goals it fails are handed to the stronger model, which is recorded and from which a skill is distilled. The protocol below serves both: they differ only in which goals the teacher is recorded on.

Testing the claim needs comparisons across models and conditions (called *arms* below) that are repeatable, kept apart from one another, and measured the same way. A *trial* is one run of one arm. A pilot on one generated world (`forge-7`) and one goal showed what follows, and it shapes the protocol.

**Single runs say little.** The same model on the same goal took 67 action calls without reaching it, and 96 calls reaching it. With a skill installed, three runs took 69 calls (reached), 76 (not reached) and 49 (reached). The best possible run is 3 calls. Neither a with-versus-without pair nor a three-run batch can separate an effect from luck.

**Recall leaks from development sessions.** The `nams-hooks` plugin for Claude Code records each session to a NAMS workspace (an isolated store of conversations, entities and skills) and, at the start of a session, recalls: it searches the workspace's entities for matches to the first prompt. In the shared workspace, the matches came from the design sessions recorded there. One stated that the goal needs "one craft in the best run". Deleting a conversation removes it and its messages, not what was extracted from it: the entity count rose after two experiment conversations were deleted, and a graph query on a test workspace found a deleted conversation's tool-call and step nodes still present as orphans.

**No call clears a workspace in place.** On a throwaway workspace holding a conversation with its reasoning trace, entities, a distilled skill and its run, the API could delete the conversations and every entity (the entity list returns at most 200 per call, so deletion repeats until the list is empty). It could not delete the skill, its version and components, the distillation run, or the orphaned tool-call and step nodes, because no endpoint exists for them. The MCP tool `workspace_reprovision`, documented as replacing a managed workspace's database with a fresh one, returned success twice and changed nothing observable over about eight minutes: the same database host, all data intact. Creating a managed workspace with `workspace_create` produced an active one in about 30 seconds, and `workspace_delete` removed one from the account's workspace list.

**Unaided runs on the held-out goal fail for the wrong reason.** On `forge-7`, 5 Haiku and 5 Sonnet runs on `pluzhouvio` (a cap of 100 agent turns, no skill, unrecorded) reached it 0 times in 10. The goal needs all 4 `lugli`, and 9 of the 10 runs crafted `naeviozhum` (an invented item), which spends one, so the goal was already unreachable. Sonnet's final messages say as much. With no slack, the outcome measures whether an exploratory craft happened to burn stock, not whether the model found the recipe.

**Prior knowledge decides how much a skill can add, and real processes have some.** In a world of invented names the only way to learn a recipe is to try combinations. Real recipes, workflows and procedures come with a familiar vocabulary whose specifics differ in ratios, order or technique. An experiment on invented names alone cannot say what a skill adds beyond what the model already knows. A world's *prior fit* is how far the model's existing knowledge predicts its recipes: *invented*, *faithful* or *perturbed* (defined in 2.3).

**A run can be recorded without the hooks.** A finished run's folder holds its call sequence (`run.jsonl`), per-call timings (`trace.jsonl`), prompt and final answer. The sim is deterministic, so replaying the call sequence through the craft server (the MCP server that exposes the world as tools) regenerates each tool output exactly as the agent saw it. Writing the run to NAMS through its REST API (a conversation, its two messages, one reasoning step per distinct tool, and one tool call per call with input, output, status and duration) produced a reasoning trace of the same shape as the hooks' recording of the same 96-call run: 6 steps and 99 tool calls. The skill distilled from it matched the hooks-based skill on grounding and coverage (both 1.0) and on the six-step procedure, and stated the recipe in step 3 as well as step 6. Nothing in that path runs a recall.

**A skill that passes NAMS's checks can still be unhelpful.** The skill distilled from one successful run scored grounding 1.0 and coverage 1.0 (gates 0.9 and 0.6). Grounding asks whether each step traces back to the recorded memory, and coverage whether the recorded work is represented. Its steps replay the teacher's exploration routine (read help, check inventory, place, clear, remove). The recipe it did capture, two `lugli` side by side in the top row, sits in the *why* line of the last step. In three runs the agent loaded the skill late (after 47 calls, then solved in two), never, or at an unrecorded point. The harness prompt told the agent to "use only the craft tools" and to "explore", and the skill's description began with a tool name. NAMS skill distillation is an early service whose output will change between versions.

**Which goals are gaps is a result, not a choice.** In the faithful world of spec 003 (a world with Minecraft-inspired recipes), 5 unaided trials per goal gave Sonnet 15 of 15 at the best run's call count, and gave Haiku 4 of 5 on the wooden pickaxe, 0 of 5 on the stone pickaxe and 5 of 5 on the iron pickaxe. The goal an author would have held out for the student (iron) was already solved, and the gap was on a goal an author would have called an easy lesson. Roles fixed in advance would have put the experiment's effort where there was nothing to repair.

**The pieces for a protocol exist.** Worlds are generated data with goals of increasing depth (`forge-7`: `glirol` needs 1 craft and 3 calls, `vriobeno` 2 crafts and 5 calls, `pluzhouvio` 7 crafts and 22 calls with no slack). The harness runs Claude Code through the Agent SDK, scores a run by replaying its log, measures time, tokens and cost, records which model ran, and installs a skill folder into a run (ADR-001 and ADR-002 define the world, the run log and the measurement).

## 2. Decision

### 2.1 Players and models

The player is Claude Code through the Agent SDK, as the harness already runs it. Every run pins its model by id; no run uses a default.

Two roles are filled by two different models. The **teacher** works the goals the student fails and is recorded. The **student** is the model the skill is meant to help. The teacher is Claude Sonnet (`claude-sonnet-5-5`) and the student is Claude Haiku (`claude-haiku-4-5-20251001`).

Calibration measures each model's unaided success on every goal in the experiment's goal set, 5 trials per model, world and goal, with no recording and no skill. It assigns the roles by a rule fixed before it runs:

- A goal on which the student succeeds in at most 1 of 5 trials (20%) is a **gap goal**.
- A goal on which the student succeeds in at least 4 of 5 (80%) is a **solved goal**.
- A goal with 2 or 3 successes is **ambiguous**. It plays no role-bearing part and is reported.
- Held-out goals are chosen before calibration and are measured but not assigned. A held-out goal that proves solved leaves transfer unmeasurable for that experiment (the ceiling), and the report says so.

An experiment needs at least one gap goal; without one there is nothing for a skill to repair. The teacher is not gated on any goal it will not be recorded on; the solver proves each goal feasible. The teacher must reach the gap goals it is recorded on, since the skill is distilled from those runs, and an experiment whose teacher reaches none ends there. In the faithful world a high solved rate is the expected result, so calibration there is a measurement of where the gaps are.

The gap rule says only that the student has room to improve. Whether a skill can close the gap is shown by the arms, not by calibration, and an experiment in which no arm succeeds reports a floor effect, not a negative result about skills.

If no goal is a gap goal, the world is made harder (a deeper chain, more deviations, or a longer transfer distance) and calibration repeats. The protocol is not loosened to fit the models, and the models are not swapped to fit the world.

### 2.2 Arms

All arms use one base prompt. An arm may add one fixed sentence, which is stored in the run's `prompt.txt`.

| Arm | Model | Help | Recorded to NAMS |
|---|---|---|---|
| T0, teacher on the recorded goals | teacher | none | yes, written by the harness after the run (2.4) |
| S0, student baseline | student | none | no (fresh trials, not the calibration trials) |
| S1, student with skill | student | the reviewed skill, neutral prompt | no |
| S2, student with skill, pointed | student | the reviewed skill, plus the sentence "A skill for this kind of task is available; load it before exploring." | no |

T0 supplies the recordings a skill is distilled from. The teacher's unaided success on a held-out goal is measured in calibration only and is not an arm. S0 uses fresh trials on the same goals and with the same trial count as the skill arms, because a goal chosen for failing in calibration can score better on a second try by chance (regression to the mean), and only a fresh baseline under the same conditions separates that from the skill's effect.

S1 and S2 are separate arms because they measure different things: S1 whether the agent finds the skill, S2 whether the skill helps once the agent has been told to use it.

**Deferred: S3, student with memory (recall on, no skill).** It compares the skill against plain recall. The hooks both recall and record, so an S3 trial run under them would write into the workspace the next trial recalls from. With hooks off in every run (2.4), the harness could instead perform the recall itself through the REST API before the run and place the result in the prompt, leaving the workspace untouched. That mechanism is untested; the arm joins the table once it is (see "Not decided"). The first experiment runs T0, S0, S1 and S2.

### 2.3 Worlds, roles, routes and transfer

**Prior fit.** Every experiment names the world's prior fit (constitution, Principle III). Three worlds are derived from one base, crafting recipes inspired by Minecraft (a subset on the 3x3 grid, using recipes that are the same across the versions commonly played, with no edition or version pinned):

- **Faithful**: the source's vocabulary and recipes. It is the control. A model is expected to do well unaided (near the ceiling: almost every run succeeds, so little is left to improve), which bounds how much any skill or memory can add.
- **Perturbed**: the faithful vocabulary with four deviations from the source. Two are *systematic* (a rule applied across recipes, such as a quantity rule, which a skill can abstract and carry to a recipe it never saw). Two are *idiosyncratic* (a change to one recipe, which memory can recall but a rule cannot cover).
- **Invented**: the renamer (the world generator's tool that replaces every item name with an invented one, ADR-001) applied to the base, so no prior applies beyond the game mechanic.

Results are reported per prior fit and never pooled across fits. The first experiment runs the faithful world (spec 003), because it is the control the other worlds are compared against and the base they derive from; the invented world follows, and the perturbed world after it.

**Roles.** Goal roles come from calibration by the rule in 2.1 and are not named by the ADR or fixed by a spec in advance. A spec for an experiment names the goal set and the held-out goals, and the experiment's results decide which goals are gap goals and which are solved.

**Routes.** An experiment declares its route in its summary after calibration (which finds the gaps) and before its first teacher or arm trial, and the arms and measures are the same for both:

- *Escalating*: the teacher is recorded on the gap goals only. The skill is specific to what the student could not do, and teacher cost is paid only for the gaps.
- *Preemptive*: the teacher is recorded on a wider set of goals chosen in advance, whether or not the student fails them.

**Goal families and transfer.** Where a world has related goals (recipes of the same shape that differ in items or quantities, such as the pickaxe tiers or planks from different logs), at least one is held out, so that transfer can be measured. This is *near* transfer. Longer distances (a shapeless recipe to a shaped one, or a deeper chain, as in the pilot's `forge-7`: `glirol` and `vriobeno` to `pluzhouvio`) come later and are reported as their own distance. In the perturbed world the held-out goal's chain contains one systematically deviated recipe that no recorded goal used, though a recorded goal used another recipe governed by the same rule (so only a rule helps) and one idiosyncratically deviated recipe that a recorded goal did use (so only recall helps). Goals carry stock slack, so that an exploratory craft or two leaves the goal reachable.

**Teacher recordings and the distiller's input.** The teacher is recorded on the goals its route names and never on a held-out goal. The experiment records the same fixed number of teacher trials per recorded goal, set before the first run. A skill is distilled from the conversations of the trials that reached their goal: one skill per experiment, generated from a conversations scope over those conversation ids, which the skill's provenance record stores. Trials that did not reach the goal stay in the workspace but are not given to the distiller.

**What each measure shows.** After the skill is installed the student plays three kinds of goal:

- *Repair*: the gap goals. A rise over S0 shows the skill fixes the failure it was distilled from. It does not separate a skill from a memory of the solution, since recalling the teacher's recording might repair as well; that comparison is the deferred memory arm (2.2), and a repair result is reported as repair that is not yet distinguished from memory.
- *No harm*: the solved goals. It shows whether the skill costs calls, time or success where the student already succeeds.
- *Transfer*: the held-out goals. Only this measure shows that the skill generalizes beyond the goals it was built from.

An experiment declares, after calibration and before its first teacher or arm trial, which measure is primary: transfer where a held-out goal has room to improve, repair otherwise. A claim is repeated on a second world (another seed, or another recipe family) before it is stated.

### 2.4 Isolation

Recorded runs use a dedicated NAMS workspace that no development session records to. Only the arms marked recorded write to it.

- **The hooks stay off in every experiment run.** User settings are not loaded (ADR-002), so no run recalls from or writes to NAMS while it plays.
- **The harness records a run after it finishes.** It replays the run's call sequence through the craft server to regenerate the outputs, then writes the conversation, its messages, steps and tool calls through the REST API. Refused calls are written with status `failure`. The teacher's final answer is stored as the closing message, and no other agent text is written.
- The write returns the conversation id, and the run's `score.json` stores it with the workspace id. The hooks' private per-session state file is not read.
- The recording step takes its workspace id and key from the runner, never from a shell that starts a development session. It accepts a workspace id only if it appears in the runner's record of workspaces it created for the current experiment, and refuses the id configured for development sessions (read from the global nams config). A manual recording outside an experiment is refused.
- A new experiment starts from a new managed workspace and ends by deleting it. The experiment runner (a program yet to be built that runs an experiment's arms and trials) creates it with `workspace_create` (managed database mode), waits until its database is active, passes its id to recorded runs as `NAMS_WORKSPACE_ID`, and deletes it with `workspace_delete` after the results, skill packages, run folders and replay bundles (ADR-002) are saved. No call clears a workspace in place, so a fresh workspace is the only clean state, and each one is disposable.
- Creating and deleting a workspace are writes to the account. The runner does them only when an experiment is started with an explicit option, prints the ids, records every id it creates, and refuses to delete any other id, including the development workspace.
- The experiment workspace is a managed workspace (NAMS provisions its own database for it). A sandbox workspace (a shared, time-limited trial database) is unsuitable: the one used in the pilot has an expiry timestamp that has already passed.
- Conversations of recorded runs are not deleted for isolation. Isolation comes from never reusing a retired workspace id: `workspace_delete` is a soft delete, and whether it removes the workspace's contents is not established (see "Not decided").

### 2.5 Metrics and trials

The primary measure is the one the experiment declared (2.3): success within the turn budget (the cap on agent turns) on the held-out goals when transfer is primary, or on the gap goals when repair is. Beside it, success on the other goal kinds and, within one model only (ADR-002), action calls and extra calls over the best run, tokens, time and cost to the goal. For skill arms, whether the agent loaded the skill and after how many calls. In a perturbed world, how many refused or wasted crafts follow the source's recipe where the world deviates from it.

Each arm runs the same fixed number of trials, set before any trial runs and written into the experiment's summary together with the arms, goals, models and budget. Results are the success count and the distribution (minimum, median, maximum) per arm. No difference is claimed between arms that the trial count cannot support.

### 2.6 Skill review: a critic loop

_Amended 2026-10-03: `revise` is performed by a reviser model editing the skill in place, not through NAMS. See Amendments._

A distilled skill is reviewed before any student sees it. The review stands in for a human reviewer and is itself part of the protocol, because distillation output will change as the service does.

**The critic** is a model run separate from the teacher and the student, pinned by id, with a versioned rubric. It reads the skill package (`SKILL.md`, references, provenance) and the list of goals the recordings covered. It is not shown any held-out goal or any evaluation result, so it cannot tune the skill to the test.

**The rubric** asks what a human reviewer would ask:

- Is the skill general or specific to this world and these item names? Is its content a rule that applies across recipes, or a fact about one recipe?
- Does it cover one task or several?
- Can it be decomposed into smaller reusable skills?
- Does it lead with the discovered fact, or replay the teacher's exploration routine?
- Does it record where this world differs from common knowledge, or restate what the model already knows?
- Will its description cause an agent to load it?

**The verdict** is structured: a value per question, an overall `accept`, `revise` or `reject`, the reasons, and proposed revisions.

**On `revise`**, a reviser model edits the skill in place, as local files (see the 2026-10-03 amendment). The loop runs at most three rounds. Each round records the SHA-256 of `SKILL.md`, so every student run names the exact text it had. The loop ends in `accept` (the version students receive), or `reject` (the experiment reports that distillation did not yield a usable skill).

Early on, a human also reads the first skills the critic accepts, as a post-hoc audit of the critic. It is not a gate: students may run on an accepted skill before the audit, and a skill the audit faults is reported, not silently replaced.

## 3. Alternatives Considered

- **Teacher and student are the same model.** Rejected as the main design: it cannot show a stronger model handing work to a weaker one. It remains a useful diagnostic (does a model benefit from its own skill).
- **One with-versus-without comparison.** Rejected: a single skill run cannot tell whether the skill was never found, found late, or useless. S1 and S2 separate those.
- **Record teacher runs with the `nams-hooks` plugin.** Rejected: every recorded run recalls at its start, so later teacher trials draw on entities extracted from earlier ones and are not independent samples; linking a run to its conversation means reading the plugin's private state-file format; and S3's recall cannot be separated from recording. The pilot's REST recording of the same run matched it on trace shape and on the distilled skill.
- **Delete each run's conversation instead of using a separate workspace.** Rejected: the extracted entities and the orphaned reasoning nodes remain after deletion, and recall draws on the entities.
- **Empty one workspace through the API between experiments.** Rejected: conversations and entities can be deleted, but the skill, its version and components, the distillation run and the orphaned tool-call and step nodes cannot, so earlier experiments' artifacts would sit beside the new ones. Entity listing is also capped at 200 per call.
- **Reprovision the workspace's database in place (`workspace_reprovision`).** Rejected for now: two calls on a managed workspace returned success and changed nothing observable over about eight minutes. It would keep one workspace id across experiments, so it is worth retrying if NAMS fixes it.
- **Goal roles fixed in advance.** Rejected: in the faithful world the goal an author would have held out (the iron pickaxe) was already solved by the student, and its gap was on another. Roles come from a baseline measured before any skill is built.
- **One route only (preemptive, or escalating).** Rejected: they answer different questions. Preemptive asks what a skill adds when it is built broadly, and escalating asks what it adds when it is built only for observed failures. The arms and measures are identical, so an experiment declares its route and nothing else changes.
- **Reuse the calibration trials as the student baseline.** Rejected: gap goals are chosen for failing, so their calibration scores overstate the failure (regression to the mean). S0 uses fresh trials.
- **Invented worlds only.** Rejected: no real process lacks a prior, and results from invented names cannot say what a skill adds beyond what the model knows.
- **Faithful worlds only.** Rejected: a model that already knows the recipes leaves nothing for a skill to close, so the effect would sit at the ceiling.
- **Rely on NAMS's grounding and coverage gates alone.** Rejected: the pilot skill scored 1.0 on both and agents barely loaded it. The gates check that steps trace back to the memory, not that the skill helps.
- **Human review only.** Rejected: too slow and unrepeatable at the number of skills an experiment produces. A human audits the first accepted skills (2.6).
- **No review.** Rejected: the raw skill replays the teacher's routine, so results would measure the distiller's current behaviour, not the idea.
- **Tell every arm about skills.** Rejected as the only condition: a prompt that names the skill removes the question of whether the skill is discoverable.

## 4. Consequences

- **Cost.** The escalating route spends teacher time only on the gaps, and the preemptive route on the whole recorded set; which is cheaper overall depends on how often the student fails. Pilot runs on a Sonnet-class model cost $0.14 to $0.37 each. An experiment of three student arms (S0, S1, S2) with an assumed ten trials on two goals is about 60 student runs per world, plus teacher recordings, critic rounds and calibration, roughly $15 to $40 at those rates. Haiku student runs cost less than the Sonnet rates above, which lowers it. The first experiment runs the faithful world, so the cost of the invented and perturbed worlds is incurred only after the control is established.
- **One workspace per experiment, created and deleted by the runner.** An experiment pays for a workspace creation (about 30 seconds in a test) and treats the workspace as gone afterwards, so skill packages, run folders and bundles are exported before deletion. The account's workspace limit, and whether soft-deleted workspaces count against it, are unknown. The key in use is an account-wide admin key, so the same tools could delete the development workspace; the runner's rule that it deletes only ids it created is the protection. A key bound to one workspace would suit the recorded runs better, but creating and deleting workspaces needs the admin scope, which a workspace-bound key does not carry.
- **Minecraft vocabulary in published bundles.** Faithful and perturbed worlds use Minecraft-inspired item names and recipes, and replay bundles (ADR-002) are meant to be hosted publicly. Minecraft is a trademark of its owner. The worlds credit the game as inspiration in documentation, claim no affiliation, and avoid naming an edition. Item names are mostly common words and recipes are facts about a game, but the spec confirms the usage terms before bundles of those worlds are published.
- **Comparisons across NAMS versions need records.** Each experiment stores the NAMS capabilities response (thresholds, enabled features) and each run the skill fingerprint, since the service changes.
- **The critic is a model.** It may share blind spots with the teacher. The first accepted skills are read by a human for that reason.
- **Follow-up specs:**
  - recording a finished run to NAMS through the REST API (replay, write, conversation linkage, with the recording guard), and the workspace lifecycle (create, wait until active, delete, with the delete guard): built for the critic loop's candidate step (spec 005), not yet for the experiment runner;
  - the critic loop: built (spec 005);
  - an experiment runner that runs calibration, assigns goal roles by the rule, runs the arms and trials, writes the pre-run summary (including the declared route and primary measure) and aggregates the results;
  - observer support for arm, model, skill and prior fit;
  - world design and generation: the Minecraft-inspired base subset, keeping names, applying the deviation rules, goal families and stock slack (the generator today only renames and nudges single recipes);
  - a tractable invented world: recipes of one pattern with different parameters (such as `2×A → X` and `3×B → Y`), a smaller table or the `partial` hint level to make discovery a hill-climb, and a calibration that shows the teacher reaching the goals while the student mostly fails (the renamed Minecraft-inspired world is at the floor and cannot do this);
  - the critic's output schema (settled in spec 005), and the remaining `AGENTS.md` description of `NAMS_WORKSPACE_ID` as one dedicated workspace (updated for the critic loop; the experiment runner still has to replace it).

**Not decided here:**

- the trial count of the experiment arms, including the number of teacher trials per recorded goal;
- the turn budget for experiments other than the first (the faithful-world experiment used 80);
- how a real workflow would detect that the student failed (the simulation reads the game state, a perfect signal), and the cost comparison between routes as a metric;
- what to do with an ambiguous goal beyond reporting it;
- the four deviations of the perturbed world, and the subset, goal families and slack of worlds other than the faithful one (the faithful world fixed 13 items, 10 recipes, the pickaxe family and slack 3);
- whether the critic's rubric lives in a file or in its prompt (decided in spec 005: a versioned file, together with the roles' instructions);
- the mechanism for the deferred arm S3: harness-performed recall placed in the prompt is the candidate, untested;
- whether REST-written and hooks-written recordings keep extracting equivalently over more runs, and how NAMS stores a refused call, which the one test run (no refusals) could not show;
- the wording of the S2 sentence for experiments other than the first (the faithful-world experiment fixed ADR-003's sentence: "A skill for this kind of task is available; load it before exploring.");
- whether soft-deleted workspaces count against the account's workspace limit, and whether `workspace_delete` removes a workspace's data or only hides it (in the test, its endpoints still answered with empty lists);
- what teacher material makes NAMS keep domain content in a distilled skill. Efficient, error-free runs distilled to a skill with no recipe in the faithful world (spec 003), so the recorded runs may need contrast (failed attempts beside a success), or the skill may need to come from the student's own successful runs;
- whether `workspace_reprovision` can be made to work, which would keep one workspace id across experiments;
- when a sandbox workspace's expiry is enforced (the pilot's expired on 2026-09-29 and still works).

## 5. Related

- ADRs: [ADR-001](ADR-001-crafting-table-world.md) (worlds, goals and the run log), [ADR-002](ADR-002-client-otel-trace.md) (measuring time, tokens and cost, and exporting runs).
- Supersedes in part: ADR-002 §2.2 on recording. Experiment runs no longer load user settings so that the hooks record (`--record` as ADR-002 defines it); the harness records a finished run itself (2.4). ADR-002 carries the matching amendment.
- Rules: constitution Principle III (prior fit, version 1.1.0) and the 2026-10-01 amendment to ADR-001, which define the three kinds of world.
- Design notes: `design/notes/critic-loop-spike.md` and `design/notes/critic-loop-findings.md` (the critic loop run once, with its results), `design/notes/skill-pilot.md` (the pilot's evidence, including the tests of clearing a workspace), `design/notes/agent-player-options.md` (the options this decision replaces).
- Specs: _(populated automatically by the speckit ADR-link hook once `/speckit-specify` references this ADR)_

## 6. Amendments

- **2026-10-01, the faithful world runs first.** Section 2.3 and the cost note said the first experiment
  would run the invented world. It now runs the faithful world (spec 003), with every arm, because that
  world is the control the others are compared against and the base from which both derive. The invented
  world follows, then the perturbed world. The rest of the protocol is unchanged.
- **2026-10-01, no game version pinned.** The faithful base uses recipes that are the same across the
  versions commonly played and names no edition or version, credits the game as inspiration in
  documentation, and claims no affiliation. See the matching entry in ADR-001 and constitution
  Principle III (1.1.1).
- **2026-10-01, goal roles from measurement, and two routes.** Sections 2.1 to 2.5 fixed learn and held-out
  goals in advance and made the held-out goal the primary measure. Calibration in the faithful world (spec
  003) showed the student already solved the goal chosen as held-out, and failed one chosen as a lesson. The
  protocol now assigns roles by a rule applied to the student's unaided baseline (gap, solved or ambiguous),
  keeps held-out goals set aside before any teacher run, declares a route (escalating or preemptive) and a
  primary measure (transfer or repair) per experiment, reports repair, no-harm and transfer separately, and
  requires fresh baseline trials. The arms, isolation and review are unchanged.
- **2026-10-01, the renamed faithful world cannot host the invented experiment.** Unaided calibration of the
  invented counterpart in spec 003 gave 0 of 30 trials for both models, against 24 of 30 in the faithful
  world, because brute-force discovery of five-cell shaped recipes is out of reach. The teacher cannot
  reach its goals there, so no recordings exist to distil from. Section 2.3's expectation that the invented
  world follows the faithful one now depends on a simpler invented world (see the follow-up specs in
  section 4); the counterpart serves as a bound for the prior fit and nothing more.
- **2026-10-01, a skill that passes the gates can be empty.** In the faithful world (spec 003) the escalating
  route recorded Sonnet on the student's gap goal, three runs of 11 action calls each with no refusals. NAMS
  distilled skills from them that pass the gates (grounding 1.0, coverage 1.0 in graph format for each run
  alone and in prose for the three together; the three together in graph format failed coverage at 0.50) but
  contain no recipe. Review rejected them, so no skill arm ran. Coverage measures recurring patterns, which a
  generic workflow satisfies, so the review step of 2.6 is what decides whether a skill is worth testing, as
  the Context already says. Teacher material with contrast is now an open question (see "Not decided").
  Results: `design/notes/faithful-control-results.md`.
- **2026-10-01, values the first experiment fixed.** The faithful-world experiment (spec 003) used a turn
  budget of 80, 5 calibration trials per model and goal, the escalating route with repair as the primary
  measure, 3 teacher trials per recorded goal, planned arm trials of 10 per gap goal and 3 per solved or
  held-out goal, a spend limit of $60, and the S2 sentence in 2.2. The world is 13 items and 10 recipes with
  the pickaxe family and slack of 3 on every goal. The arm trials were not run.
- **2026-10-03, the critic's revision is an in-place edit by a model, not a NAMS operation.** Section 2.6 had
  `revise` act through NAMS: re-distilling with `skillId`, `focusEntityIds`, `nameHint` or `procedureFormat`, the
  validated edit endpoint, or `extract-subprocedure`. This project demonstrates the concept of distilling a
  skill from memory traces, and where the revision happens matters less than learning what each stage adds or
  misses, so the loop now works as follows. The distiller produces the first skill. A *reviser* model then
  edits a local copy of the skill folder in place, as files, guided by the critic's verdict and the
  recordings. NAMS is still the memory (recordings, including procedural memory) and the source of the initial
  candidate skill; its revision operations are not used. A revised skill is local to the run and is never
  published back, since the experiment's workspaces are disposable. The rest of 2.6 stands: a critic separate from the teacher and the student, pinned by
  id with a versioned rubric; a structured verdict of `accept`, `revise` or `reject`; at most three rounds;
  the loop ends in `accept` (the version students receive) or `reject` (the experiment reports that no usable
  skill was obtained).
  - **Separate contexts.** Critic and reviser are separate runs. Each round's critic is fresh, with no sight of
    earlier rounds' verdicts, so it cannot grade its own earlier edit.
  - **What each may read.** Recordings and skill text only; the critic also gets the list of goals the
    recordings covered. Neither reads the world file, recipes, the solver's output, a held-out goal or any
    evaluation result. A fact a reviser adds is therefore a fact the recordings held.
  - **Rules for the reviser.** Every added fact cites the recorded call it came from. What the recordings do
    not show is stated as not known, with a cheap way to find out, never as fact. The skill leads with the
    discovered fact and drops generic advice a capable model already follows. The description says when to
    load the skill, without a tool-name prefix.
  - **What a round records.** The skill text, its SHA-256, the critic's verdict and the diff to the previous
    round; the student's run records the SHA-256 of the text it had (unchanged).
  - **A rubric question the recordings cannot answer.** "Does it record where this world differs from common
    knowledge" cannot be judged from a teacher's recordings when the teacher made no exploratory calls, since
    nothing shows what it knew beforehand. The critic answers that it cannot be determined from the
    recordings, and does not guess; the reviser does not add such a claim from outside knowledge.
  - **Why.** In one pass over the faithful-world recordings, the distilled skills held no recipe although the
    recordings did, and three rounds of in-place revision produced a skill the critic accepted. The student
    (Haiku, three trials per skill, plain prompt, unrecorded) reached `stone_pickaxe` 0 of 3 with the prose
    distilled skill (critic: reject), 1 of 3 with the graph distilled skill (revise) and 3 of 3 at the best
    run's call count with the revised skill (accept). A fresh critic caught a factual error the reviser had
    introduced in round 1. The revision also changed the description, and the student loaded the revised skill
    within 3 calls where it loaded the originals late, so the gain is not yet split between content and
    description. Results: `design/notes/critic-loop-findings.md`.
  - **Still to do.** A person audits the first accepted skills after the fact, as 2.6 says (it is not a gate); none has yet. The critic's
    rubric location and output schema remain open (see "Not decided" and the follow-up specs).
- **2026-10-03, the critic loop's roles have no tools and answer in a schema.** The critic and the reviser run as
  sessions with no tools, no MCP servers and no user settings. The harness puts the recordings and the skill text in
  the prompt and reads back a schema-checked object: for the critic, a verdict; for the reviser, the revised files as
  text, which the harness writes. A role therefore cannot read the world, the goals, the solver's output or an earlier
  verdict, so the blindness §2.6 asks for holds by construction. They run through their own seam (`RoleDriver`), next
  to `AgentDriver`, implemented in the one file that imports the SDK. The rubric lives in a versioned file together
  with the roles' instructions, and its version and hash are recorded with every verdict. Where model-authored text may
  be stored is settled in the matching amendment to ADR-002. Spec 005 implements this.
