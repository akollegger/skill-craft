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

- [X] T001 Confirm the baseline on branch `007-ai-sdk-runtime`: `pnpm typecheck` and `pnpm test` pass, and `git status` shows only `dist-viz/` untracked.
- [X] T002 [P] Add `test/helpers/live.ts`: a `live` flag (`process.env["LIVE_SDK"] === "1"`), a `skipUnlessKey(name)` guard that skips a check whose provider key variable is unset, and `writeCheckRecord(file, text)` that writes a check's record under `design/notes/`. It must never read or print a key's value.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: the provider table and canonical model names (FR-001, FR-002). Every story reads a model's canonical spec, and the reported-model and cost work needs a table row to normalise through.

**Critical**: no story starts until this phase is done.

### Tests first

- [X] T003 [P] Write `test/providers.test.ts`: the table has rows for `anthropic` and `fireworks`; `parseModelSpec` returns the canonical spec (`anthropic/claude-sonnet-5-5` for both `claude-sonnet-5-5` and `anthropic/claude-sonnet-5-5`; `fireworks/gpt-oss-120b` with id `accounts/fireworks/models/gpt-oss-120b`; a full `accounts/…` path kept); a spec round-trips; an unknown prefix throws `UnknownProvider` with the fixed message listing the prefixes; a bare non-Claude name throws; a row with `routed: true` and no `pinnedBackend` throws `BackendNotPinned`; `normaliseReported` maps `accounts/fireworks/models/x` to `fireworks/x` and a Claude id to `anthropic/<id>`.
- [X] T004 [P] Extend `test/ai-options.test.ts`: `loadPrices` returns canonical keys and reads a bare Claude key as `anthropic/<id>`; a price lookup by a bare id finds the canonical entry; `costOf` is unchanged; `canonicalSpec(s)` returns `anthropic/<id>` for a bare `claude-…` id and leaves a canonical spec unchanged.

### Implementation

- [X] T005 Add `UnknownProvider` and `BackendNotPinned` to `src/harness/errors.ts` (fixed messages from contracts/provider-table.md); keep `UnknownModel`.
- [X] T006 Create `src/harness/providers.ts` with the table and its row type (data-model.md): `prefix`, `package`, `factory`, `keyEnv`, `expand`, `normaliseReported`, `routed` and `pinnedBackend`, `usageReport`, `settings`, `callOptions`, optional `reportedCost`. It imports no provider package and no SDK. Rows for Anthropic and Fireworks; validate rows when the table loads.
- [X] T007 Change `src/harness/models.ts`: `parseModelSpec` reads the table and returns canonical `{ provider, id, spec }`; `DEFAULT_MODEL` becomes `anthropic/claude-sonnet-5-5`; `loadPrices` canonicalises keys and `priceFor(spec)` accepts either form. Make T003 and T004 pass.
- [X] T008 `src/harness/models.ts`: add `canonicalSpec(s)`, which reads a bare Claude id as `anthropic/<id>` and leaves a canonical spec unchanged; it never rewrites a file. Make the T004 cases pass.
- [X] T009 Apply `canonicalSpec` wherever a recorded model is read: `src/loop/cli.ts` (the teacher models behind the critic and reviser fallback, around line 110) and `src/harness/report.ts`; grep for other readers of `model.resolved` (`src/harness/bundle.ts`, `src/harness/export.ts`) and cover each. Tests first: `test/loop-cli.test.ts` (an old `score.json` with a bare Claude id gives the fallback model `anthropic/<id>`) and `test/report.test.ts` (old and new runs of one Claude model group in one row).
- [X] T010 Rewrite `prices.json` with canonical keys (`anthropic/claude-opus-5-5`, `anthropic/claude-sonnet-5-5`, `anthropic/claude-haiku-4-5`, `anthropic/claude-haiku-4-5-20251001`); keep the note key.
- [X] T011 Change `src/harness/ai-driver.ts`: `languageModel(ref)` finds the row, runs `await import(row.package)`, calls the named factory and the model id; a missing key variable ends the run with `DriverFailed: the player reported api_key_missing`, naming the variable. Remove the Anthropic and Fireworks static imports. Extend `test/ai-driver.test.ts` first with a scripted row that proves the driver builds a model through the table alone.
- [X] T012 Update the tests that assume bare Claude names: `test/harness.test.ts` and `test/scripts.test.ts` (the dry-run plan's default model is `anthropic/claude-sonnet-5-5`). The readers of old records are covered by T009.

**Checkpoint**: `pnpm typecheck` and `pnpm test` pass; a model is `<provider>/<model>` everywhere it is recorded.

---

## Phase 3: User Story 1 - Know which model ran and what the run cost (Priority: P1) MVP

**Goal**: each run records the model asked for and the model the provider reports, a computed cost with provider-reported cost beside it, and every total states its unpriced runs.

**Independent Test**: a scripted player whose provider reports a different model, and a mix of priced and unpriced runs. The score, summary and report show the substitution and the unpriced count.

### Tests first

- [X] T013 [P] [US1] Extend `test/recorder.test.ts`: a request's model is the last one named by its `message_start` or `message_delta` event; a usage event that names none leaves the start event's model.
- [X] T014 [P] [US1] Extend `test/measure.test.ts`: request lines that carry the reported model agree with the result's `modelsUsed`; a trace whose models differ from the result's is still `trace: "mismatch"`.
- [X] T015 [P] [US1] Extend `test/ai-driver.test.ts`: a scripted model whose step reports `response.modelId` differing from the request yields `modelsUsed` and `initModel` as the normalised reported ids; a step that reports none falls back to the requested spec; the trace's request lines carry the reported id.
- [X] T016 [P] [US1] Extend `test/harness.test.ts`: `aggregate` returns `pricedRuns` and `unpricedRuns`, and `totalCostUsd` sums priced runs only; a label whose runs differ in the model that ran has `mixedModels`; `score.json` holds `reportedCostUsd` only when the driver reports one (use a scripted driver).
- [X] T017 [P] [US1] Extend `test/report.test.ts`: every printed cost carries `(N unpriced)`, and a label of only unpriced runs prints `-` for cost.
- [X] T018 [P] [US1] Extend `test/report.test.ts`: a summary that declares `claude-haiku-4-5-20251001` and runs that resolved `anthropic/claude-haiku-4-5-20251001` report as one row; a run that resolved a different model still raises `ReportRefused`.
- [X] T019 [P] [US1] Extend `test/privacy.test.ts`: the allowed `score.json` keys include `reportedCostUsd`, and `summary.json`'s aggregate keys include `pricedRuns` and `unpricedRuns`.

### Implementation

- [X] T020 [US1] `src/trace/recorder.ts`: take a request's model from the last event that names one. Change `requestUsage` in `src/harness/ai-options.ts` to carry the model.
- [X] T021 [US1] `src/harness/ai-driver.ts`: collect each step's `response.modelId`, normalise it through the row (`normaliseReported`), return the sorted set as `modelsUsed` and the first as `initModel`; name the reported id on the usage event; read the row's optional `reportedCost` from the provider metadata and sum it into the result's `reportedCostUsd`.
- [X] T022 [US1] `src/harness/driver.ts` and `src/harness/run.ts`: add optional `reportedCostUsd` to `PlayerResult` and the score; extend `aggregate` with `pricedRuns` and `unpricedRuns` and fix `totalCostUsd`.
- [X] T023 [US1] `src/harness/report.ts`: print the unpriced count beside every cost and `-` for a label with no priced run; extend the zod score schema with the optional field.
- [X] T024 [US1] `src/harness/report.ts` (around lines 155 and 186): compare the summary's declared model and each run's resolved models through `canonicalSpec`, and group rows by the canonical string (make T018 pass). A provider that reports a different id from the one declared stays refused: it is a substitution.
- [X] T025 [US1] Update the key lists in `test/privacy.test.ts` for the new fields (T019) and make T013 to T019 pass.

**Checkpoint**: US1 stands alone: the substitution and unpriced scenarios pass in the scripted tests.

---

## Phase 4: User Story 2 - Add a provider without touching the run loop (Priority: P1)

**Goal**: a provider is one table row, its package and price entries; refusals and the admission probe are in place.

**Independent Test**: add a scripted provider through the table alone; a player and a role run on it and no other source file changes.

### Tests first

- [X] T026 [P] [US2] Extend `test/providers.test.ts`: a scripted row added to the table is usable by `parseModelSpec` and `aiDriver` with no other change (SC-003); a routed row with a pinned backend is accepted and records `model.backend` from the response; the same row without one is refused; two scripted runs of a routed model that report different backends make the experiment `mixedModels`.
- [X] T027 [P] [US2] Extend `test/scripts.test.ts`: `run-agent.ts --model mistral/large --dry-run` exits 1 with `provider 'mistral' is not available; the providers are anthropic, fireworks`, creates nothing, and shows no key.
- [X] T028 [P] [US2] Extend `test/ai-driver.test.ts`: with the key variable unset, a run ends with `DriverFailed: the player reported api_key_missing`, the reason names the variable, and no value appears anywhere in the result.

### Implementation

- [X] T029 [US2] `src/harness/run.ts` `planExperiment`: refuse an unknown provider or an unpinned router before anything is created, using the table (make T026 and T027 pass).
- [X] T030 [US2] `src/harness/providers.ts`, `src/harness/ai-driver.ts`, `src/harness/run.ts`: add the optional row hook `backend(meta)`; the driver records the backend a routed response reports in `model.backend`; `aggregate` counts runs whose backends differ as `mixedModels` (make the routed-provider cases in T026 pass).
- [X] T031 [US2] Generalise `spikes/fireworks/probe-tools.ts` and `probe-schema.ts` to take `<provider>/<model>`, read the row for the key and base address, and print structure only (contracts/cli.md); keep their output free of agent text and reasoning.
- [X] T032 [US2] Write the admission procedure into `spikes/fireworks/README.md` (the probe's findings to record, the usage-report rule, how a routed row is pinned), pointing at contracts/provider-table.md; add `ANTHROPIC_API_KEY` and `FIREWORKS_API_KEY` guidance and a comment on adding a key variable to `.env.example`.
- [X] T033 [US2] **(spends, cap US$0.50)** Run the generalised probes for `anthropic/claude-haiku-4-5-20251001` and `fireworks/gpt-oss-120b`, and write `design/notes/provider-admission.md` with each provider's findings: tool calls, schema answers, settings refused, reasoning handling, usage fields reported, and whether it has a usage report. Take the Fireworks findings from `spikes/fireworks/log.md` and confirm them with the new probe. Set each row's `settings` and `usageReport` from the findings.
  - Done 2026-10-11 (about US$0.03): findings in `design/notes/provider-admission.md`; the table's rules matched the provider in all eight Anthropic cases, and the probes found that the SDK silently drops a setting a model does not support, which led to the `setting_ignored` guard.

**Checkpoint**: US1 and US2 together are the MVP: model and cost records plus a table a provider can be added to.

---

## Phase 5: User Story 3 - Run Claude without paying full price for every request (Priority: P2)

**Goal**: a 40-turn Claude run reads at least 80% of its input from the cache.

**Independent Test**: a scripted Claude call shows the cache option on every request; one measured Claude run meets the target.

### Tests first

- [X] T034 [P] [US3] Extend `test/ai-driver.test.ts`: every model call to the Anthropic row carries the cache option (`providerOptions.anthropic.cacheControl` of type `ephemeral`), and a call to a Fireworks row carries none; a provider that reports no cache figure records it as zero in the trace and in the run's token counts.
- [X] T035 [P] [US3] Extend `test/providers.test.ts`: the Anthropic row's `callOptions` returns the cache option, the Fireworks row's returns none.

### Implementation

- [X] T036 [US3] `src/harness/providers.ts` and `src/harness/ai-driver.ts`: the Anthropic row's `callOptions` returns the cache option and the driver passes it on every call (make T034 and T035 pass).
- [X] T037 [US3] **(spends, cap US$1)** Run `quickstart.md` B1 (one 40-turn Claude run). Read `score.json`: at least 80% of input tokens are cache reads (SC-004). If not, add the fallback in research R4 (a cache breakpoint on the last message in `prepareStep`), with a scripted test first, and run B1 again.
  - Done 2026-10-11 (US$0.125): `runs/rt-cache/001`, 211,630 cache-read tokens against 68 uncached and 13,114 written, so 94% of input was read from cache (SC-004: at least 80%). The spike's runs cost about US$0.65 each.

**Checkpoint**: Claude cost is no longer dominated by uncached input; later spends are cheaper.

---

## Phase 6: User Story 4 - Pin the settings that change a model's behaviour (Priority: P2)

**Goal**: thinking, effort and temperature are pinned per model, refused up front where the table knows, recorded in the run and the experiment summary; the faithful world's calibration is rerun on the new runtime.

**Independent Test**: start an experiment with settings for two models; each score shows the settings it used, and a refused setting is rejected before anything is spent.

### Tests first

- [X] T038 [P] [US4] Extend `test/providers.test.ts`: the Anthropic row refuses `temperature` and `thinking: "off"` for the models whose rules say so and accepts `effort` and `thinking: "adaptive"`; the Fireworks row accepts `temperature`; `SettingRefused` has the fixed message naming the model and the setting.
- [X] T039 [P] [US4] Extend `test/ai-options.test.ts`: `loadSettings` parses a settings file keyed by canonical spec (a bare Claude key is read as `anthropic/<id>`), rejects an unknown setting name and a bad value with a fixed message.
- [X] T040 [P] [US4] Extend `test/harness.test.ts` and `test/scripts.test.ts`: `--settings` with a refused setting makes `--dry-run` exit 1 before anything is created; the plan shows each run's settings; a scripted run's `score.json` records `settings` with `null` for each setting not given. In `test/ai-driver.test.ts`: a setting the table does not know a model refuses is sent, and a scripted provider rejection ends the run as `request_rejected` with the settings recorded.
- [X] T041 [P] [US4] Extend `test/report.test.ts`: the experiment summary schema accepts `models.settings`, and a summary without it is read as `{}`.

### Implementation

- [X] T042 [US4] `src/harness/errors.ts`: add `SettingRefused`. `src/harness/models.ts`: add `ModelSettings`, `loadSettings(file)` and the canonical-key rule.
- [X] T043 [US4] `src/harness/providers.ts`: fill each row's `settings` rules and `callOptions(settings)`, mapping the three settings to the provider's call options (make T038 pass). The rules come from the provider's documented limits and are checked by the admission probe.
- [X] T044 [US4] `src/harness/cli.ts` and `src/harness/run.ts`: add `--settings <file>`; `planExperiment` refuses a refused setting before anything is created and prints each run's settings; the score records the settings used (`null` for unset). `src/harness/ai-driver.ts` passes the mapped call options. `scripts/run-agent.ts` usage text.
- [X] T045 [US4] `src/harness/report.ts`: extend the experiment summary schema with `models.settings`; update `specs/003-faithful-minecraft-world/contracts/experiment-summary.md` with the new optional field.
- [X] T046 [US4] Update the allowed `score.json` keys in `test/privacy.test.ts` for `settings`, and make T038 to T041 pass.
- [X] T047 [US4] Write `specs/007-ai-sdk-runtime/calibration-settings.json` (Sonnet: thinking adaptive, effort high, temperature refused so unset; Haiku: thinking off, temperature 0, effort refused so unset) and the reasons in `research.md` R6.
- [X] T048 [US4] **Regression check (tier 2), not a calibration for its own sake. (spends, cap US$5; HELD until the role parse-rate eval, T052, is done; needs the user's go-ahead and T037 done)** Rerun the faithful world's calibration on this runtime, 30 runs, and compare it cell by cell with the Claude Code era runs already on disk: `runs/faithful-1-cal-faithful-{haiku,sonnet}-{iron,stone,wooden}` (Haiku 5/5, 0/5, 4/5 on iron, stone, wooden; Sonnet 5/5, 5/5, 5/5), `runs/calib-{haiku,sonnet}` (forge-7, 0/5 each) and `runs/live-s1`, `runs/live-s2` (Haiku with a skill on stone, 3/3 each). Steps: write `runs/rt-cal/summary.json` with `models.settings` copied from `specs/007-ai-sdk-runtime/calibration-settings.json` (T047), pass that file with `--settings` on every run, run the commands of spec 003 Part B step 1 for the faithful world with label prefix `rt-cal-` and the ADR-003 §2.1 teacher and student, then `pnpm dev scripts/report.ts --experiment runs/rt-cal runs/rt-cal-*`. A cell that was gross-broken by the migration (for example Sonnet 5/5 before and 0/5 now) is a regression to diagnose before anything else goes on.
  - Done 2026-10-11 (US$2.72, 30 runs): Sonnet 5/5 on all three goals, as before; Haiku 4/5 wooden (same), 4/5 stone (was 0/5) and 3/5 iron (was 5/5). No gross breakage; two Haiku cells differ and the cause is not known. Details and limits in `design/notes/runtime-recalibration.md`.
- [X] T049 [US4] Write `design/notes/runtime-recalibration.md`: the runtime (`ai-sdk, ADR-005`), the base prompt wording used, the pinned settings, the table of each cell now beside the Claude Code era result, each goal's role under the unchanged ADR-003 §2.1 rule, cost with its unpriced count. It MUST say plainly that at 5 trials per cell this detects gross breakage only (a 0/5 result has a 95% upper bound near 43%, and 5/5 a lower bound near 57%) and does not show the two runtimes are equivalent, and it MUST state any cell whose result differs from the earlier runtime and what is known about why. A cell that differs by chance and one that differs by cause cannot be told apart at this sample size. The note already exists with the baseline table and this limit written down; the results are added when T048 has run.
  - Done 2026-10-11: `design/notes/runtime-recalibration.md` holds the table, the plain statement of the 5-trial limit, the two differing cells, and the consequence that the faithful world has no gap goal for Haiku on this runtime under the unchanged ADR-003 rule.

**Checkpoint**: settings are pinned and recorded, and the calibration on this runtime is on file.

---

## Phase 7: User Story 6 - Know the new runtime works end to end (Priority: P2)

**Goal**: the paths the spike did not run are run once on this runtime, each leaving a record.

**Independent Test**: each check is a short gated test with a spend limit and a written record.

### Scripted tests first (FR-012, FR-013)

- [X] T050 [P] [US6] `test/ai-driver.test.ts`: a role whose model finishes with `length` returns `ok: false`, a fixed reason and no answer. Fix `aiRoleDriver` in `src/harness/ai-driver.ts` so a `length` finish is never an answer.
- [X] T051 [P] [US6] `test/ai-driver.test.ts`: when the run's signal aborts during a model call, and when the model call throws, the MCP client is closed (a scripted transport records `close`) and no craft server process remains. Fix the driver's cleanup if either fails.

### Role parse-rate eval (tier 1), before the other live checks

- [X] T052 [US6] **(spends, about US$6 in all; asked for 2026-10-11 after T053 failed)** Role parse-rate eval with `spikes/role-eval/parse-rate.ts`: one fixed recording (the 33-call teacher run kept under `$TMPDIR/skill-craft-live-loop-*/runs/rt-teacher/005`) and the real critic and reviser prompts, 20 calls per role per model for `anthropic/claude-haiku-4-5-20251001` and `fireworks/gpt-oss-120b` on the AI SDK driver, and the same 20 calls per role for Haiku on the earlier Claude Agent SDK driver (run from a checkout of commit 39c4fcf with `--driver sdk`). Report each schema-valid rate with its 95% Wilson interval, the first-attempt rate and the rate after the driver's bounded retry. If the AI SDK driver's rate for Claude is lower than the earlier driver's, fix it with a structured-output mode or a bounded retry, test first, and record the fix. The diagnosis (`spikes/role-eval/diagnose-verdict.ts`), the results and any fix go in `design/notes/role-parse-rate.md`.
  - Done 2026-10-11. Haiku final-answer rates on the AI SDK with the fix: critic 20/20 = 100% [84, 100], reviser 20/20 = 100% [84, 100], against the earlier runtime's 100% [84, 100] and 65% [43, 82]; as first shipped the reviser was 3/20 = 15% [5, 36], clearly below. Cause and fix in `design/notes/role-parse-rate.md`.

### Gated checks (write each test first, then run it)

- [X] T053 [P] [US6] **(spends, cap US$3)** `test/live-critic-loop.test.ts`: `critic-loop.ts --runs <finished glirol run> --candidate spikes/skill-pilot/craft-glirol --max-rounds 1` with Claude critic and reviser. Make its own finished run first with `fireworks/glm-5p3` (5 of 5 on glirol in the spike; Sonnet reached 0 of 5), about US$0.05, so this check does not depend on another task's output. Assert a recorded `accept` or `reject`, one round, and no write outside `loops/` (no NAMS call). Write the record with `writeCheckRecord`. *(test written and skipped by default; not yet run live)*
  - Done 2026-10-11 (US$0.04 for the loop, plus a few cents for the Fireworks teacher runs): teacher `gpt-oss-120b`, critic and reviser Haiku with thinking 31999 through `--settings`; the loop ended in `reject` after 1 round with no failure and no NAMS call. The first run of this check failed with `VerdictInvalid` (see T052). Record: `design/notes/live-check-critic-loop.md`.
- [X] T054 [P] [US6] **HELD until the role parse-rate eval (T052) is done.** **(spends, cap US$1)** `test/live-thinking-role.test.ts`: a Claude Opus role with `--max-role-usd` low enough that its reasoning can reach the output ceiling. Assert either a complete schema-valid answer or `DriverFailed: the role reached its spend cap`, never a partial answer (FR-012). The scripted test T050 covers the truncation case; this confirms it on a real thinking model. *(test written and skipped by default; not yet run live)*
  - Done 2026-10-11 (US$0.01): Opus 5.5 under caps of $0.02 (a complete answer, 350 output tokens) and $0.003 (a ceiling of 150 tokens: the fixed failure `reached its output limit`, no partial answer). Record: `design/notes/live-check-thinking-role.md`.
- [X] T055 [P] [US6] **HELD until the role parse-rate eval (T052) is done.** **(spends, cap US$2)** `test/live-skill.test.ts`: three runs of `run-agent.ts --skill spikes/skill-pilot/craft-glirol` on Claude Haiku. Assert each score records `skill.invoked` and `skill.loadedAfterCalls`. *(test written and skipped by default; not yet run live)*
  - Done 2026-10-11 (US$0.17): three Haiku runs with the skill installed and thinking pinned loaded it in 1 of 3 runs (after 3 craft calls) and reached the goal in 3 of 3. Record: `design/notes/live-check-skill.md`.
- [X] T056 [P] [US6] **HELD until the role parse-rate eval (T052) is done.** `test/live-cancel.test.ts` **(spends, cap US$1)**: start `run-agent.ts` and send SIGINT after a few turns, five times; run with a very short `--timeout-minutes`, five times. Assert exit 130 (or the timeout reason), a written `summary.json`, and no process whose command line contains `src/mcp/server.ts` afterwards. The scripted test T051 covers cleanup; this confirms it end to end. *(test written and skipped by default; not yet run live)*
  - Done 2026-10-11 (a few cents): ten runs on `fireworks/nemotron-lightning-3p5-30b-a3b`, five interrupted by SIGINT (each exit 130, `cancelled: true`, `RunCancelled`) and five stopped by `--timeout-minutes 0.05` (each with a `RunTimedOut` reason and a summary); no craft server was left running by any of them. Record: `design/notes/live-check-cancel.md`.
- [X] T057 [US6] Write the records of T053 to T056 under `design/notes/` (what ran, command, cost, outcome), and note any defect found and its fix.
  - Done 2026-10-11: the four records are in `design/notes/live-check-*.md`, and the defects they found (T052 and the request-shape capture) are recorded in `design/notes/role-parse-rate.md`, FR-019 to FR-021 and T071 to T073.

**Checkpoint**: each of the four paths has run once on the new runtime, or its defect is fixed and recorded.

---

## Phase 8: User Story 5 - See that a request was retried (Priority: P3)

**Goal**: the retry setting is stated and recorded, and failed attempts are counted in the score and not in the trace.

**Independent Test**: a scripted provider that fails twice then succeeds gives a score with two failed attempts, and a trace with one request.

### Tests first

- [X] T058 [P] [US5] Extend `test/ai-driver.test.ts`: a scripted model that throws a retryable `APICallError` twice then succeeds gives `retries: { max: 2, failedAttempts: 2 }` and one request line in the trace; one that fails every attempt gives an `error` ending with a fixed reason and `failedAttempts: 3`; a model that never fails gives `failedAttempts: 0`.
- [X] T059 [P] [US5] Extend `test/privacy.test.ts`: the allowed `score.json` keys include `retries`.

### Implementation

- [X] T060 [US5] `src/harness/ai-options.ts` and `src/harness/ai-driver.ts`: export `MAX_RETRIES = 2` and pass it explicitly; wrap the model with the SDK's model middleware so each attempt is counted and each thrown attempt is a failed attempt (research R5).
- [X] T061 [US5] `src/harness/driver.ts` and `src/harness/run.ts`: add `retries` to `PlayerResult` and the score; update `test/privacy.test.ts` (make T058 and T059 pass).

**Checkpoint**: a failing provider no longer looks healthy.

---

## Phase 9: User Story 7 - Read documents that describe the runtime that exists (Priority: P3)

**Goal**: no document describes the previous runtime or `--record` as current.

**Independent Test**: a search finds only mentions marked as history.

- [X] T062 [P] [US7] Search `README.md` and `AGENTS.md` for `Agent SDK`, `claude-agent-sdk`, `--record`, `sdk-driver` and `sdk-options`; update AGENTS.md for the provider table (a model is `<provider>/<model>`, rows live in `src/harness/providers.ts`, canonical names) and the new `score.json` fields.
- [X] T063 [P] [US7] Add a one-line history marker pointing at ADR-005 to `specs/002-client-otel-trace/` (`spec.md`, `plan.md`, `research.md`, `tasks.md`) and `specs/005-critic-loop-harness/` (`plan.md`, `research.md`, `tasks.md`, `contracts/role-io.md`) wherever the previous runtime or `--record` is described as current. Do not rewrite requirements.
- [X] T064 [P] [US7] The same for `design/notes/agent-player-options.md` and `design/notes/pixel-observer.md` where they name the previous runtime.
- [X] T065 [US7] Check SC-011: search the documents again and list every remaining mention, each marked as history or pointing to ADR-005.
  - Checked 2026-10-10: `README.md` and `AGENTS.md` have no mention. Marked with a history note: `design/notes/` (agent-player-options, pixel-observer, skill-pilot) and `specs/002-*` (spec, plan, research, tasks, quickstart, contracts/player-driver), `specs/003-*` (plan, quickstart, tasks), `specs/005-*` (plan, research, tasks, contracts/role-io). Pointing to ADR-005: ADR-002 and ADR-003 (their amendments), ADR-005 and spec 007 (which describe the replacement).

---

## Phase 10: Polish and cross-cutting

- [X] T066 Run `pnpm typecheck` and `pnpm test`; both pass, and the default suite spends nothing and calls no network.
- [X] T067 Run `quickstart.md` section A (free) and confirm the stated outputs.
- [X] T068 [P] **HELD until the role parse-rate eval (T052) is done.** Run `quickstart.md` section D for one Fireworks batch (the billing check): harness and billed tokens equal for every model (SC-010). **(spends, cap US$1)**
  - Done 2026-10-11 (a few cents): a fresh batch of 3 `gpt-oss-120b` runs, harness against billed tokens: prompt 398,073 / 398,073, cached 343,836 / 343,836, completion 5,704 / 5,704, an exact match (SC-010).
- [ ] T069 [P] Add Fireworks entries to `prices.json` for the models used in the calibration or checks, from measured usage and the published rate, and say so in the file's note.
  - **Not done, and why:** `firectl billing get-usage` reports tokens per model but no per-model cost, and its cost export is blocked for an agent (T068), so there is no measured rate to enter. Fireworks models stay unpriced (reported as such everywhere). Add entries to `prices.json` when a rate is supplied, for example from the Fireworks dashboard.
- [X] T070 Confirm FR-017 and FR-018: `git diff main -- src/sim src/mcp` is empty, no key appears in any file the feature wrote (`grep` the new notes, run folders and `design/notes/` for the key prefixes without printing them), and `.env` is untouched.
- [X] T071 Update ADR-005's Consequences: remove the items this feature closed (reported model, unpriced totals, caching, retries, live checks, glossary) and keep what remains open. Keep `status: accepted`; add an Amendments line only if a decision changed.
  - Done 2026-10-11: closed items removed (caching, retries, live checks, reported model, unpriced totals); open items kept as the follow-up list.

---

## Found during implementation

Work the live checks and probes showed was needed, done test-first and recorded here so the task list matches what was built.

- [X] T072 [US6] `src/harness/ai-driver.ts`, `src/harness/role-driver.ts`, `src/loop/loop.ts`, `src/loop/verdict.ts`: a role is asked again (three attempts in all) when its answer fails the caller's own schema, with the problem named by field path and limit; the loop passes a `check` for the critic and the reviser (FR-019). Found by T053: a Haiku critic's answer exceeded a length limit that Anthropic's structured-output mode does not enforce, and the loop failed with `VerdictInvalid`. Tests: `test/ai-driver.test.ts` and `test/loop-rounds.test.ts`.
- [X] T073 [US4] `src/harness/ai-driver.ts`, `src/harness/ai-options.ts`: end a run as `setting_ignored` when a response's warnings say a pinned setting was not applied (FR-020). Found by `spikes/fireworks/probe-settings.ts`: the SDK drops a temperature or `thinking: off` on Sonnet 5.5 with a warning instead of failing. Tests: `test/ai-driver.test.ts`.
- [X] T073 [US6] `src/harness/providers.ts`, `src/harness/models.ts`, `src/harness/ai-driver.ts`, `src/harness/role-driver.ts`, `src/loop/loop.ts`, `src/loop/cli.ts`: `thinking` accepts a token budget, roles take settings, `critic-loop.ts --settings` passes them, and the calibration settings are re-pinned to what the earlier runtime sent (FR-021). Found by T052 and the request-shape capture. Tests: `test/providers.test.ts`, `test/ai-options.test.ts`, `test/ai-driver.test.ts`, `test/loop-rounds.test.ts`, `test/loop-cli.test.ts`, `test/harness.test.ts`, `test/report.test.ts`.

## Phase 11: Operational robustness (added 2026-10-11)

**Goal**: a throttled, hung or crashing run is recorded as such, with the spend it had, and a runaway run is bounded. Covers FR-022 to FR-027. Tests first; the cases are fault injection on the scripted provider and the real craft server.

- [X] T074 [P] Tests first: `test/ai-driver-faults.test.ts` (provider failures, cut-off response, stalled step and tool, abort keeps usage, spend caps, dead server, invalid tool calls), `test/harness-limits.test.ts`, and unit tests in `test/ai-options.test.ts`; the process helpers move to `test/helpers/processes.ts`.
- [X] T075 `src/harness/ai-options.ts`, `src/harness/driver.ts`: limits and their defaults, `overCap`, `invalidStreak`, `longRetryAfter`, `toolStop`, the finer `failureCode`, and `DriverAborted` carrying the partial result.
- [X] T076 `src/harness/ai-driver.ts`: step and tool timeouts, caps and output ceiling, fail-fast on a long retry-after, `server_lost`, `tool_loop`, `output_limit`, partial usage on abort.
- [X] T077 `src/harness/run.ts`, `src/harness/cli.ts`, `src/harness/errors.ts`, `scripts/run-agent.ts`: keep a driver's partial result under the timeout or cancel reason, `--step-timeout-seconds`, `--tool-timeout-seconds`, `--max-output-tokens`, `--max-total-tokens`, `--max-usd`, `limits` and `invalidToolCalls` in `score.json`, `LimitRefused` for a dollar cap on an unpriced model.
- [X] T078 Docs: this spec, research R12, ADR-005 Consequences and an amendment, `AGENTS.md`, `design/notes/operational-robustness.md`.
- [ ] T079 Live check (a few cents on Haiku, only on the owner's go-ahead): a 2,000-token cap ends a real run as a budget stop, and a one-second step timeout ends one as `step_timeout` with its cost recorded, with no craft server left running.

## Phase 12: User Story 8 - Record a run as the model lived it (added 2026-10-12; T080 to T084 built, T085 not run)

**Goal**: a recorded run reaches the memory service with the model's messages and reasoning, FR-028 to FR-032. Decided in ADR-003 §2.4 (amended) with matching amendments to ADR-002 and ADR-005. Open question for the memory service's team: whether the distiller uses a step's reasoning.

**Independent Test**: record a scripted run through the scripted service and inspect the writes (SC-014).

- [X] T080 [P] [US8] Tests first: `test/ai-driver.test.ts` (the driver reports each turn's text, reasoning and call ids; a model with no reasoning), `test/loop-candidate.test.ts` (the writes: messages in order, a step per tool-calling turn, calls under their steps, tool names as seen, no placeholder text naming Claude Code, no score or solver content, metadata fields, a run with no conversation file), `test/privacy.test.ts` (`conversation.jsonl` is in no trace, score, summary, bundle, export or reason).
- [X] T081 [US8] `src/harness/driver.ts`, `src/harness/ai-driver.ts`, `test/helpers/fake-player.ts`: the sink reports each turn (text, reasoning, call ids); the scripted player does too.
- [X] T082 [US8] `src/harness/run.ts`: write `conversation.jsonl` from the turns; `src/harness/export.ts` and the summary never read it.
- [X] T083 [US8] `src/loop/transcript.ts`, `src/loop/candidate.ts`, `src/loop/nams.ts`: the recording step reads the file and writes the conversation as FR-029 to FR-031 say, and falls back to the earlier shape when the file is absent.
- [X] T084 [US8] Update `specs/005-critic-loop-harness/contracts/` and `quickstart.md` if they describe the recording, and `AGENTS.md`'s line on the conversation file once it exists.
  - Done 2026-10-12: `nams-seam.md` (the `addStep` signature), `AGENTS.md`, and `design/notes/skill-process.md` (v2, `PROCESS_VERSION` 2). Built and tested with the scripted player and the mock model; no real provider has yet returned reasoning to this code, so what `onStepEnd` reports for Claude's thinking and for gpt-oss is unverified (a few cents on each, to be run with T085).
- [ ] T085 [US8] FR-032, gated and spending: record new teacher runs, distil twice from the same runs (placeholder steps, then real reasoning) and record the comparison in `design/notes/`. Only on the owner's go-ahead.

---

## Phase 13: User Story 9 - Know how a skill was made (added 2026-10-12, not built)

**Goal**: `loop.json` records how a skill was made, FR-033 to FR-038, and a process version with a changelog says what the procedure was. Decided in ADR-003 §2.6 (amended). It needs nothing from the memory service's team, and its recording-format field becomes `conversation` once Phase 12 exists.

**Independent Test**: scripted roles and a scripted service produce a record with every field, no recorded text in it, and the changelog guard fails for an unlisted version.

- [X] T086 [P] [US9] Tests first: `test/loop-record.test.ts` (every field of FR-033 to FR-035 present: process version, commit, dirty flag and hash, run hashes and teacher model and settings, recording format, distiller request, gates and capabilities, role models and settings, cost, round and final hashes), `test/process.test.ts` (the constant has a changelog entry, and a version with none fails), `test/privacy.test.ts` (no recorded text, reasoning or key in `loop.json`, and nothing written inside the accepted skill's folder).
- [X] T087 [US9] `src/loop/process.ts` (the version constant) and `design/notes/skill-process.md` (the changelog): v1 is the loop as spec 005 built it, with placeholder-step recording; say what the next version (per-turn reasoning, Phase 12) will change. State the bump rule from FR-036 in the note.
- [X] T088 [US9] `src/loop/record.ts`, `src/loop/cli.ts`: write the new fields into `loop.json`; the commit and the changes' hash come through an injected function so tests do not run git.
- [X] T089 [US9] `src/loop/candidate.ts`, `src/loop/transcript.ts`: carry each run's hashes, teacher model and settings (from `score.json`) and the recording format to the record, and the roles' settings from the loop's options.
  - Done 2026-10-12: `Recording` carries `runLogSha256`, `scoreSha256` and `settings`; the candidate step records its request (`scope`, `conversations`, `procedureFormat`) in `generation.request`. The loop tests pass a fixed `processInfo`, so none runs git.
- [X] T090 [US9] Update `specs/005-critic-loop-harness/contracts/loop-record.md` for the new fields, and document in `AGENTS.md` and the quickstart how a student run's skill hash finds its record (`grep` the `skillSha256` and `finalSha256` fields of `loops/*/loop.json`).

---

## Dependencies and order

- **Phase 1** first. **Phase 2** blocks everything: the table and canonical names.
- **US1 (Phase 3)** and **US2 (Phase 4)** are the P1 pair and both need only Phase 2; US1 is the MVP. They touch `ai-driver.ts` and `test/ai-driver.test.ts` in different parts, so do them one after the other if one agent works.
- **US3 (Phase 5)** needs Phase 2. It comes before US4's calibration run (T048) and before the live checks so those spend less. T037 is the gate.
- **US4 (Phase 6)** needs Phase 2; T048 and T049 need T037.
- **US6 (Phase 7)** needs Phase 2 and T037 (caching on). T054 and T056 may add small fixes in `src/harness/ai-driver.ts`.
- **US5 (Phase 8)** needs Phase 2 and should follow US1 and US3, since it edits the same driver and the same score.
- **US7 (Phase 9)** goes last among stories, after the code stops changing, and **Phase 10** after that.

Within a story: tests, then implementation, then the story's checkpoint. Tasks marked [P] in a story touch different files.

### Parallel examples

```text
After Phase 2:        T013 T014 T015 T016 T017 T019   (US1 tests, six files)
                      T026 T027 T028                  (US2 tests)
After US3:            T053 T054 T055 T056             (US6 gated checks, one file each; run one at a time to keep spend visible)
Docs, near the end:   T062 T063 T064
```

## Implementation strategy

1. **MVP**: Phase 1, Phase 2, US1, US2. Models are canonical, runs record the model that ran and an honest cost, and a provider is a table row. Stop and check the scripted suite.
2. **Cost next**: US3, so every later spend is cheaper (T037 confirms it).
3. **Behaviour**: US4 (pinned settings, then the calibration rerun), then US6 (live checks) and US5 (retries).
4. **Last**: US7 (documents), then Phase 10.

Do the git steps one at a time and only when asked (commit, push, pull request).
