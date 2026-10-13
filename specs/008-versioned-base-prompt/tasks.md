---

description: "Task list for the versioned base prompt with a call budget"
---

# Tasks: Versioned Base Prompt with a Call Budget

**Input**: Design documents from `/specs/008-versioned-base-prompt/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Requested. The constitution (Principle IV) and the plan put the test before its implementation in every story.

**Organization**: Tasks are grouped by user story. Story 4 (all kinds) and Story 5 (prompt set) extend the module Story 1 builds, so Phase 2 holds the shared module and Story 1 is the first increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 to US5, mapped to the spec's stories
- Every task names exact file paths; "frozen" means a literal of today's output held in a test

## Phase 1: Setup

- [X] T001 Accept ADR-007, whose 2026-10-13 amendment already covers the four prompt kinds, the layout, the two fingerprints and the prompt set: set `status: accepted` in `design/adr/ADR-007-base-prompt-and-budget.md` and its row in `design/adr/README.md` (the constitution check passes once it is accepted)
- [X] T002 Create the empty tree `prompts/base/`, `prompts/arm-sentence/`, `prompts/skill-tool/`, `prompts/review-rubric/` and the module folder `src/prompts/`

---

## Phase 2: Foundational (blocks every story)

**Purpose**: the prompt module that every kind and every check uses.

- [X] T003 [P] Write `test/prompts.test.ts`: loading a kind's version by number, an unknown kind or version refused, a placeholder outside the kind's list refused, both `{turns}` and `{budget}` refused, a base prompt without `{what}` refused, a version with no `## v<N>` changelog section refused (reuse the heading rule of `hasChangelogEntry` in `src/loop/process.ts`), filling replaces every occurrence and trims, the fingerprint is the SHA-256 of the file's bytes
- [X] T004 Implement `src/prompts/index.ts` (the table of kinds with extension, placeholders (`{budget}` and `{turns}` both allowed in `base`, never together) and word-check rule, `loadVersion`, `listVersions`, `fill`, `fingerprint`, `checkChangelog`) with no import of the AI SDK or of `src/mcp`
- [X] T005 [P] Write `prompts/base/v1.txt` (today's player prompt with `{what}`, `{item}`, `{turns}`) and `prompts/base/CHANGELOG.md` with a `## v1` section
- [X] T006 Write the frozen test in `test/prompts.test.ts`: base v1 filled for a table of goals (quantity 1 and more), step budgets and an optional note equals the legacy `buildPrompt` output held as a literal, byte for byte (SC-001)

**Checkpoint**: the module loads and fills version 1 identically to the code.

---

## Phase 3: User Story 1 - Every run says which prompt it saw (Priority: P1) 🎯 MVP

**Goal**: each run records the base prompt's version and fingerprints, and the report and bundle show them.

**Independent Test**: run the same goal under versions 1 and 2 and under version 1 twice; the records show version and hashes, same-version runs match, and the report warns on differing base hashes (an arm sentence difference is only listed).

### Tests (write first)

- [X] T007 [P] [US1] In `test/harness.test.ts`, a run's `score.json` has `prompt: { version, baseSha256, sha256 }`, `baseSha256 == sha256` without a note and they differ with one, and `prompt.txt` equals the filled text; a run with `--prompt-file` records `custom`
- [X] T008 [P] [US1] In `test/report.test.ts`, runs lacking a `prompt` block are shown as `unversioned`; arms with different `baseSha256` give a warning line; arms differing only in `sha256` give an informational line; identical text under two file names counts as one prompt (FR-006, FR-008)
- [X] T009 [P] [US1] In `test/export.test.ts`, the exported manifest carries the prompt block and `src/viz/contract.ts` accepts and ignores it (FR-007)
- [X] T010 [P] [US1] In `test/cli.test.ts`, `--prompt-version` selects `prompts/base/v<N>.txt`, is exclusive with `--prompt-file`, an unknown version exits 1 before any call, an ad hoc `--prompt-file` template with an unknown placeholder or without `{what}` exits 1 before any call (FR-003), and `--dry-run` prints version and both hashes

### Implementation

- [X] T011 [US1] In `src/harness/run.ts`, make `buildPrompt` delegate to `src/prompts` and return the text with both fingerprints; record the `prompt` block in `writeScore` and the batch `summary.json`
- [X] T012 [US1] In `src/harness/cli.ts`, add `--prompt-version <N>` (default 1), its exclusivity with `--prompt-file`, the refusals, the same placeholder check on a `--prompt-file` template as on a versioned file (FR-003), and the `prompt v<N>` part of each run's line
- [X] T013 [P] [US1] In `src/harness/export.ts`, `src/harness/bundle.ts` and `src/viz/contract.ts`, carry the optional prompt block in the manifest
- [X] T014 [US1] In `src/harness/report.ts`, read the prompt block, show `unversioned`, and add the base-hash warning and the sentence-only note (FR-006)

**Checkpoint**: a run records its prompt; the report notices differences. Story 1 is shippable alone.

---

## Phase 4: User Story 2 - The budget counts tool calls (Priority: P2)

**Goal**: a call budget stated in the prompt and enforced exactly by the driver; the score says how many calls, how many changed the table, how many responses and how many were refused.

**Independent Test**: a scripted model issuing parallel calls across the budget stops with exactly N executed calls in every crossing position.

### Tests (write first)

- [X] T015 [P] [US2] Write `test/call-budget.test.ts` with the SDK's mock model: 5 parallel calls against a budget of 3 (first, middle and last call of a response crossing it): three executed in emission order, two answered with the one fixed line, `budgetRefused: 2`, `ended: budget`, the run log holding three calls, `totalCalls` 3 (verifies research R1, SC-003)
- [X] T016 [P] [US2] In `test/call-budget.test.ts`, the last in-budget call reaching the goal gives `ended: stopped`; a response with no call ends the run as today; loading a skill does not count; a cancelled run keeps its counts with `budgetRefused` 0 (FR-010, FR-013)
- [X] T017 [P] [US2] In `test/ai-options.test.ts`, the pure stop condition and end classification for a call budget (R3, R4), and that a step budget is unchanged
- [X] T018 [P] [US2] In `test/tools-orient.test.ts`, the refusal line is identical for every refused call and names no tool, item or recipe (SC-004)
- [X] T019 [P] [US2] In `test/cli.test.ts`, `--call-budget` with a `{budget}` prompt works; a `{budget}` prompt with only `--max-turns`, a `{turns}` prompt with `--call-budget`, and both flags exit 1 before any call (R6); the run line shows `budget calls <limit> (refused <n>)`

### Implementation

- [X] T020 [US2] In `src/harness/driver.ts`, add `callBudget` to `DriverOptions` and `budgetRefused` to `PlayerResult`
- [X] T021 [US2] In `src/harness/ai-options.ts`, add the call-budget stop condition and the end classification (pure)
- [X] T022 [US2] In `src/harness/ai-driver.ts`, wrap each craft tool's `execute` after `client.tools()` with the counter and the fixed refusal (not the skill tool), end the run after the response that uses the budget, and set the step limit equal to the budget
- [X] T023 [US2] In `src/harness/run.ts`, accept a call budget, map a driver `budget` ending to `stopped` when the replayed log holds the goal (R3), and record `budget` and `budgetRefused` in `score.json` and the batch summary
- [X] T024 [P] [US2] Write `prompts/base/v2.txt` (ADR-007 §2.3 with `{budget}`) and its `## v2` changelog section
- [X] T025 [US2] In `src/harness/cli.ts`, add `--call-budget <n>` and the budget-meaning refusals

**Checkpoint**: a call budget is stated, enforced and recorded.

---

## Phase 5: User Story 4 - Every prompt in play is versioned the same way (Priority: P2)

**Goal**: the arm sentence, the skill tool's description and the review rubric join the scheme; one listing shows them; runs and loops record their versions.

**Independent Test**: `scripts/prompts.ts` lists the four kinds; a review loop and a skill-using run record the versions they used; an earlier loop record still verifies.

### Tests (write first)

- [X] T026 [P] [US4] In `test/prompts.test.ts`, frozen outputs: the S2 sentence of ADR-003 §2.2, the skill tool's description with and without a skill description (today's template in `src/harness/ai-driver.ts`), and the rubric file's SHA-256 `a6e33cf720e4b20e8cc767666d49f29375452d86beec3e1e1cf8e8c2cadc5c5e` at its new path (R12, SC-008)
- [X] T027 [P] [US4] In `test/prompts.test.ts`, the word check: base versions contain no `skill`, `memory` or `learn`; version 2 also no `explore` or `unfamiliar`; the arm sentence and skill tool are exempt (FR-015)
- [X] T028 [P] [US4] In `test/cli.test.ts`, `--arm-sentence <N>` selects a version, is exclusive with `--prompt-note`, and a free-text note records `custom`; a run's `score.json` carries `prompt.armSentence` and, with a skill, `prompt.skillTool`, whose version is `1` without `--skill-tool-version` and the flag's value with it
- [X] T029 [P] [US4] In `test/loop-cli.test.ts` and `test/loop-rubric.test.ts`, the loop record's rubric block gains `kindVersion` and an earlier record without it still reads; the path constant follows the move
- [X] T030 [P] [US4] In `test/prompts-listing.test.ts`, `scripts/prompts.ts` lists every kind, version and fingerprint, and exits 1 for a version with no changelog entry (FR-019)

### Implementation

- [X] T031 [P] [US4] Write `prompts/arm-sentence/v1.txt`, `prompts/skill-tool/v1.txt` (placeholders `{name}`, `{described}`) and their `CHANGELOG.md` files
- [X] T032 [US4] `git mv src/loop/rubric/skill-review.v1.json prompts/review-rubric/v1.json` (bytes unchanged), add `prompts/review-rubric/CHANGELOG.md`, and update `DEFAULT_RUBRIC_PATH` in `src/loop/rubric.ts`
- [X] T033 [US4] Register the three kinds in `src/prompts/index.ts` with their extensions, placeholders and word-check rules
- [X] T034 [US4] In `src/harness/ai-driver.ts` and `src/harness/driver.ts`, take the skill tool's description from its prompt through `DriverOptions`; in `src/harness/run.ts`, record `prompt.armSentence` and `prompt.skillTool`; in `src/harness/cli.ts`, add `--arm-sentence` and `--skill-tool-version` (default 1)
- [X] T035 [US4] In `src/loop/record.ts` and `src/loop/loop.ts`, add the rubric's `kindVersion` to the loop record without changing existing fields
- [X] T036 [P] [US4] Write `scripts/prompts.ts` (the listing, exit 1 on a missing changelog entry)

**Checkpoint**: all four kinds are versioned, listed and recorded.

---

## Phase 6: User Story 5 - An experiment pins the prompt set (Priority: P2)

**Goal**: the experiment summary pins a version per kind, and arms, loops and the report check it.

**Independent Test**: pin a set; an arm with another skill tool version and a loop with another rubric version are refused before any call; the report prints the set.

### Tests (write first)

- [X] T037 [P] [US5] In `test/report.test.ts`, the summary's `promptSet` is parsed and printed; unpinned kinds listed; a run or loop whose recorded version of a pinned kind differs is refused; a summary without `promptSet` reports "not pinned" and is otherwise unchanged (FR-004, FR-006, FR-024)
- [X] T038 [P] [US5] In `test/cli.test.ts`, `--experiment <folder>` refuses an arm whose base version, call budget, arm sentence or skill tool version differs from the set, before any call; a kind the set does not pin is allowed; Story 5 scenario 5 (an arm with a different base version) is covered here
- [X] T039 [P] [US5] In `test/loop-cli.test.ts`, `critic-loop.ts --experiment` refuses a rubric `kindVersion` that differs from `promptSet.reviewRubric` before any spend

### Implementation

- [X] T040 [US5] In `src/prompts/index.ts`, add the prompt set schema (zod) and `checkSet(set, used)` returning the mismatches; reuse it in the three callers
- [X] T041 [US5] In `src/harness/report.ts`, add `promptSet` to the experiment summary schema and the checks, notices and printed set
- [X] T042 [US5] In `src/harness/cli.ts` and `src/loop/cli.ts`, add `--experiment <folder>`, read its `promptSet` and refuse a mismatch before any spend

**Checkpoint**: an experiment's prompts are pinned and checked everywhere.

---

## Phase 7: User Story 3 - Version 2 is measured before it is adopted (Priority: P3)

**Goal**: version 2 exists, passes its checks, and a recorded comparison shows what the wording and call budget do to the three nominated models.

**Independent Test**: version 2 fills and passes the word check; the comparison table exists with both versions' results.

- [X] T043 [P] [US3] In `test/prompts.test.ts`, version 2 filled for `wooden_stool` states the goal, the call budget and "including several made at once", and contains none of the forbidden words (US3 scenarios 1 and 2)
- [X] T044 [US3] Run the comparison from `quickstart.md` step 7: `fireworks/nemotron-3-ultra-nvfp4`, `fireworks/glm-5p3-flash` and `anthropic/claude-fable-5-1` on `wooden_stool` and `glirol`, five trials each, `--prompt-version 2 --call-budget 100 --max-output-tokens 16384 --max-usd 2`, labels `p2-<model>-<goal>`, with a dry run first and a spend check after the first model (30 runs; get the user's go-ahead before the Fable runs)
- [X] T045 [US3] Write `runs/reports/<date>-p2-prompt-version-2.md`: success and cost per model, task and version beside the version 1 runs in `runs/s1-*` and `runs/s2-*`, whether version 2 moved any baseline (SC-005), whether Fable's misses used at least 90% of the budget (SC-006), and the budget size's fate under the rule in ADR-007 §2.1
- [X] T046 [US3] If version 2 moved a baseline, record it in `design/adr/ADR-007-base-prompt-and-budget.md` §6 Amendments with the numbers and name version 2 in the experiment summary

---

## Phase 8: Polish and cross-cutting

- [X] T047 [P] Update `design/adr/ADR-003-experiment-protocol.md` (the meaning of "turn budget" now a call budget, §2.2 and §2.5, as an Amendments entry) and the glossary entry in `design/adr/README.md` (FR-017, FR-023)
- [X] T048 [P] Update `AGENTS.md` (the commands, the layout table with `prompts/` and `src/prompts/`, the run options, the rule that a prompt change is a new version) and `specs/007-ai-sdk-runtime/`'s notes where they name `--max-turns` as the budget (left as they are: `--max-turns` still works as a step budget)
- [X] T049 Check the privacy and leak tests still pass with the new records (`test/privacy.test.ts`, `test/tools-orient.test.ts`) and that nothing in `src/sim/`, `src/mcp/` or `run.jsonl` changed: `git diff main -- src/sim src/mcp` is empty
- [X] T050 Run `pnpm typecheck && pnpm test`, check the exit code directly, and walk `quickstart.md` steps 1 to 8

---

## Dependencies and Execution Order

- Phase 1 then Phase 2 (T003 before T004; T005 and T003 are parallel; T006 after T004 and T005).
- **US1 (Phase 3)** needs Phase 2. It is the MVP.
- **US2 (Phase 4)** needs Phase 2; its prompt side (T024, T025) needs the placeholder check from T004. It does not need US1, but `score.json` fields share `run.ts`, so do US1 first to avoid a merge of the same function.
- **US4 (Phase 5)** needs US1 (the prompt block it extends) and Phase 2.
- **US5 (Phase 6)** needs US1, US2 (for `callBudget`) and US4 (the kinds it checks).
- **US3 (Phase 7)** needs US1, US2, US5 and T024; T044 spends real usage, so it comes last.
- Polish needs all stories.

T034 follows T022 (both edit `src/harness/ai-driver.ts`) and T023 follows T011 (both edit `src/harness/run.ts`).

Within a story: tests first (and seen failing), then implementation; implementation tasks that edit `run.ts`, `cli.ts` or `ai-driver.ts` run in order.

## Parallel opportunities

- Phase 2: T003 with T005.
- US1: T007 to T010 together; then T013 beside T011 and T012.
- US2: T015 to T019 together; T024 beside T020 to T023.
- US4: T026 to T030 together; T031 beside T032; T036 beside T034.
- US5: T037 to T039 together.
- Polish: T047 and T048.

## Implementation Strategy

1. **MVP**: Phases 1 to 3 (T001 to T014): every run records which prompt it saw, and the report notices differences. This alone makes the four existing surveys' prompts comparable.
2. Add US2 (the call budget), then US4 and US5 (the full scheme and the experiment checks), each shippable and tested.
3. Run the comparison (US3) last, because it costs usage and wants everything else in place.
4. Commit per phase: tests, then implementation, then docs, as in earlier specs.
