# Feature Specification: The distillation harness interface

**Feature Branch**: `009-distillation-harness-interface`

**Created**: 2026-10-14

**Status**: Draft

**Derived From**: ADR-008 (design/adr/ADR-008-distillation-harness-interface.md)

**Input**: User description: "ADR-008: Implement the distillation harness interface" (the full description, including what is in and out of scope, is in the conversation that created this spec and in ADR-008)

## Clarifications

### Session 2026-10-14

- Q: Does a harness that only sends recordings to a model provider the project already calls need the operator's explicit option, or only one that sends them to a third-party store that keeps them? → A: Only a harness that sends records to a third-party store that keeps them says so and needs the explicit option; a harness that only calls a model provider, as a player or the critic does, does not.

## User Scenarios & Testing *(mandatory)*

The people using this feature are the experimenters who turn recorded runs into skills and compare how different systems do it, and the integrators who want to plug another memory system in. Today one pipeline is hardwired: the command that makes a skill calls the memory service (NAMS), then runs a critic and a reviser; the record of how a skill was made names only that service; the experiment's cast names "the memory service, with the critic and reviser as its review stage"; and the report refuses a skill arm unless a review verdict says `accept`. Nothing can vary the distillation process, so its effect on results cannot be measured.

### User Story 1 - Any distillation process behind one contract (Priority: P1)

An experimenter names a harness, gives it finished runs, and gets a set of skills back. A harness is a session that records runs and produces skills on demand; what it does inside (a graph, model calls, review rounds) is its own. The runs, and the skills, have a documented shape that an outside system can implement without reading this project's code.

**Why this priority**: Everything else (the two harnesses, the command, the cast, the report) hangs on the contract, and it is what lets another system be compared at all.

**Independent Test**: With a scripted harness, open a session, record two runs, ask for skills over both, check the result, describe the harness and close the session; repeat with a cancellation and with a refusal. Validate the exchanged data against the published schemas.

**Acceptance Scenarios**:

1. **Given** a named harness and an experiment id, **When** a session is opened, recorded with two finished runs and asked to distill over both run ids, **Then** it returns a skill set of at least one skill, and its provenance describes what it did.
2. **Given** a run id recorded twice, **When** the second record is made, **Then** nothing changes (it is idempotent by id).
3. **Given** a request that names a run id that was not recorded, or no ids, **When** it is made, **Then** it is refused before any work is done.
4. **Given** a harness that cannot produce a skill, runs out of its spend limit, is cancelled or fails, **When** distillation is asked for, **Then** it returns a refusal with one fixed code (`no_skill`, `spend_limit`, `cancelled` or `failed`) and the spend so far, never an empty skill set.
5. **Given** any outcome, including cancellation, **When** the session is closed, **Then** everything the session created is released, and nothing it did not create is touched.
6. **Given** a skill set with one skill, **When** it is checked, **Then** it is valid.
7. **Given** a run record, **When** its fields are listed, **Then** it holds the task prompt, the models and pinned settings, the model's turns with text and reasoning, each call with its arguments, regenerated output and status, whether reasoning was returned, and the final answer, and none of: a score, a reached flag, a solver path, an extra-call count, a goal role, a label of which calls were needed, a world or goals file, or a timing.
8. **Given** the committed schema files, **When** they are compared with what the project's own definitions generate, **Then** they match, and a change to either side without the other fails a test.

---

### User Story 2 - Today's pipeline as the first harness, and the report that follows (Priority: P1)

The existing pipeline (a managed NAMS workspace, recording, generation, and a critic and reviser that edit the skill over up to three rounds) runs as one harness, `nams-reviewed`, with no change in behaviour. The command that makes skills takes a harness name, and the report no longer requires a review verdict.

**Why this priority**: It proves the contract against the one system that exists and keeps every earlier capability, including the safety rules around the memory service's workspace.

**Independent Test**: With the scripted memory service and scripted roles, run the new command with `nams-reviewed` over run folders and compare the skill, the rounds and the record with what the old command produced for the same input; run the report over an experiment with no review record.

**Acceptance Scenarios**:

1. **Given** run folders and `--harness nams-reviewed --allow-workspace`, **When** the command runs, **Then** it records the runs to a workspace it creates, generates one skill, runs the critic and reviser, writes the skill set, a sidecar and the provenance record, and deletes the workspace whatever happens.
2. **Given** no `--allow-workspace`, **When** the command is run with `nams-reviewed`, **Then** it is refused before any account write, as before.
3. **Given** the experiment workspace id in the environment, **When** the harness runs, **Then** it never touches it.
4. **Given** the harness, **When** the memory service is asked to generate, **Then** it is asked for one skill and no more.
5. **Given** a dry run, spend caps or cancellation, **When** the command runs, **Then** each behaves as the old command's did (a dry run spends nothing, a cap ends a call, a cancel ends the round and writes a record of what finished).
6. **Given** a provenance record made before this feature, **When** it is read, **Then** it is treated as made by `nams-reviewed`.
7. **Given** an experiment with a skill arm and no review record, or a review verdict other than `accept`, **When** the report is built, **Then** it is built, printing what the harness's provenance says it did (including review rounds and verdicts) instead of refusing.

---

### User Story 3 - A second harness with no outside service (Priority: P2)

An experimenter can distill with a model call alone: one tool-less call over the recorded runs that returns one skill, with citations to the runs and calls that support it. It is the reference implementation for an integrator and the comparison point for the memory service.

**Why this priority**: A contract with one implementation is untested; a second, simple one shows it holds, and gives the first real comparison of distillers on identical recordings.

**Independent Test**: With a scripted role, open the harness, record two runs, distill, and check the skill, its citations and its provenance; check the role's prompt for the fields it is not given.

**Acceptance Scenarios**:

1. **Given** recorded runs, **When** the bespoke harness distills, **Then** it makes one call to a model with no tools, built from named parts only (its instructions, the task prompt and the recordings as text), and returns one skill that passes the package checks.
2. **Given** the call's prompt, **When** it is inspected, **Then** it holds no score, solver output, goal role or which-calls-were-needed label, and no world or goals file.
3. **Given** the instructions, **When** they are read, **Then** they ask for what the recordings support, with run and call citations, and nothing beyond them.
4. **Given** a model's answer that does not pass the schema, **When** the call is checked, **Then** the existing retry limit applies and a final failure is a `failed` refusal with the spend so far.
5. **Given** the harness's model, **When** it is configured, **Then** its model and pinned settings come from the cast, and the call is priced and capped like a critic call.
6. **Given** the instructions, **When** prompts are listed, **Then** they appear as a prompt kind with versions and a fingerprint, and an experiment's prompt set may pin their version.

---

### User Story 4 - The cast and provenance name the harness (Priority: P2)

An experiment's summary names the harness and each role's model and settings, and the record of how a skill was made says what ran; the report checks the two against each other and says which roles share a model.

**Why this priority**: Without this the report cannot tell one harness's skills from another's, and a mismatch between what was configured and what ran would go unnoticed.

**Independent Test**: Build a report from a summary with a harness cast and a matching record, then with a mismatched model, a mismatched harness name, and an older cast naming only a distiller.

**Acceptance Scenarios**:

1. **Given** a cast with a harness, **When** the report is built with a matching provenance record, **Then** it prints the harness, each role's model and settings, and which roles share a model.
2. **Given** a record whose harness name, or any role's requested or answering model or settings, differ from the cast, **When** the report is built, **Then** it is refused, naming the difference.
3. **Given** an older cast naming only a distiller, **When** the report is built, **Then** it is read as the `nams-reviewed` harness.
4. **Given** a harness's provenance, **When** it is read, **Then** it holds its name and process version, each role's model and pinned settings, prompt versions and fingerprints, an external service's version and build commit when there is one, and its stages with duration, tokens and cost (null, never zero, when unpriced), and no recorded text.
5. **Given** a harness that sends run records to a third-party store that keeps them, **When** it is described, **Then** it says so, and it runs only with an explicit operator option; **Given** a harness that only calls a model provider, **Then** it needs no such option.

---

### User Story 5 - The protocol document shrinks to match (Priority: P3)

The experiment protocol no longer prescribes how a harness operates: distillation is one step (runs in, a skill set out), the review gate is dropped, and the project's guidance, glossary and decision records say so.

**Why this priority**: A protocol that still demands a review verdict would contradict the report and the interface; the documents must agree before the next experiment is written.

**Independent Test**: Read the experiment protocol, the glossary and the project guidance for any statement that a skill must be reviewed before a student receives it, or that the distiller is the memory service.

**Acceptance Scenarios**:

1. **Given** the experiment protocol, **When** its critic-loop section is read, **Then** it points to the `nams-reviewed` harness and does not require review.
2. **Given** the protocol's cast and distiller-input sections, **When** they are read, **Then** they say a harness is fed the runs the experiment names.
3. **Given** the amendment that left harness-based distillation undecided, **When** it is read, **Then** it is marked resolved by the harness decision.
4. **Given** the harness decision record, **When** this feature is done, **Then** it is accepted.
5. **Given** the project guidance and the glossary, **When** they are read, **Then** they describe the harness, the new command and the cast shape.

---

### User Story 6 - Comparing the two harnesses on one set of recordings (Priority: P3, optional)

An experimenter distills from Fable's three `wooden_stool` recordings with each harness, several times, and gives each resulting skill to two weaker models.

**Why this priority**: It answers whether the memory service adds anything over a bare model call on identical recordings. It spends model usage and can follow the rest.

**Independent Test**: The comparison's report lists each harness's skills and what each student did with them under the same prompt.

**Acceptance Scenarios**:

1. **Given** the three recordings, **When** each harness distills several times, **Then** each generation is recorded with its provenance and spend.
2. **Given** each resulting skill, **When** `claude-haiku-5-5` and `nemotron-3-ultra-nvfp4` each play `wooden_stool` five times with it under the version 2 base prompt, **Then** the success and cost of each cell are recorded beside the unaided results.
3. **Given** all cells, **When** the report is written, **Then** it states how the harnesses' skills differ and whether the success rates do, with the number of generations and trials as a caveat.

---

### Edge Cases

- A harness that returns several skills is valid; a harness is never required to.
- A run recorded with no reasoning from the provider carries a field saying so, and a harness must not invent reasoning.
- A cancelled session releases what it created even if cancelled mid-record.
- A request for runs that were recorded in a different session is refused.
- A skill whose files are over the size limits, or whose path leaves its folder, is refused.
- A skill set written to disk has a root folder, a subfolder per skill and a sidecar beside them; the sidecar is never inside a skill folder.
- Two schema versions: a breaking change to a contract is a new file, never an edit.
- The bespoke harness is given more recorded text than its size limit allows: it is refused with a fixed code before any model call.
- A cast that names a harness the project does not have is refused before any run.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A harness MUST be named and chosen from a table of known harnesses, and an unknown name MUST be refused before any work or spend.
- **FR-002**: A harness MUST open a session for an experiment id, and the session MUST provide four operations: record a finished run, distill, describe, and close; each MUST accept a cancellation signal.
- **FR-003**: Recording a run MUST be idempotent by the run's id, MUST accept finished runs only, and MUST NOT stream steps.
- **FR-004**: Distilling MUST take explicit run ids that were recorded in the session, MUST refuse an empty list or an unknown id before any work, and MUST NOT let a harness choose which runs to learn from. It MAY be called repeatedly with different sets of ids, each independent. A request MAY carry a spend limit and a skill-count hint, which a harness MAY ignore.
- **FR-005**: Distilling MUST return either a non-empty skill set or a refusal with exactly one of the fixed codes `no_skill`, `spend_limit`, `cancelled` or `failed` and the spend so far, and MUST NOT return an empty set.
- **FR-006**: Closing a session MUST release everything the session created, including after a failure or cancellation, and MUST NOT touch anything the session did not create.
- **FR-007**: The run record contract MUST hold the task prompt, the models (as requested and as answered) and their pinned settings, the model's turns in order with text and the reasoning the provider returned (absent when none), each call's id, tool, arguments, status and regenerated output (and a refusal for a failure), a field saying whether reasoning was returned in all, some or none of the turns (or that the run kept no conversation), and the final answer.
- **FR-008**: The run record contract MUST NOT hold a score, a reached flag, a solver path, an extra-call count, a goal role, a label of which calls were needed, a world or goals file, or a timing, and a test MUST assert its full property list.
- **FR-009**: The skill set contract MUST be a non-empty list of skills, each with a name, a description and files (relative path to UTF-8 text, a `SKILL.md` with front matter plus optional references) within the existing size limits, and optional tags and evidence (run ids and call numbers); a list of one MUST be valid.
- **FR-010**: Both contracts MUST be published as versioned JSON Schema files, generated from the definitions the project's types derive from, and a test MUST fail when a committed file differs from the generated one. A breaking change MUST be a new file.
- **FR-011**: A skill set written to disk MUST be one root folder with a subfolder per skill, in the layout of a `.claude/skills/` directory, and a sidecar file beside the subfolders holding tags and evidence, never inside a skill folder; a skill folder MUST install into a run as it is.
- **FR-012**: The `nams-reviewed` harness MUST run today's pipeline (a managed workspace it creates, recording, generation of one skill, the critic and reviser up to three rounds, deletion on close), MUST return a skill set of one, MUST keep the workspace guard, the explicit workspace option and the rule that it never touches the experiment workspace named in the environment, and MUST NOT ask the memory service for more skills than it does today.
- **FR-013**: The `bespoke-one-shot` harness MUST make one model call with no tools whose prompt is built from named parts only (its instructions, the task prompt and the recordings as text), MUST ask for what the recordings support with run and call citations and nothing beyond them, MUST assemble one skill through the package checks, and MUST be priced and capped like a critic call.
- **FR-014**: The bespoke harness's instructions MUST be a prompt kind under the project's prompt scheme (versioned, fingerprinted, listed by the prompts command and pinnable in an experiment's prompt set), and a change to their wording MUST be a new version and a new process version for that harness.
- **FR-015**: A harness's input MUST hold none of the fields FR-008 excludes, and a test over each harness's input and prompts MUST assert it.
- **FR-016**: The command that makes skills MUST take a harness name and run folders, MUST build a run record from each folder by replay, record them, distill over all of them, and write the skill set, the sidecar and the provenance record, and MUST support a dry run that spends nothing, spend caps, and cancellation as the command it replaces did.
- **FR-017**: A harness's description MUST hold its name and process version, each role's model and pinned settings, prompt versions and fingerprints, an external service's version and build commit when there is one, and its stages with duration, tokens and cost (null, never zero, when unpriced), and no recorded text; each harness MUST own a process version and a changelog entry for each change to what it records, asks of a model or runs.
- **FR-018**: A harness that sends run records to a third-party store that keeps them MUST say so in its description and MUST run only with an explicit operator option; a harness that only calls a model provider the project already calls (as a player or the critic does) MUST NOT need one.
- **FR-019**: An experiment's cast MUST name a harness as `{ name, roles: { <role>: { model, settings } } }`, an older cast naming only a distiller MUST be read as `nams-reviewed`, and the report MUST check the provenance against the cast (the name, and each role's requested and answering model and settings), refuse a difference, and state which roles share a model.
- **FR-020**: A provenance record made before this feature MUST be read as made by `nams-reviewed`, and earlier loop folders MUST remain readable.
- **FR-021**: The report MUST NOT require a review record and MUST NOT refuse a skill arm for a review verdict other than `accept`; it MUST print what the harness's provenance says it did, including review rounds and verdicts.
- **FR-022**: The experiment protocol MUST be amended so that its critic-loop section points to the `nams-reviewed` harness and drops the review gate, its cast and distiller-input sections say a harness is fed the runs the experiment names, and its "harness-based distillation is not decided" amendment is marked resolved; the harness decision record MUST be accepted; the project guidance and the glossary MUST describe the harness, the new command and the cast.
- **FR-023**: The optional comparison MUST distill from the three `wooden_stool` recordings of `claude-fable-5-1` with each harness several times, give each resulting skill to `claude-haiku-5-5` and `nemotron-3-ultra-nvfp4` on `wooden_stool` for five trials each under the version 2 base prompt, and record each generation's provenance and spend and each cell's success and cost in a report.

### Key Entities

- **Harness**: A named distillation process from recorded runs to skills; chosen by name.
- **Session**: One experiment's isolated store inside a harness, with its four operations.
- **Run record**: The documented shape of one finished run as a harness receives it.
- **Skill set**: A non-empty list of skills, written as a root folder of skill folders plus a sidecar.
- **Skill**: A name, a description, files, and optional tags and evidence.
- **Refusal**: The fixed-code result when a harness cannot return a skill set, with the spend so far.
- **Provenance record**: What a harness says it did: its name and process version, roles, prompts, service version, stages and spend.
- **Cast harness entry**: The experiment's declaration of a harness and each role's model and settings.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With a scripted harness, the full lifecycle (open, record two runs, distill, describe, close) completes, and every outcome kind (a set of one, a set of several, each of the four refusals) is produced and recognised in 100% of tested cases.
- **SC-002**: Every file the schemas describe validates against its committed schema in 100% of tested cases, and a change to a definition without its schema file fails a test.
- **SC-003**: No harness input or prompt in any tested case contains a field FR-008 excludes (zero occurrences across all tests).
- **SC-004**: For the same run folders and scripted services, `nams-reviewed` produces the same skill, the same number of review rounds and the same recorded runs as the command it replaces in 100% of tested cases.
- **SC-005**: A session is closed, with nothing it created left behind, in 100% of tested cases including failure and cancellation at each operation.
- **SC-006**: The report is built, and prints the harness's account of itself, for an experiment with no review record, and is refused for a harness name or any role's model or settings that differ from the cast, in 100% of tested cases.
- **SC-007**: The bespoke harness's prompt, over all tested inputs, is built from only its named parts, and a model answer that fails the schema ends as `failed` after the stated retries in 100% of tested cases.
- **SC-008**: No statement remains in the experiment protocol, glossary or project guidance that a skill must be reviewed before a student receives it, or that the distiller is the memory service.
- **SC-009**: (Optional story) The comparison report states, for each harness, the number of generations, the skills' differences and each cell's success and cost, with the number of trials as a caveat.

## Assumptions

- The scripted role, the scripted memory service and a scripted harness are test doubles, not product harnesses; no skill written by hand is a harness's output.
- A subprocess adapter for harnesses in other languages, a bespoke harness that produces several skills, how a student receives a root of several skills or a subset, streaming steps, and evaluating a skill set against the world are out of scope.
- The size limit on recordings passed to a model belongs to each harness that passes them, not to the contract.
- The command's output folder name and layout, and the schema library behind the generated files, are planning choices; earlier loop records stay readable.
- The live comparison reuses `runs/s2-fable-5-1/001` to `003` and the version 2 base prompt, uses a small number of generations per harness, and is run with spend caps and the user's go-ahead.
- No change is made to the engine, the craft server or the run log.
