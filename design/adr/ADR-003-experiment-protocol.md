---
id: ADR-003
title: Experiment protocol: arms, models, isolation and skill review
status: proposed
created: 2026-10-01
specs: []
---

# ADR-003: Experiment protocol: arms, models, isolation and skill review

## 1. Context

The demo's claim is that a skill distilled from a strong model's recorded runs lets a smaller model finish a task it cannot finish alone. Testing it needs comparisons across models and conditions (called *arms* below) that are repeatable, kept apart from one another, and measured the same way. A pilot on one generated world (`forge-7`) and one goal showed four things that shape the protocol.

**Single runs say little.** The same model on the same goal took 67 action calls without reaching it, and 96 calls reaching it. With a skill installed, three runs took 69 calls (reached), 76 (not reached) and 49 (reached). The best possible run is 3 calls. Neither a with-versus-without pair nor a three-run batch can separate an effect from luck.

**Recall leaks from development sessions.** The `nams-hooks` plugin for Claude Code records each session to a Neo4j Agent Memory (NAMS) workspace and, at the start of a session, recalls: it searches the workspace's entities for matches to the first prompt. In the shared workspace, the matches came from the design sessions recorded there. One stated that the goal needs "one craft in the best run". Deleting a conversation removes it and its messages, not what was extracted from it: the entity count rose after two experiment conversations were deleted, and a graph query on a test workspace found a deleted conversation's tool-call and step nodes still present as orphans.

**No call clears a workspace in place.** On a throwaway workspace holding a conversation with its reasoning trace, entities, a distilled skill and its run, the API could delete the conversations and every entity (the entity list returns at most 200 per call, so deletion repeats until the list is empty). It could not delete the skill, its version and components, the distillation run, or the orphaned tool-call and step nodes, because no endpoint exists for them. The MCP tool `workspace_reprovision`, documented as replacing a managed workspace's database with a fresh one, returned success twice and changed nothing observable over about eight minutes: the same database host, all data intact. Creating a managed workspace with `workspace_create` produced an active one in about 30 seconds, and `workspace_delete` removed one from the account's workspace list.

**A skill that passes NAMS's checks can still be unhelpful.** The skill distilled from one successful run scored grounding 1.0 and coverage 1.0 (gates 0.9 and 0.6). Its steps replay the teacher's exploration routine (read help, check inventory, place, clear, remove). The recipe it did capture, two `lugli` side by side in the top row, sits in the *why* line of the last step. In three runs the agent loaded the skill late (after 47 calls, then solved in two), never, or at an unrecorded point. The harness prompt told the agent to "use only the craft tools" and to "explore", and the skill's description began with a tool name. NAMS skill distillation is an early service whose output will change between versions.

**The pieces for a protocol exist.** Worlds are generated data with warm-up, middle and held-out goals (`forge-7`: `glirol` needs 1 craft and 3 calls, `vriobeno` 2 crafts and 5 calls, `pluzhouvio` 7 crafts and 22 calls with no slack). The harness runs Claude Code through the Agent SDK, scores a run by replaying its log, measures time, tokens and cost, records which model ran, and installs a skill folder into a run (ADR-001 and ADR-002 define the world, the run log and the measurement).

## 2. Decision

### 2.1 Players and models

The player is Claude Code through the Agent SDK, as the harness already runs it. Every run pins its model by id; no run uses a default.

Two roles are filled by two different models. The **teacher** works the learn goals and is recorded. The **student** is the model the skill is meant to help. A pair is chosen by calibration: each candidate model plays the held-out goal with no help for the same number of trials, then the student is the smallest model that mostly fails it and the teacher is a stronger model that mostly succeeds. Calibration runs are not recorded and install no skill.

If no pair shows a gap, the world is made harder (a deeper recipe chain, generated from a new seed) and calibration repeats. The protocol is not loosened to fit the models.

### 2.2 Arms

All arms use one base prompt. An arm may add one fixed sentence, which is stored in the run's `prompt.txt`.

| Arm | Model | Help | Recorded to NAMS |
|---|---|---|---|
| T0, teacher baseline | teacher | none | yes (the source of recordings) |
| S0, student baseline | student | none | no |
| S1, student with skill | student | the reviewed skill, neutral prompt | no |
| S2, student with skill, pointed | student | the reviewed skill, plus the sentence "A skill for this kind of task is available; load it before exploring." | no |

S1 and S2 are separate arms because they measure different things: S1 whether the agent finds the skill, S2 whether the skill helps once the agent has been told to use it.

**Deferred: S3, student with memory (recall on, no skill).** It compares the skill against plain recall, but the hooks both recall and record, so an S3 trial would write into the workspace the next trial recalls from. It joins the table once a mechanism is chosen (see "Not decided"). The first experiment runs T0, S0, S1 and S2.

### 2.3 Goals and transfer

The teacher is recorded on the learn goals (warm-up and middle) and never on the held-out goal. The experiment records the same fixed number of teacher trials per learn goal, set before the first run. A skill is distilled from the conversations of the trials that reached their goal: one skill per experiment, generated with `scope.type: conversations` over those conversation ids, which the skill's provenance record stores. Trials that did not reach the goal stay in the workspace but are not given to the distiller. Students play the held-out goal as the primary measure, and the learn goals as a sanity check. A result on a learn goal shows that the skill holds the recipe; only a held-out result shows transfer. One generated world is used per experiment, and a claim is repeated on a second world from another seed before it is stated.

### 2.4 Isolation

Recorded runs use a dedicated NAMS workspace that no development session records to. Only the arms marked recorded write to it.

- The harness passes `NAMS_WORKSPACE_ID` (and the key) to the recorded run's process only, never to a shell that starts a development session.
- Each recorded run's `score.json` stores its NAMS conversation id and workspace id, read from the hooks' per-session state file.
- `--record` accepts a workspace id only if it appears in the runner's record of workspaces it created for the current experiment, and refuses the id configured for development sessions (read from the global nams config). A manual `--record` outside an experiment is refused.
- A new experiment starts from a new managed workspace and ends by deleting it. The experiment runner creates it with `workspace_create` (managed database mode), waits until its database is active, passes its id to recorded runs as `NAMS_WORKSPACE_ID`, and deletes it with `workspace_delete` after the results, skill packages, run folders and bundles are saved. No call clears a workspace in place, so a fresh workspace is the only clean state, and each one is disposable.
- Creating and deleting a workspace are writes to the account. The runner does them only when an experiment is started with an explicit option, prints the ids, records every id it creates, and refuses to delete any other id, including the development workspace.
- The experiment workspace is a managed workspace (NAMS provisions its own database for it). A sandbox workspace (a shared, time-limited trial database) is unsuitable: the one used in the pilot has an expiry timestamp that has already passed.
- Conversations of recorded runs are not deleted for isolation; deleting the workspace removes them with everything else.

### 2.5 Metrics and trials

The primary measure is success on the held-out goal within the turn budget. Beside it, within one model only (ADR-002): action calls and extra calls over the best run, tokens, time and cost to the goal. For skill arms, whether the agent loaded the skill and after how many calls.

Each arm runs the same fixed number of trials, set before any trial runs and written into the experiment's summary together with the arms, goals, models and budget. Results are the success count and the distribution (minimum, median, maximum) per arm. No difference is claimed between arms that the trial count cannot support.

### 2.6 Skill review: a critic loop

A distilled skill is reviewed before any student sees it. The review stands in for a human reviewer and is itself part of the protocol, because distillation output will change as the service does.

**The critic** is a model run separate from the teacher and the student, pinned by id, with a versioned rubric. It reads the skill package (`SKILL.md`, references, provenance) and the list of learn goals the recordings covered. It is not shown the held-out goal or any evaluation result, so it cannot tune the skill to the test.

**The rubric** asks what a human reviewer would ask:

- Is the skill general or specific to this world and these item names?
- Does it cover one task or several?
- Can it be decomposed into smaller reusable skills?
- Does it lead with the discovered fact, or replay the teacher's exploration routine?
- Will its description cause an agent to load it?

**The verdict** is structured: a value per question, an overall `accept`, `revise` or `reject`, the reasons, and proposed revisions.

**On `revise`**, the loop acts through NAMS: re-distilling (`skillId`, `focusEntityIds`, `nameHint`, `procedureFormat`), a validated edit (`POST /v1/skills/{id}/edit`), or `extract-subprocedure` to decompose. The loop runs at most three rounds. Each round records the skill version id and the SHA-256 of `SKILL.md`, so every student run names the exact text it had. The loop ends in `accept` (the version students receive), or `reject` (the experiment reports that distillation did not yield a usable skill).

**Approving and publishing** in NAMS stay human actions. Early on, a human also reads the first skills the critic accepts, to check the critic.

## 3. Alternatives Considered

- **Teacher and student are the same model.** Rejected as the main design: it cannot show a stronger model handing work to a weaker one. It remains a useful diagnostic (does a model benefit from its own skill).
- **One with-versus-without comparison.** Rejected: a single skill run cannot tell whether the skill was never found, found late, or useless. S1 and S2 separate those.
- **Delete each run's conversation instead of using a separate workspace.** Rejected: the extracted entities and the orphaned reasoning nodes remain after deletion, and recall draws on the entities.
- **Empty one workspace through the API between experiments.** Rejected: conversations and entities can be deleted, but the skill, its version and components, the distillation run and the orphaned tool-call and step nodes cannot, so earlier experiments' artifacts would sit beside the new ones. Entity listing is also capped at 200 per call.
- **Reprovision the workspace's database in place (`workspace_reprovision`).** Rejected for now: two calls on a managed workspace returned success and changed nothing observable over about eight minutes. It would keep one workspace id across experiments, so it is worth retrying if NAMS fixes it.
- **Rely on NAMS's grounding and coverage gates alone.** Rejected: the pilot skill scored 1.0 on both and agents barely loaded it. The gates check that steps trace back to the memory, not that the skill helps.
- **Human review only.** Rejected: too slow and unrepeatable at the number of skills an experiment produces. A human keeps the approve and publish step.
- **No review.** Rejected: the raw skill replays the teacher's routine, so results would measure the distiller's current behaviour, not the idea.
- **Tell every arm about skills.** Rejected as the only condition: a prompt that names the skill removes the question of whether the skill is discoverable.

## 4. Consequences

- **Cost.** Pilot runs on a Sonnet-class model cost $0.14 to $0.37 each. An experiment of three student arms (S0, S1, S2) with ten trials on two goals is about 60 student runs, plus teacher recordings, critic rounds and calibration, roughly $15 to $40 at those rates. A cheaper student lowers it.
- **One workspace per experiment, created and deleted by the runner.** An experiment pays for a workspace creation (about 30 seconds in a test) and loses whatever it did not save, so skill packages, run folders and bundles are exported before deletion. The account's workspace limit, and whether soft-deleted workspaces count against it, are unknown. The key in use is an account-wide admin key, so the same tools could delete the development workspace; the runner's rule that it deletes only ids it created is the protection. A key bound to one workspace would suit the recorded runs better, but creating and deleting workspaces needs the admin scope, which a workspace-bound key does not carry.
- **Comparisons across NAMS versions need records.** Each experiment stores the NAMS capabilities response (thresholds, enabled features) and each run the skill fingerprint, since the service changes.
- **The critic is a model.** It may share blind spots with the teacher. The first accepted skills are read by a human for that reason.
- **Follow-up specs:**
  - run-to-conversation linkage, with the recording guard, and the workspace lifecycle (create, wait until active, delete, with the delete guard);
  - the critic loop;
  - an experiment runner that runs the arms and trials, writes the pre-run summary and aggregates the results;
  - observer support for arm, model and skill;
  - the critic's output schema, and updating `AGENTS.md`, which still describes `NAMS_WORKSPACE_ID` as one dedicated workspace.

**Not decided here:**

- the exact teacher and student models, which calibration settles;
- the trial count, including the number of teacher trials per learn goal;
- the turn budget shared by all arms;
- whether the critic's rubric lives in a file or in its prompt;
- the mechanism for the deferred arm S3: reading recorded memory without its own trials writing to the workspace, which may need a snapshot or a separate workspace per trial;
- the wording of the S2 sentence, to be fixed before the first trial;
- whether soft-deleted workspaces count against the account's workspace limit;
- whether `workspace_reprovision` can be made to work, which would keep one workspace id across experiments;
- when a sandbox workspace's expiry is enforced (the pilot's expired on 2026-09-29 and still works).

## 5. Related

- ADRs: [ADR-001](ADR-001-crafting-table-world.md) (worlds, goals and the run log), [ADR-002](ADR-002-client-otel-trace.md) (measuring time, tokens and cost, and exporting runs).
- Design notes: `design/notes/skill-pilot.md` (the pilot's evidence, including the tests of clearing a workspace), `design/notes/agent-player-options.md` (the options this decision replaces).
- Specs: _(populated automatically by the speckit ADR-link hook once `/speckit-specify` references this ADR)_
