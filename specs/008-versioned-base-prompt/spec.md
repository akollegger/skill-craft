# Feature Specification: Versioned base prompt with a call budget

**Feature Branch**: `008-versioned-base-prompt`

**Created**: 2026-10-13

**Status**: Draft

**Derived From**: ADR-007 (design/adr/ADR-007-base-prompt-and-budget.md)

**Input**: User description: "ADR-007: versioned base prompt, as described in @design/adr/ADR-007-base-prompt-and-budget.md"

## Clarifications

### Session 2026-10-13

- Q: Which prompts should this feature move into the shared, versioned scheme? → A: The shared mechanism (layout, version, hash, changelog, recording) applies to the player's base prompt, the fixed arm sentence, the review rubric (the critic's and reviser's instructions with the review questions) and the skill tool's description. How each role's prompt is assembled from named parts stays in code.
- Q: Should the critic's rubric questions move into the prompt scheme with the instructions, or stay one file? → A: The rubric file stays whole and is one prompt kind, "review rubric", with its own versions; the critic's and reviser's instructions are not separate kinds, and every earlier loop record stays valid.
- Q: Should an experiment pin a version for every prompt kind it uses, or only the player's base prompt? → A: It names a version for each kind it uses (a prompt set); runs and loops that disagree are refused or flagged, and the report shows the set.

## User Scenarios & Testing *(mandatory)*

The people using this feature are the experimenters who run models against the crafting table and compare arms. The base prompt is the single text every agent receives. Today it lives in code, says "turns" while the harness counts model responses, and is recorded only as a copy in each run, so two runs can differ in wording without anyone noticing and a budget means different amounts of exploration to different models.

### User Story 1 - Every run says which prompt it saw (Priority: P1)

An experimenter names one base prompt version for an experiment. Every run records that version and a fingerprint of the exact text the agent received, and the tools that compare arms notice when two arms saw different text.

**Why this priority**: A comparison between arms is only meaningful if the prompt is the same, and nothing detects a difference today. This is the foundation; it also keeps the four earlier surveys reproducible by pinning version 1.

**Independent Test**: Run the same goal under two different prompt versions and under the same version twice. The records show the version and fingerprint, the same-version runs match, and the report warns when asked to table the differing runs together.

**Acceptance Scenarios**:

1. **Given** a prompt file for version 1 that reproduces today's text, **When** a run is made with it, **Then** the prompt the agent receives is byte-identical to what the harness builds today for the same goal and budget.
2. **Given** two runs whose filled prompts differ in any character, **When** the report builds one table from them, **Then** it shows a notice that the arms saw different prompts.
3. **Given** an arm that adds the one fixed sentence the experiment protocol allows, **When** its run is recorded, **Then** the fingerprint covers that sentence, and the only difference between the arms' fingerprints is that sentence.
4. **Given** a finished run's replay bundle, **When** it is exported, **Then** the bundle carries the prompt version and fingerprint.

---

### User Story 2 - The budget counts tool calls, in the prompt and in the run (Priority: P2)

An experimenter gives a run a budget of tool calls. The prompt tells the agent the number and what counts. The run ends when the budget is used, and the score says how many calls were made, how many changed the table, how many responses there were and how many calls were refused for being over budget.

**Why this priority**: The surveys showed models that batch calls stopped early because they read "turns" as calls, which made results across providers unequal. A budget the agent can count itself, and that the harness enforces exactly, removes that. It depends on Story 1 only for the prompt text that states it.

**Independent Test**: Run a scripted player that issues several calls in one response and crosses the budget partway through a response. The calls past the budget are not executed, the run ends, and the score fields add up.

**Acceptance Scenarios**:

1. **Given** a budget of N calls, **When** a response contains calls that would cross N, **Then** calls are counted in the order the agent emitted them, the calls within the budget run, and each later call receives one fixed refusal line that reveals nothing about the world.
2. **Given** a call refused for being over budget, **When** the run's record is written, **Then** that call is absent from the run log, is not in the total call count, and is counted in a separate over-budget count in the score.
3. **Given** the last call within the budget produces the goal, **When** the run ends, **Then** its ending is `stopped`, not `budget`.
4. **Given** the budget is used up and the goal is not held, **When** the run ends, **Then** its ending is `budget`.
5. **Given** a response with no tool call, **When** it occurs, **Then** the run ends as it does today.
6. **Given** a skill is loaded through the skill tool, **When** calls are counted, **Then** that load is recorded but does not count toward the budget.
7. **Given** a finished run, **When** its score is read, **Then** it holds the total calls, the table-changing calls, the number of responses and the over-budget count, and the first two equal what the score reported before.

---

### User Story 3 - A reworded version 2 prompt is measured before it is adopted (Priority: P3)

An experimenter has a second prompt version, with neutral wording and a budget defined in calls. Before an experiment uses it, the three nominated models run two tasks unaided under version 1 and under version 2, so the effect of the wording is a recorded number.

**Why this priority**: The wording moved a baseline once and the cause is unresolved. This story turns that into a result, but it needs Stories 1 and 2 first and spends model usage.

**Independent Test**: The version 2 file exists, passes the checks for prompt files, and a run under it receives text that states the call budget and says nothing about isolation, exploring, skills or memory. The comparison runs produce a table of baselines under each version.

**Acceptance Scenarios**:

1. **Given** the version 2 prompt file, **When** it is filled for a goal and a budget, **Then** the text states the goal, how to learn the tools, that crafting is irreversible, that no one can answer questions, and the call budget including calls made together.
2. **Given** any prompt version, **When** it is checked, **Then** it contains no mention of skills, memory, learning, or any recipe or solution.
3. **Given** the three nominated models and the two tasks, **When** unaided runs are made under both versions, **Then** a recorded table gives each model's success rate and cost under each, with both labelled by prompt version.
4. **Given** version 2 moves a baseline, **When** the experiment is set up, **Then** it names version 2 and every comparison is made under it, and the version 1 results stay in the record, labelled as step-budget runs.

---

### User Story 4 - Every prompt in play is versioned the same way (Priority: P2)

An experimenter can list every prompt the study uses (the player's base prompt, the fixed sentence an arm adds, the review rubric, the description of the skill tool) from one place, each with a version, a changelog entry and a fingerprint, and any run or review loop records which versions it used.

**Why this priority**: more than one prompt is in play across the phases of work (playing, distilling, reviewing, using a skill), and each is a variable that can move a result. Only the review rubric is versioned today; the others live in code or on a command line. A skill's provenance and a run's comparability depend on all of them.

**Independent Test**: List the prompt kinds and their versions; run a review loop and a skill-using run and confirm each record names the versions of the prompts it used, and that an earlier loop record still verifies.

**Acceptance Scenarios**:

1. **Given** the repository's prompt directory, **When** the prompts are listed, **Then** each kind (player base prompt, arm sentence, review rubric, skill tool description) appears with its versions, and every version has a changelog entry.
2. **Given** a finished review loop, **When** its record is read, **Then** it names the version and fingerprint of the review rubric it used, which is what both roles were told.
3. **Given** a run with a skill installed, **When** its score is read, **Then** it names the version of the skill tool's description the agent saw.
4. **Given** a run whose arm adds the fixed sentence, **When** it is recorded, **Then** the sentence's version is recorded beside its text.
5. **Given** a review loop made before this feature, **When** it is checked, **Then** it still verifies against the rubric file as it was, which is the file the rubric kind lists as its first version.

---

### User Story 5 - An experiment pins the prompt set it uses (Priority: P2)

An experimenter names, in the experiment's summary, one version for each prompt kind the experiment uses. Runs and review loops that disagree are refused before any spend, or flagged afterward, and the report shows the set.

**Why this priority**: the skill tool's description changes how often a skill is loaded and the review rubric changes what skill a loop produces, so two arms or loops can differ in a way no one sees if only the base prompt is checked.

**Independent Test**: Pin a set naming base prompt version 2, rubric version 1 and a skill tool description version; start a run with another skill tool description version and a loop with another rubric version, and confirm both are refused; confirm the report prints the set.

**Acceptance Scenarios**:

1. **Given** an experiment summary that pins versions for the kinds it uses, **When** an arm or a loop starts with a different version of a pinned kind, **Then** it is refused before any model call, naming the kind and both versions.
2. **Given** a kind the summary does not pin, **When** a run or loop uses it, **Then** its version is recorded and the report lists it as unpinned.
3. **Given** finished runs and loops under one experiment, **When** the report is built, **Then** it prints the pinned set and warns when any run or loop's recorded versions or base fingerprints differ from it.
4. **Given** an experiment summary with no prompt set, **When** the report is built, **Then** the older checks and tables behave as before and say the set is not pinned.
5. **Given** an experiment that names base prompt version 2, **When** an arm is started with base prompt version 1, **Then** the harness refuses to start it and says which versions disagree.

---

### Edge Cases

- A prompt file with a placeholder the harness does not fill, or without the goal placeholder, is rejected before any run.
- An existing prompt file using the older step placeholder still works and is labelled as a step budget.
- A budget given for a version 1 prompt is a step budget, and a call budget given for a version 1 prompt is refused, so the two meanings cannot be mixed.
- Two prompt files with different names but identical text have the same fingerprint, and the report treats them as the same prompt.
- A refusal for being over budget must not reveal anything about recipes; the existing sweep for leaks covers it.
- A run cancelled or timed out mid-response keeps the counts it had, and the over-budget count is zero.
- An older run folder without a prompt version is shown as unversioned, not as version 1.
- Listing the review rubric as a prompt kind must not change the file or what either role is told, so its fingerprint is unchanged and earlier loop records stay valid.
- A change to any role's wording is a new version of that prompt and, under the existing rule, a new process version for any skill it helps make.
- A pinned kind that the experiment does not use (for example the rubric in an experiment with no review loop) is allowed and checked only where it applies.
- A prompt kind with no versions yet (or a missing changelog entry) is refused before a run or loop starts.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A base prompt MUST be a stored, versioned text file with named placeholders for the goal and the budget, and a changelog beside it saying what each version changed and why. A new version MUST be a new file, never an edit of an existing one.
- **FR-002**: Version 1 MUST reproduce today's prompt byte-for-byte for any goal, quantity and step budget, with the note sentence appended as before.
- **FR-003**: The existing prompt-file option MUST keep working with its current placeholders (the older one meaning a step budget), and a prompt file with an unknown placeholder or no goal placeholder MUST be refused before any run.
- **FR-004**: An experiment's summary MUST be able to name one version for each prompt kind it uses (a prompt set), including exactly one base prompt version, and the harness MUST refuse to start an arm, and the review loop a loop, that uses a different version of a pinned kind, naming the kind and both versions.
- **FR-005**: Every run MUST record the prompt version and two fingerprints in its score: of the base prompt's template as written, and of the exact text the agent received, including any fixed sentence an arm adds.
- **FR-006**: The report MUST print the experiment's prompt set, list any kind the summary does not pin as unpinned, and show a notice whenever one table includes arms whose base-prompt fingerprints differ (a difference only in the fixed arm sentence is listed, not warned about), and MUST treat identical text as one prompt regardless of file name.
- **FR-007**: A replay bundle MUST carry the run's prompt version and fingerprint.
- **FR-008**: A run made before this feature MUST be shown as unversioned.
- **FR-009**: A version 2 prompt MUST state a budget counted in tool calls and say that every craft-tool call counts, including several made together; the experiment summary MUST declare the budget size, and a step budget MUST NOT be accepted for a version 2 prompt.
- **FR-010**: The budget MUST count every call to a craft tool (orientation and table-changing calls alike, refused ones included) and MUST NOT count loading a skill, which is recorded.
- **FR-011**: The driver MUST count calls in the order the agent emitted them within a response, MUST NOT execute a call past the budget, and MUST answer each such call with one fixed line that reveals nothing about the world.
- **FR-012**: A call refused for being over budget MUST NOT appear in the run log or the total call count, and MUST be counted in a separate score field.
- **FR-013**: A run MUST end after the response in which the budget is used. It MUST end `stopped` if the goal is held, including when the last in-budget call reached it, and `budget` otherwise. A call budget MUST set the step limit to the same number for runs under a call budget, and a response with no call MUST end the run as it does today.
- **FR-014**: A run's score MUST record the total calls, the table-changing calls, the number of responses and the over-budget count; the first two MUST keep their current meaning so earlier results stay comparable.
- **FR-015**: The version 2 prompt MUST be the neutral wording from the ADR: no mention of isolation, exploring, skills, memory or learning, and no hint of a solution. No prompt version MAY be tuned per model.
- **FR-016**: A comparison MUST be run, before an experiment adopts version 2, of the three nominated models (`nemotron-3-ultra-nvfp4`, `glm-5p3-flash`, `claude-fable-5-1`) on `glirol` and `wooden_stool` unaided, five trials each, under version 2, set beside the already-measured version 1 results, and recorded as a report that names each prompt version and the budget used.
- **FR-017**: The documents MUST be brought in line: the experiment protocol's meaning of "turn budget" and the glossary entry (now a call budget), the repository guidance for the harness and the run options, and the ADR's status and specs list.

- **FR-018**: The base prompt, the fixed arm sentence, the review rubric and the skill tool's description MUST each be a stored prompt of a named kind, with versions kept under one directory scheme, one changelog format, and one fingerprint rule.
- **FR-019**: A listing MUST show every prompt kind with its versions and fingerprints, and refuse a version with no changelog entry.
- **FR-020**: The fixed arm sentence MUST be selectable by version, and one given as free text MUST still work and be recorded as custom, so existing commands keep working.
- **FR-021**: The skill tool's description MUST be read from a versioned prompt file, and the review rubric MUST be listed as a kind without being split or rewritten; the way each role's prompt is assembled from its named parts MUST stay in code, and unchanged wording MUST keep its fingerprint.
- **FR-022**: A review loop's record MUST name the version and fingerprint of the review rubric; a skill-using run's score MUST name the version of the skill tool's description; a run with an arm sentence MUST record that sentence's version.
- **FR-023**: A change to the review rubric or any other prompt's wording MUST be a new version, and the existing rule that a changed process bumps the process version MUST cover it; earlier loop records MUST remain verifiable against the rubric file they hashed.
- **FR-024**: An experiment summary without a prompt set MUST behave as before and be reported as not pinned.

### Key Entities

- **Prompt set**: The versions an experiment pins, one per prompt kind it uses, held in the experiment's summary.
- **Prompt kind**: One of the prompts in play: the player's base prompt, the arm sentence, the review rubric (the critic's and reviser's instructions with the review questions, one file), the skill tool's description. Each kind has its own series of versions.
- **Prompt version**: A named, immutable text file of one kind with its placeholders (if any) and a changelog entry.
- **Prompt fingerprints**: Two hashes per run, one of the base prompt's template as written (the same across goals and budgets) and one of the full text sent. Two runs with the same base hash saw the same base wording, and with the same full hash saw the same words.
- **Call budget**: The number of craft-tool calls a run may make, stated in the prompt and enforced by the driver.
- **Over-budget refusal**: The fixed answer to a call past the budget, counted in the score and absent from the run log.
- **Run score fields**: total calls, table-changing calls, responses, over-budget calls, prompt version and fingerprint.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Filling version 1 gives the same bytes as the code's current prompt in 100% of 20 combinations of goal, quantity, step budget and fixed sentence.
- **SC-002**: An arm started with a prompt version that differs from its experiment's is refused 100% of the time before any model call is made.
- **SC-003**: A scripted run that issues calls in batches crossing the budget stops with exactly the stated number of executed calls in every tested crossing position (first, middle, last call of a response), and the score's counts add up in every case.
- **SC-004**: No version 2 run and no refusal line contains a recipe, item identity or solution; the existing leak sweep passes unchanged.
- **SC-005**: The comparison report gives a success rate and cost per model, task and prompt version for all three models and both tasks, 30 runs in total under version 2, and states whether version 2 changed any baseline.
- **SC-006**: Under version 2, every run of `claude-fable-5-1` that does not reach the goal has used at least 90% of its call budget; the early self-stopping with budget unused seen under version 1 is gone, or the remaining cases are explained.
- **SC-007**: The earlier surveys' reports remain reproducible: version 1 runs are labelled as step-budget runs and nothing in them changes.
- **SC-008**: Every prompt kind in play is listed with at least one version and a changelog entry, and a review loop and a skill-using run each record the versions of the prompts they used in 100% of tested cases.
- **SC-009**: An arm or loop that uses a different version of a pinned kind is refused before any model call in 100% of tested cases, and the report's printed set matches the summary's.

## Assumptions

- The starting budget is 100 calls, as the ADR suggests; the first calibration confirms or changes it, and it is raised if more than 1 in 10 unaided runs of a tier that otherwise reaches the goal end at the budget.
- The comparison under FR-016 is a live check that costs model usage; it is run with spend caps and small trial counts, and Fable's runs are capped separately.
- Disabling parallel tool calls is a rejected alternative recorded in the ADR and stays out of scope here; a follow-up check of the surveys with serial calls is separate.
- The memory arm, skill distillation and any change to the engine, the craft server or the run log's contents are out of scope; the over-budget count lives only in the score.
- Earlier run folders are not rewritten; older runs are read as unversioned.
- A later bespoke distiller or lessons review will add its own prompt kinds under the same scheme; none is created here.
- The fixed arm sentence allowed by the experiment protocol is unchanged and remains part of the fingerprinted text.
