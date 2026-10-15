---

description: "Task list for the distillation harness interface"
---

# Tasks: The Distillation Harness Interface

**Input**: Design documents from `/specs/009-distillation-harness-interface/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Requested. The constitution (Principle IV) and the plan put the test before its implementation in every story.

**Organization**: Tasks are grouped by user story. Story 1 (the interface and contracts) is the foundation; Story 2 puts today's pipeline behind it, adds the command and changes the report; Stories 3 and 4 add the second harness and the cast and provenance checks; Story 5 is documents; Story 6 is the optional live comparison.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 to US6, mapped to the spec's stories
- Every task names exact file paths; "scripted" means the doubles in `test/helpers/` (`fake-role.ts`, `fake-nams.ts`) and the harness double of T011

## Phase 1: Setup

- [X] T001 Accept ADR-008: set `status: accepted` in `design/adr/ADR-008-distillation-harness-interface.md` and its row in `design/adr/README.md` (the constitution check passes once it is accepted)
- [X] T002 Create `src/distill/`, `src/distill/harnesses/`, `schemas/` and `prompts/distiller/`

---

## Phase 2: Foundational (blocks every story)

- [X] T003 [P] Add `HarnessRefused` (a user error with a fixed code and message, for an unknown harness name, a request that names an unrecorded run, a closed session) to `src/harness/errors.ts` and to `isUserError`, with a test in `test/distill-lifecycle.test.ts`

---

## Phase 3: User Story 1 - Any distillation process behind one contract (Priority: P1) 🎯 MVP

**Goal**: the interface, the registry, the two schemas and a run-record builder, exercised by a scripted harness.

**Independent Test**: with the scripted harness, open a session, record two runs, distill, describe and close; repeat with each refusal and with cancellation; validate the exchanged data against the committed schemas.

### Tests (write first)

- [X] T004 [P] [US1] `test/distill-schemas.test.ts`: the committed `schemas/*.json` equal what `src/distill/schemas.ts` generates (drift); the run record's property tree equals a committed allowlist literal; no property at any depth is named `score`, `reached`, `solver`, `bestRun`, `extraCalls`, `goalRole`, `role`, `world`, `goals`, `duration`, `durationMs`, `startMs` or `neededCalls`; a record with an excluded field is invalid; `reasoning` is `returned`, `partial` or `none` and a turn's `reasoning` may be absent; a skill set of one is valid and an empty one is not (FR-007 to FR-010, SC-002, SC-003)
- [X] T005 [P] [US1] `test/distill-lifecycle.test.ts`: with the scripted harness (T011): open, record two runs, distill over both, describe and close; recording an id twice changes nothing; a request with no ids or an unrecorded id is refused before any work; each refusal code (`no_skill`, `spend_limit`, `cancelled`, `failed`) is returned with the spend so far and never an empty set; `close` releases what the session created after every outcome and after cancellation at each operation, and twice is safe; `record` after `close` is refused; an unknown harness name is refused with the known names (FR-001 to FR-006, SC-001, SC-005)
- [X] T006 [P] [US1] `test/distill-skill-set.test.ts`: a skill set written to disk is one root with a folder per skill and `skill-set.json` beside them (tags and evidence, never inside a folder); reading it back gives the same skills, tags and evidence; names are unique; a path that leaves its folder or a file over the size limits is refused; a skill folder installs as it is (FR-011)
- [X] T007 [P] [US1] `test/distill-run-record.test.ts`: `toRunRecord` over a replayed finished run (`test/helpers/finished-run.ts`) validates against the schema, carries the prompt, models, settings, turns with reasoning, calls with regenerated outputs and statuses and the final answer, and none of the excluded fields; a run with no conversation file gets `reasoning: "none"` and no invented reasoning (R5)

### Implementation

- [X] T008 [US1] `src/distill/schemas.ts`: zod definitions for `RunRecord`, `SkillSet` and `Provenance` (strict), their inferred types, and `jsonSchemaOf` using `z.toJSONSchema` with sorted keys; `scripts/schemas.ts` writes `schemas/run-record.v1.json` and `schemas/skill-set.v1.json`, and the files are committed
- [X] T009 [US1] `src/distill/harness.ts`: `Harness`, `Session`, `DistillRequest`, `DistillResult`, `Refusal` and its four codes, `Stage`; `checkRequest(request, recorded)` refusing an empty or unknown id list before any work; and `src/distill/registry.ts`, the table of harness names to constructors (empty at first, filled by later stories) with the unknown-name refusal
- [X] T010 [P] [US1] `src/distill/run-record.ts`: `toRunRecord(recording)` (R5), dropping the goal, world path and timings
- [X] T011 [P] [US1] `test/helpers/fake-harness.ts`: the scripted harness double (records what it was given, returns a configured skill set or refusal, counts `close` calls, can be made to fail or wait at each operation)
- [X] T012 [P] [US1] `src/distill/skill-set.ts`: write a skill set as a root folder plus sidecar and read one back, through `packageFromFiles` (`src/loop/package.ts`) for the checks

**Checkpoint**: the interface and both contracts exist and are tested without any real harness. Story 1 is shippable alone.

---

## Phase 4: User Story 2 - Today's pipeline as the first harness, and the report that follows (Priority: P1)

**Goal**: `nams-reviewed` runs today's pipeline behind the interface; `scripts/distill.ts` replaces `scripts/critic-loop.ts`; the report stops requiring a review record.

**Independent Test**: with the scripted service and roles, the new command over run folders gives the same skill, rounds and recorded runs as the old pipeline for the same input; the report is built with no review record.

### Tests (write first)

- [X] T013 [P] [US2] `test/distill-nams-reviewed.test.ts`: through the adapter with `fake-nams` and `fake-role`, the skill, the number of rounds and the recorded runs equal the old `obtainCandidate` plus `runLoop` for the same input (SC-004); `open` refuses without the workspace option before any account write; the forbidden workspace id (`NAMS_WORKSPACE_ID`) is never touched; generation is asked for one skill; `record` of the same id twice records once; `close` deletes the workspace after success, failure and cancellation; the conversation built from a `RunRecord` equals what the old step wrote from the `Recording`; outcomes map as research R9 (cancel to `cancelled`, spend cap to `spend_limit`, a critic `reject` or no skill to `no_skill`, other typed failures to `failed`), each with the spend so far (FR-012, SC-004, SC-005)
- [X] T014 [P] [US2] `test/distill-cli.test.ts` (the loop CLI's cases moved to the new command, same scripted dependencies): a dry run spends nothing and prints the harness, runs, models and prompt versions; `nams-reviewed` without `--allow-workspace` exits 1 before any call; an unknown harness exits 1; spend caps and cancellation behave as `critic-loop.ts` did (cancel ends the round and writes the record of what finished); the output folder holds `harness.json`, `skills/` (with the sidecar) and the harness's working files; run folders may follow `--runs` without repeating it (FR-016)
- [X] T015 [P] [US2] `test/report.test.ts`: an experiment with a skill arm and no `review.json` and no distillation record builds and says "no distillation record named"; a `distillation.record` is read (a `harness.json`, and a legacy `loop.json` as `nams-reviewed`); a legacy `review.json` naming a loop is read as that record with no verdict enforced; a verdict of `reject` does not refuse; a skill-arm run whose skill hash is not in the record is refused (FR-021, R7)
- [X] T016 [P] [US2] `test/distill-provenance.test.ts`: `readProvenance` converts a legacy `loop.json` (roles, service, rounds, final skill hash, rubric) to the provenance shape as `nams-reviewed`, and a record with `mode: candidate` reads with no service and no recorded runs; a written provenance holds no recorded text (a sweep over its JSON for the run text and prompt fixtures) (FR-020, SC-006)

### Implementation

- [X] T017 [US2] `src/loop/candidate.ts`: split the pipeline into a `NamsSession` with `open`, `recordRun`, `generate` and `close` (the workspace file, guard, polling and conversation helpers unchanged), and make `obtainCandidate` compose them, so `test/loop-candidate.test.ts` still passes unchanged
- [X] T018 [US2] `src/distill/provenance.ts`: the provenance writer (`harness.json`), `readProvenance` for a `harness.json` or a legacy `loop.json`, and the fixed-code `reason`
- [X] T019 [US2] `src/distill/harnesses/nams-reviewed.ts`: the adapter over `NamsSession` and `runLoop` (`distill` generates over the named runs' conversations, downloads, reviews, and returns a skill set of one or a refusal per R9); `describe()` with the service version, rounds and verdicts (hashes and verdict values), prompt versions and `retainedExternally: true`; registered in `src/distill/registry.ts`
- [X] T020 [US2] `src/distill/cli.ts` and `scripts/distill.ts`: `--harness`, `--runs`, `--allow-workspace`, `--critic-model`, `--reviser-model`, `--format`, `--max-rounds`, `--max-role-usd`, `--timeout-minutes`, `--out distills`, `--label`, `--settings`, `--dry-run`, built from the loop CLI's structure (replay each folder, `toRunRecord`, open, record, distill, write the skill set and `harness.json`, close in `finally`); exit codes 0, 130 and 1
- [X] T021 [US2] Remove `scripts/critic-loop.ts` and `src/loop/cli.ts`, move `test/loop-cli.test.ts` and `test/live-critic-loop.test.ts` to the new command (`test/distill-cli.test.ts`, `test/live-distill.test.ts`), and fix every import
- [X] T022 [US2] `src/harness/report.ts`: add `distillation: { record }` to the experiment summary schema; read it (or a legacy `review.json`'s `loop` path) through `readProvenance`; drop `reviewSchema`, the required `review.json` and the verdict gate; check each skill-arm run's skill hash against the record's skills; print the record's account of itself including rounds and verdicts; say "no distillation record named" when there is none

**Checkpoint**: today's pipeline runs behind the interface through the new command, and the report no longer gates on a verdict.

---

## Phase 5: User Story 3 - A second harness with no outside service (Priority: P2)

**Goal**: `bespoke-one-shot`, one tool-less model call with a versioned instructions prompt.

**Independent Test**: with a scripted role, open, record two runs, distill and check the skill, its citations, its provenance and the prompt's parts.

### Tests (write first)

- [x] T023 [P] [US3] `test/distill-bespoke.test.ts`: `distill` makes one role call with no tools, system from the `distiller` prompt, prompt from the recordings as text and nothing else; the prompt holds none of the excluded fields (score, solver output, goal role, needed-calls label, world or goals file) over a set of fixtures (FR-015, SC-003); the answer schema and `check` reject a body with no run and call citation, a bad name, an oversized package, without echoing the answer; a failing answer ends as a `failed` refusal after the existing retry limit with the spend so far; recordings over the size limit are refused with a fixed code before any call; the model comes from the cast and the call is priced and capped; the skill passes `packageFromFiles` and evidence from the answer lands in the set (FR-013, SC-007)
- [x] T024 [P] [US3] `test/prompts.test.ts` and `test/prompt-set.test.ts`: `distiller` is a fifth kind (`.txt`, no placeholders, no word check), listed by `listPrompts`, refused without a changelog section, and pinnable as `promptSet.distiller` and checked by `--experiment` on the new command (FR-014)

### Implementation

- [x] T025 [P] [US3] `prompts/distiller/v1.txt` (neutral instructions: what the recordings support, how it was found, any rule that generalises, what did not work, each with a run and call citation, nothing beyond the recordings; no mention of the project's findings or of a world) and `prompts/distiller/CHANGELOG.md` with a `## v1` section
- [x] T026 [US3] `src/prompts/index.ts` and `src/prompts/set.ts`: add the `distiller` kind to `KIND_NAMES` and `KINDS`, the optional `distiller` key to the prompt set schema and `checkSet`, and the labels
- [x] T027 [US3] `src/distill/harnesses/bespoke-one-shot.ts`: the harness over `RoleDriver` (R10): record keeps the run, `distill` builds the named parts, calls the role with the answer schema and `check`, assembles one skill, returns a skill set of one or a refusal; `describe()` with the model, settings, prompt version and fingerprint, price quote, stages and spend, and `retainedExternally: false`; registered in `src/distill/registry.ts`; `--distiller-model` added to `src/distill/cli.ts`

**Checkpoint**: two harnesses behind one interface, one with an outside service and one without.

---

## Phase 6: User Story 4 - The cast and provenance name the harness (Priority: P2)

**Goal**: the experiment's cast names the harness, and the report checks provenance against it.

**Independent Test**: a report from a matching cast and record, then with a mismatched harness name, role model or settings, and with an older cast.

### Tests (write first)

- [x] T028 [P] [US4] `test/report.test.ts`: `cast.harness` parses; an older `cast` with `distiller` and with `models` is read as `nams-reviewed` with roles `critic` and `reviser`; the report prints the harness, each role's model and settings and which roles share a model (including with the teacher or student); a record whose harness name, or any role's requested model, answering model or settings differ from the cast is refused naming the difference; `promptSet.distiller` is checked against the record's `prompts.distiller` (FR-017, FR-019, SC-006)
- [x] T029 [P] [US4] `test/privacy.test.ts` and `test/distill-provenance.test.ts`: a provenance record holds hashes, settings, identifiers and fixed codes and no recorded text, no key and no absolute path; `retainedExternally` is true for `nams-reviewed` and false for `bespoke-one-shot`, and `nams-reviewed` refuses without its option while `bespoke-one-shot` needs none (FR-018)
- [x] T030 [P] [US4] `test/distill-process.test.ts`: each harness has a process version and the changelog check fails when one has no entry in its section of `design/notes/skill-process.md` (R8)

### Implementation

- [x] T031 [US4] `src/harness/report.ts`: `castOf` and the cast schema accept `cast.harness` and map the older forms; the harness check against the provenance (name, each role's requested and answering model and settings), the shared-roles line and the distiller prompt pin
- [x] T032 [P] [US4] `src/loop/process.ts` and `design/notes/skill-process.md`: per-harness process versions (`nams-reviewed` bumped for the new record, `bespoke-one-shot` at 1), one section per harness, and the changelog test over both
- [x] T033 [US4] `src/distill/provenance.ts`: the `prompts`, `roles`, `retainedExternally` and `outcome` fields complete for both harnesses, written by the command

**Checkpoint**: what a harness did, and what the experiment said it would do, are checked against each other.

---

## Phase 7: User Story 5 - The protocol document shrinks to match (Priority: P3)

**Goal**: the documents say what the code does.

**Independent Test**: no statement remains that a skill must be reviewed before a student receives it, or that the distiller is the memory service.

- [x] T034 [US5] `design/adr/ADR-003-experiment-protocol.md`: an Amendments entry that reduces its scope (§2.6 becomes a pointer to the `nams-reviewed` harness and the review gate is dropped; the cast and the distiller's input in §2.1 and §2.4 to §2.5 become "a harness (ADR-008) fed the runs the experiment names"; the bullet "Not decided here: harness-based distillation" is marked resolved)
- [x] T035 [P] [US5] `AGENTS.md` and `design/adr/README.md`: the harness, `scripts/distill.ts` and `scripts/schemas.ts` replacing `critic-loop.ts`, the layout rows (`src/distill/`, `schemas/`), the cast shape, `distills/`, and glossary entries for *distillation harness*, *session* and *skill set*; rename the "Critic loop rules" section to cover the `nams-reviewed` harness and keep its rules
- [x] T036 [P] [US5] `design/project-plan.md`: §7's table updated to the harness names and the status of D1 to D3; and a sweep of `design/notes/` and `specs/` for statements that review is a gate (leave historical notes and add a one-line pointer to ADR-008 where one would mislead)

---

## Phase 8: User Story 6 - Comparing the two harnesses (Priority: P3, optional)

**Goal**: an answer to whether the memory service adds anything over a bare model call, on identical recordings.

**Independent Test**: the report lists each generation's provenance and spend and each student cell.

- [x] T037 [US6] Dry runs first, then, with the user's go-ahead for the NAMS and Fable-priced parts, run `scripts/distill.ts` three times per harness over `runs/s2-fable-5-1/001` to `003` with labels `cmp-nams-reviewed-1..3` and `cmp-bespoke-1..3` (`nams-reviewed` with `--allow-workspace`, critic and reviser `fireworks/glm-5p3-flash`; `bespoke-one-shot` with `--distiller-model fireworks/glm-5p3-flash`), spend caps as stated in the quickstart
- [x] T038 [US6] For each of the six skills, run `claude-haiku-5-5` and `nemotron-3-ultra-nvfp4` on `wooden_stool` five times with `--skill distills/<label>/skills/<name> --prompt-version 2 --call-budget 100`, labels `cmp-<harness>-<n>-<student>`, with a dry run first and a spend check after the first student
- [x] T039 [US6] Write `runs/reports/<date>-harness-comparison.md`: each generation's provenance (model, prompt versions, stages, spend), how the skills differ (recipe card or rule, citations, length), each cell's success and cost beside the unaided results (`runs/s2-*`), the number of generations and trials as a caveat, and what it does and does not show

---

## Phase 9: Polish and cross-cutting

- [x] T040 [P] Check that the privacy and leak tests pass with the new records, that nothing in `src/sim/`, `src/mcp/` or `run.jsonl` changed (`git diff main -- src/sim src/mcp` is empty), and that `src/distill/` imports no AI SDK
- [x] T041 Run `pnpm typecheck && pnpm test`, check the exit code directly, regenerate `schemas/` with `pnpm dev scripts/schemas.ts` and confirm `git diff schemas/` is empty, and walk `quickstart.md` steps 1 to 7 (step 8 is T037 to T039)

---

## Dependencies and Execution Order

- Phase 1, then Phase 2.
- **US1 (Phase 3)** needs Phases 1 and 2. T008 before T009 and T010; T011 and T012 are independent.
- **US2 (Phase 4)** needs US1. T017 before T019; T018 before T019 and T022; T019 before T020; T021 after T020 and T022.
- **US3 (Phase 5)** needs US1 and the CLI of T020 (T027 adds an option to it); T026 before T027.
- **US4 (Phase 6)** needs US2 (the report's record reading) and US3 (the second harness's provenance).
- **US5 (Phase 7)** needs US2 to US4 done in behaviour; T034 to T036 can be drafted earlier and finished last.
- **US6 (Phase 8)** needs US2 to US4 and spends real usage, so it comes last; T037 and T038 need the user's go-ahead.
- Polish needs all stories except US6.

Tasks that edit `src/harness/report.ts` (T022, T031) and `src/distill/cli.ts` (T020, T027) run in order. Within a story: tests first (and seen failing), then implementation.

## Parallel opportunities

- US1: T004 to T007 together; then T010 to T012 beside T008 and T009.
- US2: T013 to T016 together.
- US3: T023 and T024 together; T025 beside T026.
- US4: T028 to T030 together; T032 beside T031.
- US5: T035 and T036 together.

## Implementation Strategy

1. **MVP**: Phases 1 to 3 (T001 to T012): the interface, the registry and the two schemas, tested with a scripted harness and no real pipeline moved.
2. Phase 4 puts today's pipeline behind it and replaces the command and the report's gate; Phases 5 and 6 add the second harness and the cast and provenance checks.
3. The documents (US5) are written alongside and finished last; the live comparison (US6) runs last because it costs usage and the memory service's account.
4. Commit per phase: tests, then implementation, then docs, as in earlier specs.
