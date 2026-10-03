# Tasks: Critic Loop in the Harness

**Input**: Design documents from `/specs/005-critic-loop-harness/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. Principle IV and FR-022 require them: write each group's tests first and confirm they fail before the code exists. No test calls a model or the network; roles and the memory service are scripted.

**Organization**: Grouped by user story. Tasks marked **(spends usage)** run real Claude agents; tasks marked **(NAMS write)** change the NAMS account or a workspace. Get the user's go-ahead before each of those, as AGENTS.md requires, and never print `.env` values or pass a key as an argument.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: The user story the task serves (US1 to US4)

## Path Conventions

Single project: `src/loop/` (no SDK import, no engine edits), `src/harness/`, `scripts/`, `test/`, `test/helpers/`. Imports of local files use the `.js` extension (NodeNext). The SDK is imported only in `src/harness/sdk-driver.ts`.

---

## Phase 1: Setup

**Purpose**: Record the two decisions in ADRs (Principle VII), know the baseline, and make room for the loop's output. No dependency is added.

- [X] T001 Amend `design/adr/ADR-003-experiment-protocol.md` and `design/adr/ADR-002-client-otel-trace.md` as drafted in the 2026-10-03 amendments (tool-less schema-answering roles; a designated `loops/` place for model-authored text), so Principle VII is met before any code. Done: both amendments are written and committed on this branch
- [X] T002 Run `pnpm typecheck` and `pnpm test` on the branch and note the passing count, so later phases can show nothing regressed
- [X] T003 [P] Add `loops/` to `.gitignore` (one folder per loop, never committed), and confirm `git status` still shows nothing else new

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The pieces every story uses: skill packages, the diff, the rubric, the two answer schemas, replaying a run into a recording, the error classes, and the scripted role. Each pair is test first, then code.

**⚠️ CRITICAL**: No user story work starts until this phase is complete.

- [X] T004 [P] Write `test/loop-package.test.ts` (must fail first), covering [data-model.md](data-model.md) "Skill package": a folder reads into a path-to-text map and writes back identically; a package without `SKILL.md`, without a front matter `name` or `description`, with a name outside lowercase letters, digits and hyphens, with a path that is absolute or contains `..`, with a non-UTF-8 file, or over the size cap is refused; `sha256` is the hash of `SKILL.md` and equals the installer's fingerprint (`installSkill` in `src/harness/skill.ts`) for the same folder; the citation pattern (`run <digits> call <digits>` or `call <digits>`) is detected in a text; the size limits (64 KB for a package, 32 KB for one file) are enforced and refuse with `LoopRefused`
- [X] T005 Create `src/loop/package.ts` (depends on T004): `readPackage(folder)`, `readPackageFromFiles(map)`, `writePackage(folder, pkg)`, `skillSha256(pkg)`, `hasCitation(text)`; reuse `skillName` from `src/harness/skill.ts`. Make T004 pass
- [X] T006 [P] Write `test/loop-diff.test.ts` (must fail first): a unified diff for add, remove, change, move, empty-to-text, text-to-empty and identical inputs; identical inputs give an empty diff; the diff is deterministic; applying the diff's hunks to the old text gives the new text
- [X] T007 Create `src/loop/diff.ts` (depends on T006): `unifiedDiff(oldText, newText, labels)` over lines with an LCS table, no dependency. Make T006 pass
- [X] T008 [P] Write `test/loop-rubric.test.ts` (must fail first): the shipped `src/loop/rubric/skill-review.v1.json` loads with version `1`, six questions with unique lowercase ids, and the common-knowledge question allows `cannot_determine`; a rubric with a duplicate id, no version or an empty question is refused; `rubricSha256` is stable and changes when a question changes; the file also carries `criticInstructions` and `reviserInstructions`, the hash covers them, and the reviser's instructions state each of the seven rules in [research.md](research.md) R7 (one assertion per rule, on its key phrase), and the critic's state the `cannot_determine` rule
- [X] T009 Create `src/loop/rubric/skill-review.v1.json` (the six ADR-003 §2.6 questions with ids and the text the critic sees) and `src/loop/rubric.ts` (`loadRubric`, `rubricSha256`) (depends on T008). Make T008 pass; write the seven reviser rules and the critic's `cannot_determine` and unshown-fact rules into the instructions (R7), and load them in `rubric.ts`
- [X] T010 [P] Extend `test/errors.test.ts` (must fail first) for the loop errors in [research.md](research.md) R18: `CandidateFailed`, `VerdictInvalid`, `RevisionInvalid`, `RoleFailed`, `WorkspaceRefused`, `LoopCancelled`, `LoopRefused`; each has a code, a fixed message and an optional cause that never reaches the message; `reasonOf` gives `code: fixed message`; `isUserError` is true for `LoopRefused` and `WorkspaceRefused` and false for the others; `RoleFailed` carries a fixed reason when a role call reaches its spend cap (FR-024), and `LoopRefused` is used for the size limits (FR-025)
- [X] T011 Add the loop error classes to `src/harness/errors.ts` and extend `isUserError` (depends on T010). Make T010 pass
- [X] T012 [P] Write `test/loop-verdict.test.ts` (must fail first), covering [contracts/role-io.md](contracts/role-io.md): `Verdict` built from a rubric accepts a valid object; rejects keys that differ from the rubric's ids, an `overall` outside the three values, a `value` over 40 characters, a `reason` over 400, `reasons` over 800, more than 10 revisions or a revision over 300; `Revision` accepts a valid object; rejects `skillMd` without the candidate's name or without a description, with a citation, or empty; rejects an empty `provenanceMd`; rejects a `sourceCalls` entry not shaped like `run NNN call N`; a failed parse yields `VerdictInvalid` or `RevisionInvalid` with fixed text that contains none of the input; `revisionSchema(candidateName, recordings)` rejects a `sourceCalls` entry that names a run not in the loop or a call number beyond that run's call count; the harness appends an `## Uncited changes` section, below the reviser's own provenance text, listing each change with empty `sourceCalls` (FR-026)
- [X] T013 Create `src/loop/verdict.ts` (depends on T005, T009, T011, T012): `verdictSchema(rubric)`, `revisionSchema(candidateName, recordings)`, `withUncitedSection(provenanceMd, changes)`, `toJsonSchema(schema)` using `z.toJSONSchema`, and `parseVerdict` / `parseRevision` that throw the loop errors. Make T012 pass
- [X] T014 [P] Write `test/loop-transcript.test.ts` (must fail first): `replayRun(runDir)` on a run made with the scripted player returns the prompt, the calls with input, output and status, and the final answer; a refusal is `refused`; a run whose log does not replay, whose logged `crafted` or `error` differs from the replay's, or whose trace does not match its log is refused with `ReplayFailed` and nothing else done; the text form contains the prompt, every call and every output and nothing from the world file, the goals file or the notes file; two runs of different goals or worlds are reported as a mismatch by `assertSameTask`; `replayRun` also returns the goal, world, model and call count, taken from the run's score and `mcp.json`
- [X] T015 Create `src/loop/transcript.ts` (depends on T011, T014): `replayRun`, `recordingText`, `assertSameTask`; port `spikes/critic-loop/transcript.ts` and `spikes/rest-ingest/ingest.ts` replay, including the `crafted` and `error` comparison from `src/sim/score.ts`; replay runs on a fresh game through the in-memory craft server. Make T014 pass
- [X] T016 [P] Create `src/harness/role-driver.ts` (types only: `RoleOptions`, `RoleResult`, `RoleDriver`, per [contracts/role-io.md](contracts/role-io.md)) and `test/helpers/fake-role.ts`, a scripted `RoleDriver` that returns a queue of answers, records every prompt it was given (for the blindness tests), can return `ok: false` with a code, and honours the abort signal

**Checkpoint**: `pnpm typecheck && pnpm test` pass; nothing in `src/loop/` imports the SDK, `src/sim/engine.ts`'s internals or `src/mcp` other than the in-memory craft server used by the replay.

---

## Phase 3: User Story 1 - Get a candidate skill from finished runs (Priority: P1)

**Goal**: From one or more finished teacher runs of the same goal, record them to a disposable workspace the harness created, have the distiller generate one skill, download it, and delete the workspace, whatever happens.

**Independent Test**: With the scripted memory service, finished runs go in and a candidate folder comes out; the stand-in saw the writes, the generation request and the deletion of the created workspace, and no other id.

### Tests for User Story 1 (write first, confirm they fail)

- [X] T017 [US1] Create `test/helpers/fake-nams.ts` (shaped from the OpenAPI spec and refined from the probe's fixtures if T021 runs): a scripted `NamsApi` that replays canned responses, can fail any call, records every call (so tests can assert the ids touched), and honours the abort signal
- [X] T018 [P] [US1] Write `test/loop-zip.test.ts`: a zip built in the test with `node:zlib` (stored and deflate entries) reads into a path-to-bytes map; an unsupported method, an encrypted entry, a zip64 archive, a truncated archive and an entry name that is absolute or contains `..` are each refused with a fixed message
- [X] T019 [P] [US1] Write `test/loop-nams.test.ts`, covering [contracts/nams-seam.md](contracts/nams-seam.md): the guard's `assertOwned` accepts only the id the step created; every data method and `deleteWorkspace` throw `WorkspaceRefused` for any other id before a request is made; the id in `NAMS_WORKSPACE_ID` is refused even if added to the set; `deleteWorkspace` refuses an id not in the account's list; the real client, run against a local `fetch` stub, sends `Authorization` and `X-Workspace-Id` and the documented bodies; the key never appears in an error, a log line or a returned object
- [X] T020 [P] [US1] Write `test/loop-candidate.test.ts` using `test/helpers/fake-nams.ts` (T017) for [spec.md](spec.md) US1 scenarios 1 to 6 and its edge cases: several runs of one goal go to one workspace, each as a conversation with the prompt, the calls and the final answer; refused calls are written with status `failure`; runs of different goals or worlds are refused before a workspace is created; a run that does not replay stops the step with nothing written; the workspace is deleted on success, on a failed generation, on a timeout and on abort, and no other id is touched; a failed generation stops with the distiller's reasons and no retry, and the outcome is `reject`; the capabilities response, the run ids, the workspace id and the format are saved with the candidate; a second step on the same runs makes and deletes its own workspace; the loop folder and `workspace.json` exist before the workspace is created, and a crash between creation and deletion leaves the id recorded and not retired; the result carries a duration for each stage (record, wait for extraction, generate, download)

### Implementation for User Story 1

- [X] T021 [US1] **(NAMS write)** Get the user's go-ahead, then probe once on a throwaway workspace (create it, record the three faithful stone-pickaxe runs, generate once, download, delete) with a one-off script `spikes/critic-loop/probe-generate.ts` that reads the key from the environment. Save the run-status values, where the skill id appears, what a gate failure returns and the zip's file list as fixtures under `test/fixtures/nams/`, and update [contracts/nams-seam.md](contracts/nams-seam.md) and [research.md](research.md) R6 with what was found. If the user does not approve it, keep the stand-in as built in T017 and mark the probe as still to do
- [X] T022 [P] [US1] Create `src/loop/zip.ts` (depends on T018): the read-only zip reader on `node:zlib`. Make T018 pass
- [X] T023 [US1] Create `src/loop/nams.ts` (depends on T019, T022, T017): the `NamsApi` interface, the real client (REST with `fetch`, workspace tools through the MCP client as `spikes/faithful-1/workspace.ts` does), `WorkspaceGuard`, and wait helpers with a cap. The key is read from `NAMS_API_KEY` at construction and is never part of any value. Make T019 pass
- [X] T024 [US1] Create `src/loop/candidate.ts` (depends on T015, T020, T023): `obtainCandidate({ runs, format, allowWorkspace, nams, signal })` per FR-001 to FR-007 and [research.md](research.md) R4 to R6: refuse mismatched runs first, create the workspace, record, wait for extraction, generate, wait, download, read the zip into a package, and delete the workspace in a `finally`. Make T020 pass; create `loops/<label>/` and write `workspace.json` before creating the workspace, set `retired` after deleting it, and return the stage timings
- [X] T025 [US1] Run `pnpm typecheck && pnpm test`; confirm no test touched the network and `grep -r "claude-agent-sdk" src/loop` finds nothing

**Checkpoint**: A candidate comes from finished runs with no hand steps, using the stand-in. Story 2 does not depend on this story.

---

## Phase 4: User Story 2 - Review and revise a candidate until accepted or rejected (Priority: P1) 🎯 MVP

**Goal**: Given a candidate package and the recordings, run up to three rounds of a tool-less critic and a tool-less reviser, each a fresh session, and end in `accept` or `reject`.

**Independent Test**: With scripted roles, the sequence of verdicts decides how many rounds run and how the loop ends, and no model is called.

### Tests for User Story 2 (write first, confirm they fail)

- [X] T026 [P] [US2] Write `test/loop-inputs.test.ts`, covering FR-010, FR-011 and SC-003: the critic's prompt holds the rubric, the goal list, the recordings and the current package and nothing else; the reviser's prompt adds only the current verdict; for round 3 neither prompt contains any string from the verdicts or texts of rounds 1 and 2; no prompt contains a world field, a recipe, a path or a solver output; a positive control: when a forbidden string is added to an input source the test detects it in the assembled prompt; each of the seven reviser rules in [research.md](research.md) R7 appears in the assembled reviser prompt; recordings over 150,000 characters are refused with `LoopRefused` naming the limit (FR-025)
- [X] T027 [P] [US2] Write `test/loop-rounds.test.ts` with `test/helpers/fake-role.ts`, covering [spec.md](spec.md) US2 scenarios 1 to 6: accept in round 1 leaves the skill unchanged; revise, revise, accept ends in `accept` with the revised text and two revisions; revise three times ends in `reject` with the reason `round limit reached` and the third revise is not acted on; a `reject` verdict ends at once with its reasons; an invalid verdict stops with `VerdictInvalid` and no agent text in the error; an invalid revision (no name, a citation in `SKILL.md`, a changed name, empty provenance) ends the round as `RevisionInvalid`, not as a revise; a role result with `ok: false` stops with its reason; each critic call gets a prompt built fresh (the scripted role's recorded prompts show it); an abort between rounds returns the finished rounds and `cancelled`; `--max-rounds` below 3 is honoured; a role call that reaches its spend cap stops the loop with a typed error and keeps the finished rounds (FR-024); a revision citing a call that does not exist ends the round as `RevisionInvalid` (FR-026)
- [X] T028 [P] [US2] Write `test/role-options.test.ts` for the new `roleOptionsFor` and `roleResultFrom` in `src/harness/sdk-options.ts`: `tools` is `[]`, there is no `mcpServers`, no `plugins`, `settingSources` is `[]`, `outputFormat` is `json_schema` with the schema given, `maxBudgetUsd` is the cap, the model is the one requested; a result with `structured_output` maps to `ok: true` and the answer; a budget stop, a structured-output retry failure, an error result and a missing result map to `ok: false` with a fixed `code: message` that contains no assistant text; tokens and cost the player did not report are `null`, not `0`

### Implementation for User Story 2

- [X] T029 [US2] Create `src/loop/inputs.ts` (depends on T015, T026, T005, T009): `criticPrompt` and `reviserPrompt` assembled from named parts only, with no function that accepts a path or a free map. Make T026 pass
- [X] T030 [US2] Create `src/loop/loop.ts` (depends on T007, T013, T016, T027, T029): `runLoop({ candidate, recordings, rubric, critic, reviser, roleDriver, maxRounds, maxUsd, signal })` returning a `LoopResult` (rounds with hashes, verdicts, revisions, diffs and stage measurements, the outcome and its reason), following the states in [data-model.md](data-model.md) and R12. Make T027 pass
- [X] T031 [P] [US2] Add `roleOptionsFor` and `roleResultFrom` to `src/harness/sdk-options.ts` (type-only SDK imports, depends on T028) and `sdkRoleDriver` to `src/harness/sdk-driver.ts`; free-form text from the session is discarded. Make T028 pass
- [ ] T032 [P] [US2] Add `test/live-role.test.ts`, skipped unless `LIVE_SDK=1` like `test/live-sdk.test.ts`: one real role call with a tiny prompt and a two-field schema returns a schema-valid answer and reports tokens and cost. **(spends usage)** Written (skipped without `LIVE_SDK=1`); the single live run still needs the user's go-ahead, and its result should note whether the structured-output and budget error subtypes behave as [research.md](research.md) R3 assumes; also confirm that a real reviser call returns a revision that passes the mechanical checks (name kept, no citation in `SKILL.md`, valid `sourceCalls`)
- [X] T033 [US2] Run `pnpm typecheck && pnpm test`; confirm `grep -rn "claude-agent-sdk" src` lists only `sdk-driver.ts` (and type-only `sdk-options.ts`, `role-driver.ts` if it imports types)

**Checkpoint**: The loop runs end to end over scripted roles and a candidate package, in memory. The record, the command and the install check come next.

---

## Phase 5: User Story 3 - Keep what the loop did auditable (Priority: P2)

**Goal**: Write the loop folder: per-round text hashes, verdicts and diffs, the provenance file apart from `SKILL.md`, and agent-authored text only in the places designated for it.

**Independent Test**: Run the loop with scripted roles and read the folder: every round has a hash, a verdict and a diff; the accepted `SKILL.md` has no run or call citations; the provenance file does; the privacy test passes.

### Tests for User Story 3 (write first, confirm they fail)

- [X] T034 [P] [US3] Write `test/loop-record.test.ts` against [contracts/loop-record.md](contracts/loop-record.md): the folder layout; `loop.json` fields; each round's `skill.md` hashes to `skillSha256`; per-round files hold no timestamps, and times live in `stages`; paths are repository-relative and hold no user name; stage figures the player did not report are `null`; `skill/` exists only for `accept`; round snapshots are named `reviewed-skill.txt` (no case variant of `SKILL.md`, since macOS ignores case), so `installSkill` on a round folder throws `SkillNotFound` while on `skill/` it succeeds; the accepted `skill/SKILL.md` hash equals the last round's `skillSha256`; `skill/SKILL.md` has no citation and `references/provenance.md` names a recorded call for every added fact and marks an uncited one; the writer refuses an existing label, never writes into a run folder it read, and never writes into another loop's folder; stage timings include the NAMS stages when the loop ran in runs mode; `references/provenance.md` ends with the harness-generated `## Uncited changes` section when a change had no source
- [X] T035 [P] [US3] Extend `test/privacy.test.ts` (must fail first): run the loop with scripted roles that put a marker in every free-text field and in their free-form text; the marker appears under `loops/<label>/rounds` and `skill/` only, in no file under the run folders the loop read, and in no `reason`; a role that fails leaves no marker in `loop.json`'s `reason`; the role's free-form text is in no file

### Implementation for User Story 3

- [X] T036 [US3] Create `src/loop/record.ts` (depends on T005, T007, T030, T034): `writeLoopRecord(result, options)` per the contract, using `toRepoPath` from `src/harness/paths.ts`; schema fields only are written, never free-form role text. Make T034 pass; write the stage timings the loop and `obtainCandidate` returned
- [X] T037 [US3] Run the extended privacy test and fix any leak it finds (depends on T035, T036); the existing privacy tests must keep passing

**Checkpoint**: A loop's folder lets an auditor recover each round's exact text, verdict and change, and the privacy boundary holds.

---

## Phase 6: User Story 4 - Use the accepted skill for a student run (Priority: P2)

**Goal**: One command from finished runs (or from an existing candidate) to an installable skill, and a student run that records the skill's hash.

**Independent Test**: In candidate mode with scripted roles, the command writes `skill/` on accept and installs through `run-agent.ts --skill` in a dry run; on reject it writes no installable folder.

### Tests for User Story 4 (write first, confirm they fail)

- [X] T038 [P] [US4] Write `test/loop-cli.test.ts`, covering [contracts/cli.md](contracts/cli.md): the refusals (no `--runs`; an unfinished or non-replaying run; runs of different goals or worlds; recordings from more than one model with neither model flag; neither `--candidate` nor `--allow-workspace`; an existing `--label`; `NAMS_API_KEY` missing when a workspace is needed, the message naming the variable and never a value); `--dry-run` prints the plan (runs, goal, models, rubric version, rounds, whether NAMS would be called) and makes no call and writes nothing; candidate mode with scripted roles prints the round lines and `outcome accept` with `skill:`; a reject prints `outcome reject` and no `skill:`; runs mode with the scripted NAMS prints the workspace ids and deletes the one it made; models default to the runs' teacher model from `score.json`; exit codes 0, 1 and 130 (abort writes the finished rounds and deletes the workspace first); an accepted `skill/` installs through the existing `--skill` option in a `run-agent` dry run and a real scripted run, and the run's `score.json` hash equals `loop.json`'s last `skillSha256`; recordings over 150,000 characters or a candidate package over 64 KB (32 KB for one file) are refused naming the limit; `--max-role-usd` reaches the role driver
- [X] T039 [P] [US4] Extend `test/scripts.test.ts` with `scripts/critic-loop.ts`: run as a user would, `--dry-run` with the three faithful stone-pickaxe runs and no network exits 0 and prints the plan; the usage line prints on a missing `--runs`

### Implementation for User Story 4

- [X] T040 [US4] Create `src/loop/cli.ts` (depends on T015, T024, T030, T036, T038) as `runCriticLoopCli(argv, deps)` with the flags, refusals, output lines and exit codes in [contracts/cli.md](contracts/cli.md): candidate mode first, then runs mode wired to `obtainCandidate`, with one abort signal for the NAMS calls and the role calls and a `finally` that deletes the workspace
- [X] T041 [US4] Create `scripts/critic-loop.ts` (depends on T040, T039): a thin wrapper like `scripts/run-agent.ts`, with the same Ctrl-C handling (second Ctrl-C exits at once). Make T038 and T039 pass
- [X] T042 [US4] Run `pnpm typecheck && pnpm test` and the `--dry-run` of [quickstart.md](quickstart.md) step 2

**Checkpoint**: The spike's loop is a command. Candidate mode needs no NAMS write; runs mode needs `--allow-workspace`.

---

## Phase 7: Polish & cross-cutting concerns

**Purpose**: Documentation that must stay true, and the live check of the whole feature.

- [X] T043 [P] Update `AGENTS.md`: the `src/loop/` and `loops/` rows in the layout table, `scripts/critic-loop.ts` in the commands paragraph, the rules (the critic and reviser have no tools; agent-authored text lives only under `loops/`; the SDK still only in `sdk-driver.ts`), and correct the `NAMS_WORKSPACE_ID` note that ADR-003 flagged
- [X] T044 [P] Update `design/adr/ADR-003-experiment-protocol.md`: in the follow-up specs list mark the critic loop and its output schema as specified by spec 005, and in "Not decided" record that the rubric lives in a versioned file (R7); the 2026-10-03 amendments already record the two decisions (T001), so add a further dated line only if a decision changes during implementation
- [X] T045 [P] Add a note to `spikes/critic-loop/log.md` that `spikes/critic-loop/transcript.ts` is superseded by `src/loop/transcript.ts`, and leave the spike's files in place as the record
- [X] T046 Run `pnpm typecheck && pnpm test` and `pnpm build`; fix anything that regressed (depends on all earlier tasks)
- [ ] T047 **(spends usage, NAMS write)** Get the user's go-ahead, then validate [quickstart.md](quickstart.md) steps 3 to 5 live: a loop from the existing candidate, a loop from the three runs with `--allow-workspace` (confirm the workspace is gone afterward), and three Haiku trials with the accepted skill. Check SC-001 to SC-008, record the results in `design/notes/critic-loop-findings.md` as a short "in the harness" section, and note any difference from the spike

---

## Dependencies & execution order

- **Phase 1** can start at once; T001 (the ADR amendments) comes before any code. **Phase 2** blocks every story. Inside Phase 2 each implementation task follows its test, and T013 needs T011 (the error classes) as well as T005 and T009.
- **US1** (Phase 3) and **US2** (Phase 4) are independent of each other and can run in parallel after Phase 2.
- **US3** depends on US2 (it writes a `LoopResult`). **US4** depends on US2 and US3 for candidate mode, and on US1 for runs mode.
- **Phase 7** follows all stories; T047 is last and needs the user's go-ahead.

### Parallel opportunities

- Phase 2 test tasks T004, T006, T008, T010, T012, T014 and T016 touch different files and can be written together; the matching code tasks then run in pairs.
- In US1: T018, T019 and T020 together; T022 beside T017 once the probe (T021) is done.
- In US2: T026, T027 and T028 together; T031 and T032 beside T029 and T030.
- In US3: T034 and T035 together.
- In Phase 7: T043, T044 and T045 together.

```text
Example: after Phase 2, two people can work in parallel
  A: T018 T019 T020 -> T021 -> T022 T017 -> T023 -> T024       (US1)
  B: T026 T027 T028 -> T029 T030 T031                          (US2)
```

## Implementation strategy

**MVP first**: Phase 1, Phase 2, then US2, US3 and the candidate-mode half of US4. That reproduces the spike's loop as a command (`--candidate`) without writing to NAMS, which is the largest value and the lowest risk. Stop and check it against [quickstart.md](quickstart.md) step 3 and the spike's results.

**Then US1**: the memory-service automation. It brings the one outside dependency, so its probe (T021) is the earliest NAMS write in the plan and should be done as soon as the user agrees; its result may change the stand-in, the contract and the zip reader.

**Finally** wire runs mode in the command (the second half of T040), polish the docs, and run the live check (T047).

## Task counts

| Phase | Tasks |
|---|---|
| 1 Setup | 3 |
| 2 Foundational | 13 |
| 3 US1 | 9 |
| 4 US2 | 8 |
| 5 US3 | 4 |
| 6 US4 | 5 |
| 7 Polish | 5 |
| **Total** | **47** |
