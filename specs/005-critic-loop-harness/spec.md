# Feature Specification: Critic Loop in the Harness

**Feature Branch**: `005-critic-loop-harness`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: "ADR-003: add the critic loop to the harness (§2.6, as amended 2026-10-03)"

**Derived From**: ADR-003 (design/adr/ADR-003-experiment-protocol.md)

## Clarifications

### Session 2026-10-03

- Q: Should the loop start from one finished teacher run or from several runs of the same goal? → A: One or more runs of the same goal, all recorded to the same workspace and distilled together.
- Q: Which model should play the critic and the reviser? → A: A setting per loop, recorded in the loop record, defaulting to the teacher's model.
- Q: If the distiller's own quality gates reject the candidate, should the harness stop or retry with a different setting? → A: Stop: report the failure and the distiller's reasons, and the loop ends in `reject`; the runner may start again with another setting.

## User Scenarios & Testing *(mandatory)*

The people who use this feature are the **experiment runner**, who has finished runs of a strong model
(the *teacher*) and wants a skill a smaller model (the *student*) can load; the **auditor**, who checks
what the loop did and why a skill was accepted or rejected; and the **reader of the findings**, who learns
from the loop's records what a distilled skill lacked and what a revision added.

Today this is done by hand. A spike (`spikes/critic-loop/`) showed the loop works: a skill distilled from
a teacher's recordings held no recipe, three rounds of review and in-place revision produced one the
student used to reach the goal, and a fresh critic caught an error the reviser had made. That spike ran
as separate agents writing files, with a person starting each step. This feature makes the loop a
repeatable part of the harness. It implements ADR-003 §2.4 (isolation), §2.6 (the critic loop) and the
2026-10-03 amendment.

The **critic** and the **reviser** are models run through the harness, each in its own session. The
**distiller** is the memory service that produces the first candidate skill from recorded runs. A
**recording** is a run's calls and what came back, as the agent saw them. A **round** is one critic review
and, if the verdict is `revise`, one revision.

### User Story 1 - Get a candidate skill from finished runs (Priority: P1)

The experiment runner points the harness at one or more finished teacher runs of the same goal in the
same world. The harness records the runs to a
disposable workspace in the memory service, waits until the recording is processed, asks the distiller
for a skill, downloads it into a local skill folder, and retires the workspace. The runner does none of
these steps by hand.

**Why this priority**: Without a candidate there is nothing to review. Today this is a set of spike scripts
and manual calls, and it is the part of the loop that depends on an outside service.

**Independent Test**: Run the step with a scripted stand-in for the memory service. Finished runs go in,
a skill folder comes out, and the stand-in saw the writes, the generation request and the deletion of the
workspace the run created, and no other workspace.

**Acceptance Scenarios**:

1. **Given** one or more finished teacher runs of the same goal, each with a matched trace, **When** the
   runner asks for a candidate skill, **Then** every run is recorded in the same new workspace the harness
   created, a skill is generated from those recordings together, and its folder is saved locally with a record of which runs, workspace and service version it came from.
2. **Given** the workspace the harness created, **When** the step ends for any reason (success, a failed
   generation, an interruption), **Then** that workspace is deleted, and nothing but that workspace is deleted.
3. **Given** a workspace id that the harness did not create (including the one configured for development
   sessions), **When** anything asks to delete it or to record into it, **Then** the request is refused.
4. **Given** any of the runs has a recording that would not replay on a fresh game (the log does not match the
   world), **When** the runner asks for a candidate skill, **Then** the step stops with a clear error and writes nothing to the service.
5. **Given** runs of different goals or in different worlds, **When** the runner asks for a candidate skill,
   **Then** the step refuses them before creating a workspace.
6. **Given** the distiller returns no skill (for example, its own quality gates fail), **When** the step
   ends, **Then** the result says no candidate was produced and gives the distiller's reasons, the harness does not retry, and the loop ends in `reject`.

---

### User Story 2 - Review and revise a candidate until it is accepted or rejected (Priority: P1)

Given a candidate skill folder and the recordings it came from, the harness runs up to three rounds. In
each round a critic reviews the skill against a fixed list of questions and returns a verdict of `accept`,
`revise` or `reject`, with reasons and proposed revisions. On `revise`, a reviser edits a local copy of
the skill in place and the next round begins with a fresh critic. The loop ends when a critic accepts,
rejects, or the third round ends without acceptance.

**Why this priority**: This is the feature. It turns a thin distilled skill into one a student can use, or
reports that it could not.

**Independent Test**: Run the loop with scripted critic and reviser. The sequence of verdicts decides how
many rounds run and how the loop ends, with no model call.

**Acceptance Scenarios**:

1. **Given** a critic that accepts in round 1, **When** the loop runs, **Then** it ends after one round
   with the skill unchanged and the outcome `accept`.
2. **Given** a critic that returns `revise` twice and `accept` in round 3, **When** the loop runs, **Then**
   two revisions are made, the loop ends in `accept`, and the final skill is the revised text.
3. **Given** a critic that returns `revise` in all three rounds, **When** the loop runs, **Then** it ends
   with the outcome `reject` and says the round limit was reached.
4. **Given** a critic that returns `reject` in any round, **When** the loop runs, **Then** it ends at once
   with the outcome `reject` and the critic's reasons.
5. **Given** a critic whose answer does not match the verdict shape, **When** the round runs, **Then** the
   loop stops with a typed error in the form `code: fixed message`, and never writes the critic's own text into the error.
6. **Given** round N's critic, **When** its inputs are assembled, **Then** they hold the current skill,
   the recordings and the goals the recordings cover, and no earlier verdict, no earlier round's text and
   nothing about the world, the solver, a held-out goal or any evaluation result.

---

### User Story 3 - Keep what the loop did auditable (Priority: P2)

The auditor opens the loop's record and can see, for each round, the exact skill text (by hash), the
critic's verdict and the diff to the previous round, and for each fact the reviser added, the recorded
call it came from. The skill the student reads holds the recipe and how to use it, and none of the
citations: those are in a separate provenance file kept with the skill.

**Why this priority**: The loop's value to a reader is what each stage added or missed. Without the
record, the result is a skill with no account of where it came from.

**Independent Test**: Run the loop with scripted roles and read the record. Every round has a hash, a
verdict and a diff; the final skill's main file contains no run or call citations; the provenance file does.

**Acceptance Scenarios**:

1. **Given** a loop that ran two rounds, **When** the auditor reads its record, **Then** each round lists
   the hash of its skill text, the critic's verdict and, for revised rounds, the diff to the round before.
2. **Given** a reviser that adds a fact, **When** the revision is saved, **Then** the provenance file names
   the recorded call the fact came from, and the skill's main file does not.
3. **Given** a round's skill text, **When** its hash is computed, **Then** it matches the hash in the record.
4. **Given** the loop's record, **When** the privacy test runs, **Then** agent-authored text appears only
   in the places the harness designates for it, and nowhere in a run's trace, summary or exported bundle.

---

### User Story 4 - Use the accepted skill for a student run (Priority: P2)

The runner starts a student run with the accepted skill installed through the harness's existing skill
option. The run's score names the hash of the skill text it had.

**Why this priority**: The loop is only useful if its result can be tried. The installing mechanism
already exists; this story checks the loop's output fits it.

**Independent Test**: Install a loop's accepted skill in a dry run and confirm the plan names the skill and
its hash. A rejected loop leaves nothing to install and says so.

**Acceptance Scenarios**:

1. **Given** a loop that ended in `accept`, **When** the runner installs its skill, **Then** the student
   run starts with that folder and its result reports the skill's hash and whether and when the skill was loaded.
2. **Given** a loop that ended in `reject`, **When** the runner asks for its skill, **Then** the request is
   refused and the record says why.

---

### Edge Cases

- The memory service is slow, unavailable or returns an error mid-step: the step stops with a typed error and deletes the workspace it created.
- Processing of the recording does not finish within the allowed wait: the step ends as a timeout, not as an empty skill.
- The run is interrupted (Ctrl-C) during the loop: the current round ends, the record is written for the rounds that finished, and the workspace is retired.
- The reviser's edit leaves the skill invalid (no description, no body): the round ends as an error, not as `revise`.
- The reviser adds a fact it cannot cite to a recorded call: the provenance file marks it uncited, and the next critic is asked to judge it.
- The critic, asked how the world differs from common knowledge, cannot tell from the recordings: it says so, and the verdict does not penalise the skill for it.
- The candidate is already accepted in round 1: no revision is made and the skill is passed on unchanged.
- A recording holds refused calls: they are written with a failure status, and the critic sees them.
- The recordings come from more than one teacher model and no critic or reviser model is set: the loop refuses to start and asks for one.
- The same step is run twice on the same runs: each makes a new workspace and neither reuses nor deletes the other's.

## Requirements *(mandatory)*

### Functional Requirements

**Recording and the candidate skill**

- **FR-001**: The harness MUST accept one or more finished runs of the same goal in the same world, and write
  each run's recording to one workspace the harness created for that purpose, regenerating each call's output
  by replaying the run's call sequence on a fresh game. It MUST refuse, before creating a workspace, runs of
  different goals or worlds, and any run whose log does not replay or whose trace does not match its log.
- **FR-002**: The recording MUST contain the run's prompt, the calls with input, output, status and
  duration, and the final answer, and no other agent text.
- **FR-003**: The harness MUST create, wait for and delete the workspace itself, record every id it creates,
  and MUST refuse to record into or delete any id it did not create, including the id configured for
  development sessions.
- **FR-004**: The workspace MUST be deleted when the step ends for any reason, including errors and interruption.
- **FR-005**: Creating or deleting a workspace MUST happen only when the runner starts the step with an
  explicit option, and the harness MUST print every id it creates.
- **FR-006**: The harness MUST request a single skill from all the recordings together, wait for it to finish, download it into a
  local skill folder, and save with it the runs, the workspace id, the service's reported thresholds and the skill's hash.
- **FR-007**: When no skill is produced (including when the distiller's own quality gates reject it), the harness
  MUST stop, report that and the distiller's reasons, and end the loop in `reject`. It MUST NOT retry on its own.
  The runner MAY start again with a different distiller setting (such as the output format); each start records
  the setting it used.

**The loop**

- **FR-008**: The loop MUST run at most three rounds. Each round is a critic review and, on `revise`, one
  revision. The loop MUST end in exactly one of `accept` (the skill the students receive) or `reject`.
- **FR-009**: The critic and the reviser MUST each run as a separate agent session through the harness's
  player interface, never in the same session as each other or as the teacher or the student. The model for
  each role MUST be set per loop, pinned by id and recorded in the loop record. It defaults to the model that
  played the teacher in the recordings, and MUST be set explicitly when the recordings come from more than one model.
- **FR-010**: A round's critic MUST be given only the current skill folder, the recordings and the list of
  goals the recordings cover. It MUST NOT be given an earlier verdict, an earlier round's text, the world
  file, recipes, goals files, the solver's output, a held-out goal or any evaluation result, and it
  MUST NOT have a means to read them.
- **FR-011**: The reviser MUST be given the current skill, the recordings and the current critic's verdict,
  and the same exclusions as FR-010. It MUST edit a local copy of the skill folder in place and MUST NOT
  change the original candidate.
- **FR-012**: The critic MUST return a typed verdict, checked against a schema before the loop uses it. The
  verdict holds an overall value (`accept`, `revise` or `reject`), a short value and a reason for each
  rubric question, an overall reason and a list of proposed revisions. The loop MUST branch only on the overall value.
- **FR-013**: A verdict that does not match the schema MUST stop the loop with an error of the form
  `code: fixed message`, never including the agent's own text.
- **FR-014**: The rubric MUST be versioned and its version recorded with every verdict. Its questions are the
  six in ADR-003 §2.6, with the one about difference from common knowledge answered "cannot be determined"
  when the recordings do not show what the teacher knew beforehand.
- **FR-015**: Every fact the reviser adds MUST be one the recordings show, MUST be cited to the recorded call
  it came from, and MUST be stated as fact only if shown. What the recordings do not show MUST be stated as
  not known, with a way to find out.

**The skill and the record**

- **FR-016**: The skill's main file MUST lead with the discovered fact and say what the skill gives, when to
  use it and how, and MUST NOT contain run or call citations. Citations and the list of what the recordings
  do not show MUST be kept in a separate provenance file in the same skill folder.
- **FR-017**: Each round MUST record the hash of the skill text it reviewed, the critic's verdict with the
  rubric version, and for revised rounds, the diff to the previous round and the reviser's change list.
- **FR-018**: Agent-authored text (verdicts, change lists, revised skills) MUST be stored only in the loop's
  own record folder, and MUST NOT be written to a run's trace, summary, score, replay bundle or a run's `reason`.
- **FR-019**: The loop MUST NOT write into a run folder it reads, and MUST NOT write into the folder of any
  student or teacher run.
- **FR-020**: An accepted skill MUST install through the harness's existing skill option, and the student
  run's score MUST name the skill's hash. A rejected loop's skill MUST NOT be installable.
- **FR-021**: The loop's time, tokens and cost per stage MUST be measured by the harness and recorded, with
  tokens, duration and cost as separate figures where the player reports them, and as unavailable where it does not.

**Test-first and isolation**

- **FR-022**: The loop MUST be testable with scripted stand-ins for the critic, the reviser and the memory
  service, so that no test calls a model or the network.
- **FR-023**: The harness MUST remove the spike's manual steps from the path from finished runs to an
  installable skill: no step needs a person except choosing the run and starting the loop.

### Key Entities

- **Recording**: one finished run's prompt, calls with their outputs as the agent saw them, and final answer.
- **Candidate skill**: the first skill the distiller produces from one or more recordings of the same goal, saved as a local folder
  with the runs, workspace and service version it came from.
- **Round**: one critic review and, on `revise`, one revision; has a number, the reviewed skill's hash, a
  verdict and, if revised, a diff and a change list.
- **Verdict**: the critic's typed answer: overall value, per-question value and reason, overall reason, proposed
  revisions, and the rubric version.
- **Rubric**: the versioned list of review questions (ADR-003 §2.6).
- **Skill package**: the skill's main file, its provenance file and any reference files.
- **Loop record**: the ordered rounds, the outcome (`accept` or `reject`) and its reason, and the measurements.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From finished teacher runs of one goal, the runner obtains a candidate skill folder with one command and no
  hand steps (today: six spike scripts and manual calls).
- **SC-002**: In every test and every outcome, including errors and interruption, the only workspaces
  created or deleted are those the harness created for that step; none of the tests' attempts to delete
  another id succeeds.
- **SC-003**: In every round of every test, the critic's inputs contain no earlier verdict and none of the
  excluded material (world, recipes, goals, solver output, held-out goals, evaluation results); a test
  that adds one to the inputs fails.
- **SC-004**: The loop ends within three rounds in every case, with exactly one outcome and a stated reason.
- **SC-005**: Every round's record lets the auditor recover the exact skill text (by hash), the verdict and
  the change from the round before, and the hash of the installed skill matches the one named in the student run's score.
- **SC-006**: The accepted skill's main file contains no run or call citations, and every fact added by the
  reviser appears in the provenance file with the call it came from.
- **SC-007**: No agent-authored text appears in any trace, summary, score or bundle in any test; the privacy
  test keeps passing.
- **SC-008**: On the faithful world's `stone_pickaxe` recordings, a full loop (excluding the distiller's
  processing wait) completes in under 15 minutes of wall-clock time and the student reaches the goal with the
  accepted skill in at least 2 of 3 trials. This is a check that the feature reproduces the spike's result, not a claim about transfer.

## Assumptions

- The three-round limit, the six rubric questions and the rule that a fresh critic reviews each round come
  from ADR-003 and are not reopened here.
- The critic's rubric lives in a versioned file in the repository, not inside a prompt, so that its version can be
  recorded and changed without touching the harness. (ADR-003 leaves this open; this is the choice for this feature.)
- The verdict is small: overall value, six short answers with reasons, an overall reason and proposed revisions
  as plain text. The reviser reads the reasons and revisions as text, not as structured edits.
- Agent-authored text is kept in the loop's own record folder under the experiment's folder, never under a run
  folder, and the privacy test is extended to cover that folder's boundary. (ADR-003 leaves where open; this is the choice for this feature.)
- The critic and reviser use the same player the harness already runs, through the existing player interface, with
  no built-in tools beyond reading the files they are given; each loop pins the critic's and the reviser's model by id (default: the teacher's model) and records both.
- The distiller's own approve and publish steps are not part of the loop: a skill is local to the run and the
  workspace is disposable.
- A person audits the first accepted skills after the fact (ADR-003 §2.6, as amended). That audit is not a gate
  and is not built here.
- The experiment runner, the memory arm, new worlds and teacher material with contrast are out of scope.
- The memory service's request shapes for the edit and sub-procedure operations are not needed, since the loop does not use them.
- The spike's results (`design/notes/critic-loop-findings.md`) are the evidence the behaviour is worth building;
  this feature does not re-measure whether the loop helps beyond SC-008.
