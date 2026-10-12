# Feature Specification: Complete the AI SDK Runtime

**Feature Branch**: `007-ai-sdk-runtime`

**Created**: 2026-10-10

**Status**: Draft

**Input**: User description: "ADR-005: Complete the AI SDK runtime for players and review roles"

**Derived From**: ADR-005 (design/adr/ADR-005-ai-sdk-runtime.md)

## Clarifications

### Session 2026-10-10

- Q: How much of the calibration rerun (ADR-005 §2.8) does this feature complete? → A: The faithful world's calibration is rerun on this runtime and recorded (about 30 runs; roughly US$4 by the earlier cost). The invented world and a full 60-run calibration are not part of this feature.

## User Scenarios & Testing *(mandatory)*

The people who use this feature are the **experiment runner**, who plays models against the crafting table
and reads the results; the **auditor**, who checks which model ran, what it cost and what the harness did;
and the **provider integrator**, who adds another source of models.

A feasibility spike moved the harness from a runtime that only runs one vendor's models to one that runs any
admitted provider's models the same way, and ran twenty games across four models (`spikes/fireworks/log.md`).
The player and the two review roles (a critic and a reviser, which review and edit a distilled skill) now run
through it, and ADR-005 records the decision. The spike left the work below undone. In this document a
**provider** is a source of models; a **model spec** names a model as `<provider>/<model>`; a **run** is one
player session on one goal; a **trial** is one run counted in an experiment; **calibration** is the set of
unaided trials that decides which goals have room for a skill to help (ADR-003 §2.1).

### User Story 1 - Know which model ran and what the run cost (Priority: P1)

The auditor opens a run's score or an experiment's summary and sees, for every run, the model it asked for,
the model the provider says ran, and a cost. A run on a model with no price shows no cost, and a total over
runs says how many of them had no price instead of counting them as free.

**Why this priority**: Every comparison between arms rests on knowing the model and the cost. The spike
recorded the requested name as the model that ran, and counted an unpriced run as zero dollars, so a
substituted model would go unnoticed and a Fireworks total would read `$0.000`.

**Independent Test**: Run a scripted player whose provider reports a different model than the one requested,
and a mix of priced and unpriced runs. Read the score, summary and report. The substitution is flagged and
the unpriced count is stated.

**Acceptance Scenarios**:

1. **Given** a run whose provider reports a different model from the one requested, **When** the run ends,
   **Then** the score records both, and the experiment is flagged as mixing models.
2. **Given** an experiment with some runs on a priced model and some on an unpriced one, **When** the summary
   and the report are produced, **Then** each states the cost of the priced runs and the number of unpriced
   runs, and no total includes an unpriced run as zero.
3. **Given** a provider that reports a cost for each request, **When** a run ends, **Then** the harness's own
   computed cost is the figure of record and the provider's figure is kept beside it as a cross-check.

---

### User Story 2 - Add a provider without touching the run loop (Priority: P1)

The provider integrator adds a provider (for example OpenAI, OpenRouter or Google) by adding one entry to a
provider table and the price entries for its models. The player, the review roles, the trace, the scoring and
the export need no change. A provider is admitted only after it passes a probe, a router that serves one model
name from several backends is admitted only with its backend fixed, and a provider's billing check is required
only if it has a usage report.

**Why this priority**: The runtime is only worth adopting if the next provider is cheap. Today the provider
list is fixed in two places in the code.

**Independent Test**: Add a scripted provider through the table alone and run a player and a role on it. Both
complete, and no other file changed.

**Acceptance Scenarios**:

1. **Given** a model spec `<provider>/<model>` for a provider in the table, **When** a run is started,
   **Then** the model is created through that provider, its key is read from that provider's environment
   variable, and the spec is recorded as given.
2. **Given** a model spec whose provider is not in the table, **When** a run is started, **Then** it is
   refused before anything is spent, with a fixed message that lists the providers available.
3. **Given** a provider that serves one model name from several backends, **When** its table entry does not
   fix the backend, **Then** the harness refuses to use it.
4. **Given** a new provider, **When** the admission probe runs, **Then** it reports whether a model there can
   drive the craft tools and return answers that validate against the critic and reviser schemas, and what
   settings the provider refuses.

---

### User Story 3 - Run Claude without paying full price for every request (Priority: P2)

The experiment runner runs a Claude model on a goal and the repeated part of each request (the tool list and
the conversation so far) is served from the provider's cache, so a 40-turn run does not pay full price for
about 300,000 input tokens.

**Why this priority**: The spike's five Claude runs cost $3.28 with no cache reads at all. Cost limits how many
trials an experiment can afford.

**Independent Test**: Run a scripted Claude player for 40 turns and read its tokens. A large share of input is
reported as read from the cache.

**Acceptance Scenarios**:

1. **Given** a Claude run of 40 turns, **When** it ends, **Then** at least 80% of its input tokens are
   reported as cache reads.
2. **Given** a provider that caches without being asked (Fireworks), **When** a run ends, **Then** its
   cache reads are recorded as before.

---

### User Story 4 - Pin the settings that change a model's behaviour (Priority: P2)

Before an experiment's first trial, the experiment runner fixes each model's thinking, effort and temperature
settings, and the experiment summary records them. A setting a provider does not support is refused or
recorded as unset, never silently dropped. Calibration is rerun on this runtime before any goal is given a
role, because earlier results were measured under a different runtime.

**Why this priority**: Without pinned settings two runs of the same model on the same goal may differ for
reasons nobody recorded. ADR-005 §2.8 requires it.

**Independent Test**: Start an experiment with settings for two models and read the summary. Each run's score
shows the settings it used.

**Acceptance Scenarios**:

1. **Given** settings for a model, **When** an experiment is planned, **Then** the plan shows them and the
   summary records them before the first trial.
2. **Given** a setting the table says the provider refuses for that model, **When** the experiment is planned,
   **Then** it is refused before anything is spent, naming the model and the setting. A setting the table does not
   know is refused only if the provider rejects it, which ends that run as an error and records the settings.
3. **Given** a model with no settings given, **When** a run ends, **Then** its score records the settings as
   unset, not as a default the harness chose.

---

### User Story 5 - See that a request was retried (Priority: P3)

The auditor reads a run and sees how many request attempts were retried after a failure, and the retry setting
the run used. A retried attempt is a count in the run's score. It is not a line in the trace.

**Why this priority**: The spike left retries at the library default and invisible. Hidden retries make a slow
or failing provider look the same as a healthy one.

**Independent Test**: Run a scripted provider that fails twice and then succeeds. The score records two retried
attempts and the setting.

**Acceptance Scenarios**:

1. **Given** a request that fails and succeeds on retry, **When** the run ends, **Then** its score records the
   retried attempts and the trace holds the one successful request.
2. **Given** a request that fails on every attempt, **When** the retries are used up, **Then** the run ends as
   an error with a fixed reason and the retried attempts are recorded.

---

### User Story 6 - Know the new runtime works end to end (Priority: P2)

The experiment runner runs the checks the spike did not: the critic loop from finished runs to a reviewed
skill on the new roles, a thinking model as a role under a small spend cap, a real model loading a skill
through the skill tool, and cancelling a run with Ctrl-C and by timeout while the craft server runs.

**Why this priority**: These are the paths an experiment depends on and none has been run on this runtime.
A failure found here is cheap; found mid-experiment it wastes trials.

**Independent Test**: Each check is a short, scripted live run with a spend limit, and each leaves a record of
what it did and cost.

**Acceptance Scenarios**:

1. **Given** finished runs and a critic and reviser model, **When** the critic loop runs, **Then** it ends in a
   recorded accept or reject with at least one round recorded.
2. **Given** a thinking model as a role and a small spend cap, **When** its reasoning uses more than the cap
   allows, **Then** the role fails with a fixed reason and no truncated answer is accepted.
3. **Given** a run with a skill installed, **When** a real model plays it, **Then** the run records whether the
   model loaded the skill and after how many calls.
4. **Given** a run in progress, **When** it is cancelled by Ctrl-C or by its time limit, **Then** the run ends
   as cancelled, the summary is written, and no craft server process remains.

---

### User Story 7 - Read documents that describe the runtime that exists (Priority: P3)

A new engineer reads the project's overview, agent guidance and the earlier specs (002 trace, 005 critic loop)
and finds a description of the runtime that exists. Where a statement was true only of the previous runtime
it is marked as history or updated.

**Why this priority**: Stale descriptions of the old runtime and of `--record` mislead the next change.

**Independent Test**: Search the documents for the previous runtime and the removed flag. Each remaining
mention is marked as history.

**Acceptance Scenarios**:

1. **Given** the overview, agent guidance and specs 002 and 005, **When** they are searched for the previous
   runtime and the removed recording flag, **Then** every remaining mention is marked as history or points to
   ADR-005.

---

### User Story 8 - Record a run as the model lived it (Priority: P2)

*(Added 2026-10-12; ADR-003 §2.4, amended.)* The experiment runner records a teacher's finished run to the memory
service, and the service receives the conversation the model had: its messages, and for each turn that called tools the
model's reasoning, the action it took and what came back. The memory service's distiller can then see why one call
followed another, not only that it did.

**Why this priority**: The recording written today holds two messages and a step per tool whose reasoning is a fixed
placeholder, so distillation sees a flat list of calls. The skill it produced replayed the teacher's exploration
routine, and whether real reasoning changes that is the question this answers. It is P2 because a skill can be built
without it.

**Independent Test**: Record a scripted run through the scripted memory service and read back what was written: every
assistant message, a step per tool-calling turn with the turn's reasoning, calls under their steps in order, tool names
as the model saw them, and nothing the harness concluded about the run.

**Acceptance Scenarios**:

1. **Given** a finished run that has a conversation file, **When** it is recorded, **Then** the service receives the prompt
   and each assistant message in order, one step per tool-calling turn holding that turn's reasoning, and each call under
   its own step.
2. **Given** a model whose provider returns no reasoning, **When** its run is recorded, **Then** each step holds the
   turn's text, or a fixed line saying none was returned, and never a made-up account.
3. **Given** a run recorded, **When** every write to the service is inspected, **Then** none holds a score, a solver path,
   an extra-call count or a label of which calls were needed.
4. **Given** a run made before this feature, with no conversation file, **When** it is recorded, **Then** it is written as
   before and its metadata says no reasoning was kept.

---

### User Story 9 - Know how a skill was made (Priority: P2)

*(Added 2026-10-12; ADR-003 §2.6, amended.)* The experiment runner, or a reader of the results, takes a skill and finds
out what process produced it: which recordings, which teacher and settings, how the distiller was asked, which roles
reviewed it with which settings, and which version of the procedure and the code ran. Two skills made by different
procedures can be told apart and compared.

**Why this priority**: A skill arm's result is only interpretable against the skill's provenance. Today the loop record
names the roles' models and the rubric but not the recordings' content, the roles' settings or the code, so a skill's origin
cannot be reconstructed from it. P2 because skills can be made and tried without it.

**Independent Test**: Run the loop with scripted roles and a scripted memory service, then read `loop.json`: every field
named below is present and none holds recorded text; change the process version without a changelog entry and the test fails.

**Acceptance Scenarios**:

1. **Given** a finished loop, **When** its record is read, **Then** it names the process version, the commit and whether the
   tree had changes, each recorded run with hashes of its log and score and its teacher's model and settings, the recording
   format, the distiller's request, gates and capabilities, each role's model and settings, and each round's and the final skill's hash.
2. **Given** a student run that installed a skill, **When** its skill hash is searched for among the loop records, **Then** it
   finds the record that produced it.
3. **Given** a change to the process version with no changelog entry, **When** the tests run, **Then** they fail.
4. **Given** any loop record, **When** it is searched for recorded text, reasoning or a key, **Then** none is found.

---

### Edge Cases

- A provider substitutes another model for the one requested, mid-experiment.
- A provider reports no cache figure: the count is recorded as zero, as the trace has always held it, and cost
  treats it as no cached tokens. A provider reports no cost: `reportedCostUsd` is absent. A model without a price
  never gets a cost of zero.
- A model has a price but no cache rates: cached tokens are priced at the input rate and the entry says so.
- A provider's key is missing from the environment: the run ends with a fixed reason that names the variable
  and never shows a key.
- A run is cancelled while a tool call is in flight, or while the provider is mid-response.
- A router's backend changes between two runs of one experiment; the recorded backend differs and the
  experiment is flagged.
- A thinking model's reasoning exceeds a role's token ceiling before it finishes its answer.
- A model refuses a setting the experiment pinned (for example a temperature on a reasoning model).
- A provider has no usage report, so the billing check cannot run.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A model MUST be named as `<provider>/<model>`, with a bare Claude id accepted as shorthand for
  `anthropic/<id>`, and every record (the model asked for, the model that ran, the trace, the price keys) MUST hold the
  canonical `<provider>/<model>` form. A bare Claude id in an earlier run folder MUST be read as `anthropic/<id>`. A spec whose
  provider is not in the provider table MUST be refused before any spend.
- **FR-002**: A provider table entry MUST hold the provider's prefix, how its models are created, the name of
  the environment variable that holds its key, and how a short model name expands to the provider's id. Adding
  a provider MUST need no change outside the table and the price entries.
- **FR-003**: A provider MUST NOT be admitted until a probe shows that a model there drives the craft tools and
  returns answers that validate against the critic and reviser schemas, and the probe's findings (settings
  refused, reasoning handling) MUST be recorded.
- **FR-004**: A provider that serves one model name from several backends MUST be refused unless its entry
  fixes the backend and the run records the backend the response reports.
- **FR-005**: Each run MUST record the model it asked for and the model the provider's response reports, and an
  experiment whose runs differ in the model that ran, or for a routed provider in the backend that served it, MUST be
  flagged as mixing models.
- **FR-006**: A run's cost MUST be computed from its token counts and a price entry, MUST be absent for a model
  with no entry, and MUST be the figure of record when a provider also reports one; a provider-reported cost
  MUST be kept beside it.
- **FR-007**: Every total, summary and report that sums cost MUST state how many runs were unpriced and MUST NOT
  count them as zero.
- **FR-008**: Claude requests MUST use the provider's prompt cache, and a cache figure a provider does not
  report MUST be recorded as zero in the trace and in the run's token counts.
- **FR-009**: The experiment summary MUST record each model's thinking, effort and temperature settings before
  the first trial, each run's score MUST record the settings it used (or that they were unset), and a setting
  the provider's table entry says the model refuses MUST be rejected before any spend. A setting the entry does not
  know a model refuses is sent, and a provider's rejection of it ends the run as `request_rejected`, with the
  settings recorded.
- **FR-010**: Calibration MUST run on this runtime under the same rule as ADR-003 §2.1, and the faithful world's
  calibration MUST be rerun and recorded as part of this feature, with results that name the runtime they were
  measured on, compared cell by cell with the Claude Code era results as a regression check. The record MUST say that at
  5 trials per cell the comparison detects gross breakage only and does not show equivalence. The invented world's
  calibration is not part of it.
- **FR-011**: The retry setting MUST be a stated value, recorded in each run's score, and the number of retried
  attempts MUST be recorded in the score and left out of the trace.
- **FR-012**: A role call MUST fail with a fixed `code: message` reason, and MUST NOT return a partial answer,
  when the provider cuts its output at the token ceiling.
- **FR-013**: Cancelling a run by interrupt or by its time limit MUST end the run as cancelled, write the
  summary, and leave no craft server process running.
- **FR-014**: Where a provider has a usage report, a batch of a model's runs MUST be compared with that report
  before the model is used in an experiment, and a provider with none MUST be admitted without the check.
- **FR-015**: Live checks of the critic loop, a thinking model as a role, a skill loaded through the skill
  tool, and cancellation MUST each leave a record of what was run, what it cost and what happened.
- **FR-016**: The overview, agent guidance and specs 002 and 005 MUST describe the runtime that exists, and any
  remaining mention of the previous runtime or of the removed recording flag MUST be marked as history.
- **FR-017**: Tests for each requirement above MUST be written before its implementation (constitution
  Principle IV), and no change MAY be made to the simulation engine, the craft server or the run log.
- **FR-019**: A role call MUST be asked again, up to three attempts in all, when its answer fails the caller's own schema,
  because a provider's structured-output mode does not enforce every limit the schema states (string lengths). The follow-up
  names the problem by field path and limit and never by the answer's text, the attempts count together against the spend
  cap, and after the last attempt the role fails with the fixed format reason and no answer. *(Added 2026-10-11: the
  critic-loop live check found a Claude critic whose answer exceeded a length limit; the earlier runtime retried such
  answers and this one did not.)*
- **FR-020**: A run MUST end as an error with a fixed reason when a response's warnings say a pinned setting was not applied.
  *(Added 2026-10-11: the settings probe found the SDK drops, with a warning, a setting a model does not take.)*
- **FR-021**: A model's thinking setting MUST be able to carry a token budget as well as `adaptive` and `off`, accepted only for
  the models that still take a budget; a temperature other than the provider's default MUST be refused beside a budget; and a
  role MUST be able to take the settings pinned for its model, so a role runs the way its model was calibrated. *(Added
  2026-10-11: the earlier runtime ran Claude with thinking on, and without it the Haiku reviser's schema-valid rate fell from 65%
  to 15%.)*
- **FR-022**: A model step that does not return, and a craft tool call that does not answer, MUST each end the run after a time
  limit shorter than the run's own (defaults of five minutes and one minute, settable), as an error with the fixed codes
  `step_timeout` and `tool_timeout`, keeping the usage of the steps that finished. *(Added 2026-10-11: a hung provider call was
  bounded only by the 30-minute run limit.)*
- **FR-023**: A run ended by its time limit or by cancellation MUST keep the turns, tokens, cost and retry counts it had reached,
  under the fixed timeout or cancellation reason, so the spend of a timed-out run is in its score and in the totals.
- **FR-024**: A run MAY be given a total-token cap, a dollar cap and a per-step output ceiling, recorded in the score. A run that
  crosses a cap while it still wants a tool MUST end as a budget stop with a fixed reason; a dollar cap MUST be refused, before
  anything is spent, for a model with no price; and no output ceiling is imposed by default, since a thinking budget needs a
  ceiling above it.
- **FR-025**: A provider's request to wait a minute or more before a retry MUST end the call at once as `rate_limited`, not be
  retried after the SDK's shorter wait. A dropped connection MUST be reported as `provider_unreachable`, a prompt over the
  context window as `context_length_exceeded`, a request timeout (408) as `provider_unavailable`, and a response cut off at an
  output limit as `output_limit`. Only the code is kept, never the error's text.
- **FR-026**: A run MUST end as an error with the fixed code `server_lost` when the craft server's connection closes, instead of
  spending further steps on calls that cannot succeed.
- **FR-027**: Tool calls that are not valid (malformed arguments, an unknown tool) MUST be counted in the score as
  `invalidToolCalls`, and a run MUST end as an error with the fixed code `tool_loop` after five consecutive steps whose calls were
  all invalid. *(FR-022 to FR-027 added 2026-10-11 from a review of the driver's failure handling.)*
- **FR-028**: The driver MUST report, for each model turn, its text, its reasoning (as the provider returned it) and the ids of the
  tool calls it made, and the harness MUST write them in order to `conversation.jsonl` in the run folder. No trace, score,
  summary, bundle, export or reason may hold them, and only the recording step reads the file; the privacy test MUST cover the
  new file on both sides. *(Added 2026-10-12 with ADR-003 §2.4's amendment.)*
- **FR-029**: A recording MUST write the prompt and each assistant message in order; one reasoning step per tool-calling turn
  with the turn's reasoning as its reasoning, the tool action as its action and the result; and each call under its step with
  input, output, status and duration. A turn with no returned reasoning MUST hold its text, or a fixed line saying none was
  returned, and a step's text MUST never be invented (the earlier fixed line naming Claude Code is removed). Tool names MUST be the
  names the model saw. Refused calls keep status `failure`.
- **FR-030**: A recording MUST contain nothing the harness concluded about the run: no score, solver path, extra-call count or
  label of which calls were needed. A test MUST show that no write to the memory service is derived from the scorer or the solver.
  *(The oracle is for judging an agent, not for helping one.)*
- **FR-031**: A conversation's metadata MUST name the model (canonical spec), its provider, its pinned settings and whether
  reasoning was returned. A run with no conversation file MUST still be recorded as before, with metadata saying no reasoning was kept.
- **FR-032**: The effect of real reasoning on distillation SHOULD be measured: distil twice from the same recorded runs, once
  with placeholder steps and once with real reasoning, and compare the two skills. This is a gated check that spends on teacher
  runs and the memory service, and it stays outside the first build.
- **FR-033**: A loop's record MUST name the process version, the git commit and whether the tree had changes (with a hash of
  the changes when it did), so a skill can be tied to the code that made it.
- **FR-034**: The record MUST name each recorded run with a hash of its `run.jsonl` and `score.json`, the teacher's canonical
  model, provider and pinned settings, and the recording format (placeholder steps, or per-turn reasoning once FR-028 to
  FR-031 exist), and the candidate step's distiller request, the gates it returned and the service's capabilities response.
- **FR-035**: The record MUST name each role's requested and resolved model and its pinned settings, and what the loop spent
  (tokens and cost, unpriced stated as such), besides the rubric's version and hash and each round's hashes it already holds.
- **FR-036**: The process version MUST be one constant in the repository, and a changelog in `design/notes/` MUST have an entry
  for it saying what that version means. A test MUST fail when the constant has no entry. Bump it when what is recorded, what the
  distiller is asked, the rubric or roles' instructions, the number of rounds or the roles' pinned settings change, and not for a
  change in no behaviour.
- **FR-037**: The record MUST hold hashes, settings and identifiers only, never recorded text, a role's free text, reasoning or a
  key, and the privacy test MUST cover it. It lives in `loops/<label>/loop.json`, never inside the accepted skill's folder, so a
  student that is given the skill is not given its provenance.
- **FR-038**: A student run that installs a skill already stores the skill's hash; the documents MUST say how that hash finds the
  loop record that produced it.
- **FR-018**: No key MUST appear in any file, log, trace, score, summary, reason or command line, and agent
  text and reasoning MUST NOT be written to any of them (constitution Principle VI; ADR-002 §2.3).

### Key Entities

- **Provider table entry**: a provider's prefix, how its models are created, its key's environment variable,
  how a short model name expands, whether its backend is fixed, and whether it has a usage report.
- **Model spec**: `<provider>/<model>`, recorded in canonical form whichever form the run was asked with.
- **Model record**: for a run, the model asked for, the model the provider reports as having run, and the
  backend when the provider routes.
- **Price entry**: dollars per million tokens for a model's input, output, cache reads and cache writes.
- **Pinned settings**: a model's thinking, effort and temperature, fixed in the experiment summary.
- **Retry record**: the retry setting and the count of retried attempts for a run.
- **Probe finding**: what a provider accepted or refused when it was admitted.
- **Live check record**: what a live verification ran, what it cost and what happened.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a scripted experiment with a substituted model, 100% of the affected runs show both the
  requested and the reported model, and the experiment is flagged.
- **SC-002**: In a scripted experiment with priced and unpriced runs, every summary and report states the
  unpriced count, and no total counts an unpriced run as zero.
- **SC-003**: A scripted provider is added through the provider table and price entries alone: a player and a
  role run on it, and no other source file changes.
- **SC-004**: A 40-turn Claude run reports at least 80% of its input tokens as cache reads, against 0% in the
  spike.
- **SC-005**: For each experiment, every model's settings are recorded before the first trial and in every
  run's score.
- **SC-006**: A run whose request fails twice before succeeding shows two retried attempts in its score and one
  request in its trace.
- **SC-007**: Five runs cancelled by interrupt and five by time limit each end as cancelled with a written
  summary, and no craft server process remains afterwards.
- **SC-008**: The critic loop completes from finished runs to a recorded accept or reject on the new roles, and
  a thinking-model role under a small spend cap either returns a complete answer or fails with a fixed reason.
- **SC-009**: A real model plays a goal with a skill installed, and the run records whether the skill was
  loaded and after how many calls.
- **SC-010**: For every provider with a usage report, the harness's token counts equal the provider's billed
  counts for the checked batch.
- **SC-011**: A search of the overview, agent guidance and specs 002 and 005 for the previous runtime and the
  removed recording flag finds only mentions marked as history.
- **SC-014**: A scripted run recorded through the scripted memory service produces a conversation with its messages, a step per tool-calling turn and every call, with no harness-derived content; the privacy test passes with the conversation file in place.
- **SC-015**: A loop run with scripted roles and a scripted service writes a record with every field FR-033 to FR-035 names, the privacy test finds no recorded text in it, and the changelog guard fails for a version with no entry.
- **SC-012**: The live checks together cost under US$10, and no key appears in any file the feature writes.
- **SC-013**: The faithful world's calibration is rerun and its results recorded with the runtime named, for under
  US$5, and each goal's role (gap, solved or ambiguous) is stated under the unchanged rule.

## Assumptions

- ADR-005 is accepted and is the source for the decisions: one runtime for every model, the provider table,
  pinning, and the skill as a tool. This feature builds them and does not reopen them.
- The billing check (FR-014) is a procedure recorded in the admission notes and run by a person before a model is
  used in an experiment. The harness does not enforce it in code.
- The memory arm stays deferred (ADR-003 §2.2), and distilling or comparing skills is out of scope.
- The simulation engine, the craft server and the run log do not change.
- The spike's code on this branch is the starting point: the player and role drivers, model parsing, price
  table and the billing check script already exist and pass their tests.
- Computed cost is the figure of record because it is comparable across providers; a provider-reported cost
  is a cross-check, kept beside it.
- Retries stay at a small fixed number (two, the library default) and are counted in the score.
- The 80% cache-read target is set from the 87–95% the Fireworks runs reached and is confirmed or revised by
  the first measured Claude run.
- The spend limit for the live checks (US$10) is a working figure for this feature. The earlier calibration of
  60 runs cost about $16.62, of which a faithful-world rerun is about 30 runs and $3.60.
- The calibration rerun uses the teacher and student models fixed in ADR-003 §2.1 and the base prompt wording in
  place when it runs, and it records which wording that was.
- Which base prompt wording the experiment uses stays a separate open decision (ADR-005 §2.8).
- Keys for each provider are supplied by the operator in the environment; a provider whose key is absent is
  skipped, not an error, in the checks that need it.
