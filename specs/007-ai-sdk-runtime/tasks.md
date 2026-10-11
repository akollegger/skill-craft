---

description: "Task list for completing the AI SDK runtime (ADR-005)"
---

# Tasks: Complete the AI SDK Runtime

**Input**: Design documents from `/specs/007-ai-sdk-runtime/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required. Constitution Principle IV and FR-017 make every requirement's test come before its code. Within each story, write the tests first and see them fail. Live checks are gated tests (`LIVE_SDK=1`) and do not replace the scripted tests.

**Organization**: Grouped by user story so each can be built and checked alone. Stories are in priority order (P1, P2, P3), which is not their number order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story the task serves (US1 to US7)
- File paths are from the repository root

## Spend and approvals

Tasks marked **(spends)** call a real model. Get the user's go-ahead before the first one, state the cost cap in the task, and load keys with `set -a; source ./.env; set +a` without printing them. Total caps: live checks US$10, calibration rerun US$5. Nothing here writes to NAMS.

---

## Phase 1: Setup

**Purpose**: confirm the starting point and add the shared live-test helper.

- [ ] T001 Confirm the baseline on branch `007-ai-sdk-runtime`: `pnpm typecheck` and `pnpm test` pass, and `git status` shows only `dist-viz/` untracked.
- [ ] T002 [P] Add `test/helpers/live.ts`: a `live` flag (`process.env["LIVE_SDK"] === "1"`), a `skipUnlessKey(name)` guard that skips a check whose provider key variable is unset, and `writeCheckRecord(file, text)` that writes a check's record under `design/notes/`. It must never read or print a key's value.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: the provider table and canonical model names (FR-001, FR-002). Every story reads a model's canonical spec, and the reported-model and cost work needs a table row to normalise through.

**Critical**: no story starts until this phase is done.

### Tests first

- [ ] T003 [P] Write `test/providers.test.ts`: the table has rows for `anthropic` and `fireworks`; `parseModelSpec` returns the canonical spec (`anthropic/claude-sonnet-5-5` for both `claude-sonnet-5-5` and `anthropic/claude-sonnet-5-5`; `fireworks/gpt-oss-120b` with id `accounts/fireworks/models/gpt-oss-120b`; a full `accounts/…` path kept); a spec round-trips; an unknown prefix throws `UnknownProvider` with the fixed message listing the prefixes; a bare non-Claude name throws; a row with `routed: true` and no `pinnedBackend` throws `BackendNotPinned`; `normaliseReported` maps `accounts/fireworks/models/x` to `fireworks/x` and a Claude id to `anthropic/<id>`.
- [ ] T004 [P] Extend `test/ai-options.test.ts`: `loadPrices` returns canonical keys and reads a bare Claude key as `anthropic/<id>`; a price lookup by a bare id finds the canonical entry; `costOf` is unchanged; `canonicalSpec(s)` returns `anthropic/<id>` for a bare `claude-…` id and leaves a canonical spec unchanged.

### Implementation

- [ ] T005 Add `UnknownProvider` and `BackendNotPinned` to `src/harness/errors.ts` (fixed messages from contracts/provider-table.md); keep `UnknownModel`.
- [ ] T006 Create `src/harness/providers.ts` with the table and its row type (data-model.md): `prefix`, `package`, `factory`, `keyEnv`, `expand`, `normaliseReported`, `routed` and `pinnedBackend`, `usageReport`, `settings`, `callOptions`, optional `reportedCost`. It imports no provider package and no SDK. Rows for Anthropic and Fireworks; validate rows when the table loads.
- [ ] T007 Change `src/harness/models.ts`: `parseModelSpec` reads the table and returns canonical `{ provider, id, spec }`; `DEFAULT_MODEL` becomes `anthropic/claude-sonnet-5-5`; `loadPrices` canonicalises keys and `priceFor(spec)` accepts either form. Make T003 and T004 pass.
- [ ] T008 `src/harness/models.ts`: add `canonicalSpec(s)`, which reads a bare Claude id as `anthropic/<id>` and leaves a canonical spec unchanged; it never rewrites a file. Make the T004 cases pass.
- [ ] T009 Apply `canonicalSpec` wherever a recorded model is read: `src/loop/cli.ts` (the teacher models behind the critic and reviser fallback, around line 110) and `src/harness/report.ts`; grep for other readers of `model.resolved` (`src/harness/bundle.ts`, `src/harness/export.ts`) and cover each. Tests first: `test/loop-cli.test.ts` (an old `score.json` with a bare Claude id gives the fallback model `anthropic/<id>`) and `test/report.test.ts` (old and new runs of one Claude model group in one row).
- [ ] T010 Rewrite `prices.json` with canonical keys (`anthropic/claude-opus-5-5`, `anthropic/claude-sonnet-5-5`, `anthropic/claude-haiku-4-5`, `anthropic/claude-haiku-4-5-20251001`); keep the note key.
- [ ] T011 Change `src/harness/ai-driver.ts`: `languageModel(ref)` finds the row, runs `await import(row.package)`, calls the named factory and the model id; a missing key variable ends the run with `DriverFailed: the player reported api_key_missing`, naming the variable. Remove the Anthropic and Fireworks static imports. Extend `test/ai-driver.test.ts` first with a scripted row that proves the driver builds a model through the table alone.
- [ ] T012 Update the tests that assume bare Claude names: `test/harness.test.ts` and `test/scripts.test.ts` (the dry-run plan's default model is `anthropic/claude-sonnet-5-5`). The readers of old records are covered by T009.

**Checkpoint**: `pnpm typecheck` and `pnpm test` pass; a model is `<provider>/<model>` everywhere it is recorded.

---

## Phase 3: User Story 1 - Know which model ran and what the run cost (Priority: P1) MVP

**Goal**: each run records the model asked for and the model the provider reports, a computed cost with provider-reported cost beside it, and every total states its unpriced runs.

**Independent Test**: a scripted player whose provider reports a different model, and a mix of priced and unpriced runs. The score, summary and report show the substitution and the unpriced count.

### Tests first

- [ ] T013 [P] [US1] Extend `test/recorder.test.ts`: a request's model is the last one named by its `message_start` or `message_delta` event; a usage event that names none leaves the start event's model.
- [ ] T014 [P] [US1] Extend `test/measure.test.ts`: request lines that carry the reported model agree with the result's `modelsUsed`; a trace whose models differ from the result's is still `trace: "mismatch"`.
- [ ] T015 [P] [US1] Extend `test/ai-driver.test.ts`: a scripted model whose step reports `response.modelId` differing from the request yields `modelsUsed` and `initModel` as the normalised reported ids; a step that reports none falls back to the requested spec; the trace's request lines carry the reported id.
- [ ] T016 [P] [US1] Extend `test/harness.test.ts`: `aggregate` returns `pricedRuns` and `unpricedRuns`, and `totalCostUsd` sums priced runs only; a label whose runs differ in the model that ran has `mixedModels`; `score.json` holds `reportedCostUsd` only when the driver reports one (use a scripted driver).
- [ ] T017 [P] [US1] Extend `test/report.test.ts`: every printed cost carries `(N unpriced)`, and a label of only unpriced runs prints `-` for cost.
- [ ] T018 [P] [US1] Extend `test/report.test.ts`: a summary that declares `claude-haiku-4-5-20251001` and runs that resolved `anthropic/claude-haiku-4-5-20251001` report as one row; a run that resolved a different model still raises `ReportRefused`.
- [ ] T019 [P] [US1] Extend `test/privacy.test.ts`: the allowed `score.json` keys include `reportedCostUsd`, and `summary.json`'s aggregate keys include `pricedRuns` and `unpricedRuns`.

### Implementation

- [ ] T020 [US1] `src/trace/recorder.ts`: take a request's model from the last event that names one. Change `requestUsage` in `src/harness/ai-options.ts` to carry the model.
- [ ] T021 [US1] `src/harness/ai-driver.ts`: collect each step's `response.modelId`, normalise it through the row (`normaliseReported`), return the sorted set as `modelsUsed` and the first as `initModel`; name the reported id on the usage event; read the row's optional `reportedCost` from the provider metadata and sum it into the result's `reportedCostUsd`.
- [ ] T022 [US1] `src/harness/driver.ts` and `src/harness/run.ts`: add optional `reportedCostUsd` to `PlayerResult` and the score; extend `aggregate` with `pricedRuns` and `unpricedRuns` and fix `totalCostUsd`.
- [ ] T023 [US1] `src/harness/report.ts`: print the unpriced count beside every cost and `-` for a label with no priced run; extend the zod score schema with the optional field.
- [ ] T024 [US1] `src/harness/report.ts` (around lines 155 and 186): compare the summary's declared model and each run's resolved models through `canonicalSpec`, and group rows by the canonical string (make T018 pass). A provider that reports a different id from the one declared stays refused: it is a substitution.
- [ ] T025 [US1] Update the key lists in `test/privacy.test.ts` for the new fields (T019) and make T013 to T019 pass.

**Checkpoint**: US1 stands alone: the substitution and unpriced scenarios pass in the scripted tests.

---

## Phase 4: User Story 2 - Add a provider without touching the run loop (Priority: P1)

**Goal**: a provider is one table row, its package and price entries; refusals and the admission probe are in place.

**Independent Test**: add a scripted provider through the table alone; a player and a role run on it and no other source file changes.

### Tests first

- [ ] T026 [P] [US2] Extend `test/providers.test.ts`: a scripted row added to the table is usable by `parseModelSpec` and `aiDriver` with no other change (SC-003); a routed row with a pinned backend is accepted and records `model.backend` from the response; the same row without one is refused; two scripted runs of a routed model that report different backends make the experiment `mixedModels`.
- [ ] T027 [P] [US2] Extend `test/scripts.test.ts`: `run-agent.ts --model mistral/large --dry-run` exits 1 with `provider 'mistral' is not available; the providers are anthropic, fireworks`, creates nothing, and shows no key.
- [ ] T028 [P] [US2] Extend `test/ai-driver.test.ts`: with the key variable unset, a run ends with `DriverFailed: the player reported api_key_missing`, the reason names the variable, and no value appears anywhere in the result.

### Implementation

- [ ] T029 [US2] `src/harness/run.ts` `planExperiment`: refuse an unknown provider or an unpinned router before anything is created, using the table (make T026 and T027 pass).
- [ ] T030 [US2] `src/harness/providers.ts`, `src/harness/ai-driver.ts`, `src/harness/run.ts`: add the optional row hook `backend(meta)`; the driver records the backend a routed response reports in `model.backend`; `aggregate` counts runs whose backends differ as `mixedModels` (make the routed-provider cases in T026 pass).
- [ ] T031 [US2] Generalise `spikes/fireworks/probe-tools.ts` and `probe-schema.ts` to take `<provider>/<model>`, read the row for the key and base address, and print structure only (contracts/cli.md); keep their output free of agent text and reasoning.
- [ ] T032 [US2] Write the admission procedure into `spikes/fireworks/README.md` (the probe's findings to record, the usage-report rule, how a routed row is pinned), pointing at contracts/provider-table.md; add `ANTHROPIC_API_KEY` and `FIREWORKS_API_KEY` guidance and a comment on adding a key variable to `.env.example`.
- [ ] T033 [US2] **(spends, cap US$0.50)** Run the generalised probes for `anthropic/claude-haiku-4-5-20251001` and `fireworks/gpt-oss-120b`, and write `design/notes/provider-admission.md` with each provider's findings: tool calls, schema answers, settings refused, reasoning handling, usage fields reported, and whether it has a usage report. Take the Fireworks findings from `spikes/fireworks/log.md` and confirm them with the new probe. Set each row's `settings` and `usageReport` from the findings.

**Checkpoint**: US1 and US2 together are the MVP: model and cost records plus a table a provider can be added to.

---

## Phase 5: User Story 3 - Run Claude without paying full price for every request (Priority: P2)

**Goal**: a 40-turn Claude run reads at least 80% of its input from the cache.

**Independent Test**: a scripted Claude call shows the cache option on every request; one measured Claude run meets the target.

### Tests first

- [ ] T034 [P] [US3] Extend `test/ai-driver.test.ts`: every model call to the Anthropic row carries the cache option (`providerOptions.anthropic.cacheControl` of type `ephemeral`), and a call to a Fireworks row carries none; a provider that reports no cache figure records it as zero in the trace and in the run's token counts.
- [ ] T035 [P] [US3] Extend `test/providers.test.ts`: the Anthropic row's `callOptions` returns the cache option, the Fireworks row's returns none.

### Implementation

- [ ] T036 [US3] `src/harness/providers.ts` and `src/harness/ai-driver.ts`: the Anthropic row's `callOptions` returns the cache option and the driver passes it on every call (make T034 and T035 pass).
- [ ] T037 [US3] **(spends, cap US$1)** Run `quickstart.md` B1 (one 40-turn Claude run). Read `score.json`: at least 80% of input tokens are cache reads (SC-004). If not, add the fallback in research R4 (a cache breakpoint on the last message in `prepareStep`), with a scripted test first, and run B1 again.

**Checkpoint**: Claude cost is no longer dominated by uncached input; later spends are cheaper.

---

## Phase 6: User Story 4 - Pin the settings that change a model's behaviour (Priority: P2)

**Goal**: thinking, effort and temperature are pinned per model, refused up front where the table knows, recorded in the run and the experiment summary; the faithful world's calibration is rerun on the new runtime.

**Independent Test**: start an experiment with settings for two models; each score shows the settings it used, and a refused setting is rejected before anything is spent.

### Tests first

- [ ] T038 [P] [US4] Extend `test/providers.test.ts`: the Anthropic row refuses `temperature` and `thinking: "off"` for the models whose rules say so and accepts `effort` and `thinking: "adaptive"`; the Fireworks row accepts `temperature`; `SettingRefused` has the fixed message naming the model and the setting.
- [ ] T039 [P] [US4] Extend `test/ai-options.test.ts`: `loadSettings` parses a settings file keyed by canonical spec (a bare Claude key is read as `anthropic/<id>`), rejects an unknown setting name and a bad value with a fixed message.
- [ ] T040 [P] [US4] Extend `test/harness.test.ts` and `test/scripts.test.ts`: `--settings` with a refused setting makes `--dry-run` exit 1 before anything is created; the plan shows each run's settings; a scripted run's `score.json` records `settings` with `null` for each setting not given. In `test/ai-driver.test.ts`: a setting the table does not know a model refuses is sent, and a scripted provider rejection ends the run as `request_rejected` with the settings recorded.
- [ ] T041 [P] [US4] Extend `test/report.test.ts`: the experiment summary schema accepts `models.settings`, and a summary without it is read as `{}`.

### Implementation

- [ ] T042 [US4] `src/harness/errors.ts`: add `SettingRefused`. `src/harness/models.ts`: add `ModelSettings`, `loadSettings(file)` and the canonical-key rule.
- [ ] T043 [US4] `src/harness/providers.ts`: fill each row's `settings` rules and `callOptions(settings)`, mapping the three settings to the provider's call options (make T038 pass). The rules come from the provider's documented limits and are checked by the admission probe.
- [ ] T044 [US4] `src/harness/cli.ts` and `src/harness/run.ts`: add `--settings <file>`; `planExperiment` refuses a refused setting before anything is created and prints each run's settings; the score records the settings used (`null` for unset). `src/harness/ai-driver.ts` passes the mapped call options. `scripts/run-agent.ts` usage text.
- [ ] T045 [US4] `src/harness/report.ts`: extend the experiment summary schema with `models.settings`; update `specs/003-faithful-minecraft-world/contracts/experiment-summary.md` with the new optional field.
- [ ] T046 [US4] Update the allowed `score.json` keys in `test/privacy.test.ts` for `settings`, and make T038 to T041 pass.
- [ ] T047 [US4] Write `specs/007-ai-sdk-runtime/calibration-settings.json` (Sonnet: thinking adaptive, effort high, temperature refused so unset; Haiku: thinking off, temperature 0, effort refused so unset) and the reasons in `research.md` R6.
- [ ] T048 [US4] **(spends, cap US$5; needs the user's go-ahead and T037 done)** Rerun the faithful world's calibration, 30 runs, as in `quickstart.md` section C: write `runs/rt-cal/summary.json` with `models.settings` copied from `specs/007-ai-sdk-runtime/calibration-settings.json` (T047), pass that file with `--settings` on every run, run the commands of spec 003 Part B step 1 with label prefix `rt-cal-` and the ADR-003 §2.1 teacher and student, then `pnpm dev scripts/report.ts --experiment runs/rt-cal runs/rt-cal-*`.
- [ ] T049 [US4] Write `design/notes/runtime-recalibration.md`: the runtime (`ai-sdk, ADR-005`), the base prompt wording used, the pinned settings, each goal's role under the unchanged ADR-003 §2.1 rule, cost with its unpriced count. State plainly if a goal's role differs from the earlier Claude Code calibration.

**Checkpoint**: settings are pinned and recorded, and the calibration on this runtime is on file.

---

## Phase 7: User Story 6 - Know the new runtime works end to end (Priority: P2)

**Goal**: the paths the spike did not run are run once on this runtime, each leaving a record.

**Independent Test**: each check is a short gated test with a spend limit and a written record.

### Scripted tests first (FR-012, FR-013)

- [ ] T050 [P] [US6] `test/ai-driver.test.ts`: a role whose model finishes with `length` returns `ok: false`, a fixed reason and no answer. Fix `aiRoleDriver` in `src/harness/ai-driver.ts` so a `length` finish is never an answer.
- [ ] T051 [P] [US6] `test/ai-driver.test.ts`: when the run's signal aborts during a model call, and when the model call throws, the MCP client is closed (a scripted transport records `close`) and no craft server process remains. Fix the driver's cleanup if either fails.

### Gated checks (write each test first, then run it)

- [ ] T052 [P] [US6] **(spends, cap US$3)** `test/live-critic-loop.test.ts`: `critic-loop.ts --runs <finished glirol run> --candidate spikes/skill-pilot/craft-glirol --max-rounds 1` with Claude critic and reviser. Make its own finished run first with `fireworks/glm-5p3` (5 of 5 on glirol in the spike; Sonnet reached 0 of 5), about US$0.05, so this check does not depend on another task's output. Assert a recorded `accept` or `reject`, one round, and no write outside `loops/` (no NAMS call). Write the record with `writeCheckRecord`.
- [ ] T053 [P] [US6] **(spends, cap US$1)** `test/live-thinking-role.test.ts`: a Claude Opus role with `--max-role-usd` low enough that its reasoning can reach the output ceiling. Assert either a complete schema-valid answer or `DriverFailed: the role reached its spend cap`, never a partial answer (FR-012). The scripted test T050 covers the truncation case; this confirms it on a real thinking model.
- [ ] T054 [P] [US6] **(spends, cap US$2)** `test/live-skill.test.ts`: three runs of `run-agent.ts --skill spikes/skill-pilot/craft-glirol` on Claude Haiku. Assert each score records `skill.invoked` and `skill.loadedAfterCalls`.
- [ ] T055 [P] [US6] `test/live-cancel.test.ts` **(spends, cap US$1)**: start `run-agent.ts` and send SIGINT after a few turns, five times; run with a very short `--timeout-minutes`, five times. Assert exit 130 (or the timeout reason), a written `summary.json`, and no process whose command line contains `src/mcp/server.ts` afterwards. The scripted test T051 covers cleanup; this confirms it end to end.
- [ ] T056 [US6] Write the records of T052 to T055 under `design/notes/` (what ran, command, cost, outcome), and note any defect found and its fix.

**Checkpoint**: each of the four paths has run once on the new runtime, or its defect is fixed and recorded.

---

## Phase 8: User Story 5 - See that a request was retried (Priority: P3)

**Goal**: the retry setting is stated and recorded, and failed attempts are counted in the score and not in the trace.

**Independent Test**: a scripted provider that fails twice then succeeds gives a score with two failed attempts, and a trace with one request.

### Tests first

- [ ] T057 [P] [US5] Extend `test/ai-driver.test.ts`: a scripted model that throws a retryable `APICallError` twice then succeeds gives `retries: { max: 2, failedAttempts: 2 }` and one request line in the trace; one that fails every attempt gives an `error` ending with a fixed reason and `failedAttempts: 3`; a model that never fails gives `failedAttempts: 0`.
- [ ] T058 [P] [US5] Extend `test/privacy.test.ts`: the allowed `score.json` keys include `retries`.

### Implementation

- [ ] T059 [US5] `src/harness/ai-options.ts` and `src/harness/ai-driver.ts`: export `MAX_RETRIES = 2` and pass it explicitly; wrap the model with the SDK's model middleware so each attempt is counted and each thrown attempt is a failed attempt (research R5).
- [ ] T060 [US5] `src/harness/driver.ts` and `src/harness/run.ts`: add `retries` to `PlayerResult` and the score; update `test/privacy.test.ts` (make T057 and T058 pass).

**Checkpoint**: a failing provider no longer looks healthy.

---

## Phase 9: User Story 7 - Read documents that describe the runtime that exists (Priority: P3)

**Goal**: no document describes the previous runtime or `--record` as current.

**Independent Test**: a search finds only mentions marked as history.

- [ ] T061 [P] [US7] Search `README.md` and `AGENTS.md` for `Agent SDK`, `claude-agent-sdk`, `--record`, `sdk-driver` and `sdk-options`; update AGENTS.md for the provider table (a model is `<provider>/<model>`, rows live in `src/harness/providers.ts`, canonical names) and the new `score.json` fields.
- [ ] T062 [P] [US7] Add a one-line history marker pointing at ADR-005 to `specs/002-client-otel-trace/` (`spec.md`, `plan.md`, `research.md`, `tasks.md`) and `specs/005-critic-loop-harness/` (`plan.md`, `research.md`, `tasks.md`, `contracts/role-io.md`) wherever the previous runtime or `--record` is described as current. Do not rewrite requirements.
- [ ] T063 [P] [US7] The same for `design/notes/agent-player-options.md` and `design/notes/pixel-observer.md` where they name the previous runtime.
- [ ] T064 [US7] Check SC-011: search the documents again and list every remaining mention, each marked as history or pointing to ADR-005.

---

## Phase 10: Polish and cross-cutting

- [ ] T065 Run `pnpm typecheck` and `pnpm test`; both pass, and the default suite spends nothing and calls no network.
- [ ] T066 Run `quickstart.md` section A (free) and confirm the stated outputs.
- [ ] T067 [P] Run `quickstart.md` section D for one Fireworks batch (the billing check): harness and billed tokens equal for every model (SC-010). **(spends, cap US$1)**
- [ ] T068 [P] Add Fireworks entries to `prices.json` for the models used in the calibration or checks, from measured usage and the published rate, and say so in the file's note.
- [ ] T069 Confirm FR-017 and FR-018: `git diff main -- src/sim src/mcp` is empty, no key appears in any file the feature wrote (`grep` the new notes, run folders and `design/notes/` for the key prefixes without printing them), and `.env` is untouched.
- [ ] T070 Update ADR-005's Consequences: remove the items this feature closed (reported model, unpriced totals, caching, retries, live checks, glossary) and keep what remains open. Keep `status: accepted`; add an Amendments line only if a decision changed.

---

## Dependencies and order

- **Phase 1** first. **Phase 2** blocks everything: the table and canonical names.
- **US1 (Phase 3)** and **US2 (Phase 4)** are the P1 pair and both need only Phase 2; US1 is the MVP. They touch `ai-driver.ts` and `test/ai-driver.test.ts` in different parts, so do them one after the other if one agent works.
- **US3 (Phase 5)** needs Phase 2. It comes before US4's calibration run (T048) and before the live checks so those spend less. T037 is the gate.
- **US4 (Phase 6)** needs Phase 2; T048 and T049 need T037.
- **US6 (Phase 7)** needs Phase 2 and T037 (caching on). T053 and T055 may add small fixes in `src/harness/ai-driver.ts`.
- **US5 (Phase 8)** needs Phase 2 and should follow US1 and US3, since it edits the same driver and the same score.
- **US7 (Phase 9)** goes last among stories, after the code stops changing, and **Phase 10** after that.

Within a story: tests, then implementation, then the story's checkpoint. Tasks marked [P] in a story touch different files.

### Parallel examples

```text
After Phase 2:        T013 T014 T015 T016 T017 T019   (US1 tests, six files)
                      T026 T027 T028                  (US2 tests)
After US3:            T052 T053 T054 T055             (US6 gated checks, one file each; run one at a time to keep spend visible)
Docs, near the end:   T061 T062 T063
```

## Implementation strategy

1. **MVP**: Phase 1, Phase 2, US1, US2. Models are canonical, runs record the model that ran and an honest cost, and a provider is a table row. Stop and check the scripted suite.
2. **Cost next**: US3, so every later spend is cheaper (T037 confirms it).
3. **Behaviour**: US4 (pinned settings, then the calibration rerun), then US6 (live checks) and US5 (retries).
4. **Last**: US7 (documents), then Phase 10.

Do the git steps one at a time and only when asked (commit, push, pull request).
