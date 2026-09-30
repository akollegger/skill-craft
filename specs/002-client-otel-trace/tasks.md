# Tasks: Run Observability

**Input**: Design documents from `/specs/002-client-otel-trace/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. Principle IV and FR-020 require tests before the code they cover. Write each story's tests first and confirm they fail before implementing.

**Organization**: Grouped by user story. Stories share files (`src/trace/measure.ts`, `src/harness/run.ts`), so implementation tasks run in priority order; each story's tests are separate files and can be written in parallel.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: The user story the task serves (US1 to US5)

## Path Conventions

Single project: `src/sim/` (no MCP or SDK dependency), `src/trace/` (measurement; imports neither the SDK nor `src/mcp`), `src/harness/`, `scripts/`, `test/`. Imports of local files use the `.js` extension (NodeNext). Reference behaviour in [contracts/](contracts/) and [data-model.md](data-model.md); do not restate it in code comments. Types named in the data model (`TraceLine`, `Measured`, `Frame`, `PlayerResult`, ...) are used as written.

---

## Phase 1: Setup

**Purpose**: Add the one new dependency without changing behaviour.

- [ ] T001 Add `@anthropic-ai/claude-agent-sdk` to `package.json` pinned to an exact version (`pnpm add -E @anthropic-ai/claude-agent-sdk@0.3.285`); commit the lockfile change; confirm `pnpm typecheck && pnpm test` still pass and that its peer requirements (`zod`, `@modelcontextprotocol/sdk`) are already satisfied without new installs

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The shared types, the driver seam, the scripted player that every later test uses, and `reachedSeq`.

**⚠️ CRITICAL**: No user story work starts until this phase is complete.

- [ ] T002 [P] Write `test/score.test.ts` additions (must fail first): `scoreRun` returns `reachedSeq` equal to the run-log `seq` of the entry after which the goal is first held; `0` when the goal is held before any call; `null` when never reached; all existing fields unchanged for the existing cases
- [ ] T003 [P] Create `src/trace/lines.ts`: the `RequestLine`, `ToolLine` and `TraceLine` types from [data-model.md](data-model.md), `readTrace(path)` (returns `[]` for a missing or empty file, throws on a malformed line with its number) and `linesAfter(lines, n)` (lines with `seq > n`; all for `n < 0`)
- [ ] T004 [P] Write `test/trace-lines.test.ts`: `readTrace` on a missing file, an empty file, a valid two-line file and a malformed line; `linesAfter` for `n = -1`, a middle `n`, and `n` at the last `seq`
- [ ] T005 [P] Create `src/harness/driver.ts` (types only): `PlayerMessage` (the structural subset the recorder reads: `system`/`init`; `stream_event` carrying `ttft_ms` and an `event` of `message_start` with a message id, `message_delta` with final usage, or `message_stop`; `result` with `subtype`, `duration_ms`, `total_cost_usd`, `num_turns`, `usage`, `result` text), `ToolCall`, `DriverSink` (`onMessage`, `onToolStart`, `onToolEnd`), `DriverOptions`, `PlayerResult`, and `AgentDriver`, per [contracts/player-driver.md](contracts/player-driver.md)
- [ ] T006 Edit `src/sim/score.ts` to add `reachedSeq: number | null` to `RunScore` (depends on T002); make T002 pass without changing any other field
- [ ] T007 Create `test/helpers/fake-player.ts` (depends on T005): a scripted `AgentDriver` that plays the real engine against `opts.world` with a run log at `opts.runLog`, and emits SDK-shaped messages and tool-hook calls through the sink. Modes: `solve` (best run for a goal), `wander`, `budget` (result with `error_max_turns`, then the driver rejects), `crash` (rejects with no result), `silent` (plays the engine, emits nothing). Options: invented personal values and agent text/thinking to put inside messages, and a fixed per-message token count so totals are known. It replaces `test/helpers/fake-claude.ts`, which is deleted in T031
- [ ] T008 Run `pnpm typecheck && pnpm test`; everything passes (depends on T003, T004, T006, T007)

**Checkpoint**: shared types, the seam and the scripted player exist; existing tests still pass.

---

## Phase 3: User Story 1 - See what a run cost (Priority: P1) 🎯 MVP

**Goal**: A finished run's `score.json` reports duration, four token totals and cost, plus duration and tokens up to the goal, measured by the harness from the player's events.

**Independent Test**: Run `runExperiment` with the scripted driver on a solvable goal with known per-message tokens. `score.json` `measured.trace` is `matched`, totals equal the sums, and `toGoal` equals the sums up to the goal-reaching call.

### Tests for User Story 1 (write first, confirm they fail)

- [ ] T009 [P] [US1] Write `test/recorder.test.ts` with an injected manual clock: `init` sets `t0`; a request line is written at `message_stop` with `startMs` = `message_start` arrival minus `ttft_ms` (clamped to 0) and `endMs` = stop arrival, both minus `t0`; the four token counts come from `message_delta`; `turn` counts request lines; a tool line is written at `PostToolUse` with the server prefix removed from the name, `args` from the input and times from Pre and Post; a tool not named `mcp__craft__*` writes nothing; `seq` runs 0,1,2... in completion order and a request precedes the tools it issued; lines are appended to the file as they complete
- [ ] T010 [P] [US1] Write `test/measure.test.ts` (matched path): `total` has the result's `duration_ms` and `total_cost_usd` and the sums of the request lines; `toGoal` sums duration and tokens over request lines with `endMs` at or before the goal-reaching tool line's `endMs` (including the request that issued it) and uses that line's `endMs` as duration; `reachedSeq` 0 gives all-zero `toGoal`; a run that never reached the goal has `total` and no `toGoal`
- [ ] T011 [P] [US1] Write `test/sdk-driver.test.ts` for the pure parts: `sdkOptionsFor(opts)` gives the option table in [contracts/player-driver.md](contracts/player-driver.md) (`tools: []`, `allowedTools: ["mcp__craft"]`, `strictMcpConfig`, `persistSession: false`, `includePartialMessages`, `maxTurns`, the craft MCP server env, `settingSources: []` unless `record`, a model only when given); `classifyResult(result, threw)` gives `stopped` for `success`, `budget` for `error_max_turns` even when a throw followed it, `error` for another error subtype or for a throw with no result
- [ ] T012 [P] [US1] Rewrite `test/harness.test.ts` to drive `runExperiment` through the scripted driver (depends on T007): keep the `buildPrompt` and `aggregate` cases; replace the `claudeArgs`, `mcpConfigFor`, `parseClaudeResult` and stand-in-claude cases with driver-based ones covering a run that reaches the goal, one that gives up, one that spends its budget (result then rejection, classified `budget`), and one that crashes (recorded as `error`, the experiment continues); assert `trace.jsonl` exists and `score.json` carries `measured.trace: "matched"` with figures equal to the scripted tokens; keep the unknown-goal rejection and the `planExperiment` dry-run case, adjusted to list SDK options instead of CLI commands
- [ ] T013 [P] [US1] Write `test/live-sdk.test.ts`, skipped unless `LIVE_SDK=1`: one real 5-turn run on `worlds/generated/forge-7.json` through `sdkDriver`; assert a `result` was received, `trace.jsonl` has request and tool lines, and the recorded token sums equal the result's `usage`. Costs real usage, so it never runs by default

### Implementation for User Story 1

- [ ] T014 [US1] Create `src/trace/recorder.ts` (depends on T009, T003, T005): `TraceRecorder` with an injected clock and an append-to-file sink; `onMessage`, `onToolStart`, `onToolEnd`; it reads only the fields in the data model's "Recorder inputs" table and keeps the result message's `duration_ms`, `total_cost_usd`, `num_turns` and `usage` for the harness
- [ ] T015 [US1] Create `src/trace/measure.ts` (depends on T010, T003, T006): `measureRun(entries, traceLines, result, score)` returning `Measured`; this task covers the matched path only, with `total` and `toGoal` computed per [contracts/score-json.md](contracts/score-json.md) (the mismatch and absent paths are added in US4)
- [ ] T016 [US1] Create `src/harness/sdk-driver.ts` (depends on T011, T005): `sdkOptionsFor`, `classifyResult`, and `sdkDriver`, the only file importing the SDK; it iterates `query()`, forwards every message and both hooks to the sink, catches the post-result throw, and returns a `PlayerResult`
- [ ] T017 [US1] Edit `src/harness/run.ts` (depends on T012, T014, T015, T016): delete `claudeArgs`, `parseClaudeResult`, `ClaudeResult` and the `spawnSync` code; keep `buildPrompt`, `aggregate`, `planExperiment` and `mcpConfigFor` (now producing the SDK's `mcpServers` entry, and still writing `mcp.json` so exports can find the world); make `runOnce` and `runExperiment` async and accept a driver (default `sdkDriver`); create a recorder per run writing `trace.jsonl`; on finish call `measureRun` and write `score.json` with `measured` added; stop writing `claude.json` and `stderr.txt`
- [ ] T018 [US1] Edit `scripts/run-agent.ts`: await the async harness, drop the `--claude` option and `CLAUDE_BIN`, print duration and token totals in each run line and cost in the summary (depends on T017)
- [ ] T019 [US1] Update `test/scripts.test.ts`: keep the dry-run and argument-error cases for `run-agent.ts` (dry run now shows SDK options); remove the case that runs the script against a fake CLI (`--claude`), since that path no longer exists and end-to-end behaviour is covered in `test/harness.test.ts` (depends on T018)
- [ ] T020 [US1] Run `pnpm typecheck && pnpm test`; all pass, including the rewritten harness suite (depends on T017, T019)

**Checkpoint**: a scripted run yields a `matched` trace and figures in `score.json`. MVP.

---

## Phase 4: User Story 2 - Nothing personal in a run folder (Priority: P1)

**Goal**: Nothing that identifies the runner, and none of the agent's text or reasoning, reaches any file the harness writes.

**Independent Test**: Run the scripted driver with invented personal values and agent text in its messages; search every file in the run folder and the process output for them. None appear.

- [ ] T021 [P] [US2] Write `test/privacy.test.ts` (must fail first if any leak exists): with the scripted driver carrying an invented email, user id, two account ids, an organization id, an invented session id, agent text and thinking text in its messages, run an experiment and read every file under the run folder and the label folder plus captured stdout and stderr; assert none of the values appear; assert every key in every `trace.jsonl` line is in the allowlist of [data-model.md](data-model.md); assert no file holds unfiltered messages (only `mcp.json`, `prompt.txt`, `run.jsonl`, `trace.jsonl`, `score.json` and the label's `summary.json` exist)
- [ ] T022 [US2] Make T021 pass (depends on T021, T017): confirm `summary.json` and `score.json` carry only `ended`, `turns`, `costUsd`, `text`, `score` and `measured`; `text` is the agent's final message, kept in `score.json` as before and never in `trace.jsonl` or a bundle. Fix any leak the test finds; if none, record in the task that the allowlist held by construction

**Checkpoint**: the privacy property is an enforced test, not a promise.

---

## Phase 5: User Story 3 - The trace is a step-by-step record (Priority: P2)

**Goal**: A finished or live run's trace is numbered, ordered, resumable, and holds offsets only.

**Independent Test**: Produce a trace from the scripted driver and check numbering, order, resumability and that no wall-clock value appears.

- [ ] T023 [P] [US3] Extend `test/recorder.test.ts`: `seq` is contiguous from 0; `linesAfter` on the written file returns exactly the later lines; no field holds a wall-clock value (every time is an integer below the run's total duration, and no line contains an ISO date); lines are on disk before the run finishes (with a driver that pauses between messages, the file grows message by message)
- [ ] T024 [US3] Make T023 pass (depends on T023, T014): the recorder appends and flushes per line and keeps no cross-run state; fix anything the tests find

---

## Phase 6: User Story 4 - A bad trace never corrupts the score (Priority: P2)

**Goal**: A trace that disagrees with the run log or the player's own totals is marked and excluded; call-based scoring is untouched.

**Independent Test**: Give `measureRun` a trace with a missing call, another with altered arguments, and another whose token sum differs from the result's; each yields a mismatch with a reason and no figures.

- [ ] T025 [P] [US4] Extend `test/measure.test.ts`: tool count differs from the log (mismatch, reason names both counts); a call's arguments differ (reason names the call number, log tool and trace tool or arguments); two identical consecutive calls pair by order and match; the summed request tokens differ from the result's `usage` (mismatch, reason names the field and both numbers); no trace lines and no result figures gives `absent` with no `total` or `toGoal`; in every mismatch case `RunScore` is identical to one computed with no trace
- [ ] T026 [P] [US4] Extend `test/harness.test.ts`: with the `silent` mode the run is scored on calls alone and `measured.trace` is `absent` with no error; with a driver that drops one tool hook the run is `mismatch`; a rerun into an existing run folder is refused as before
- [ ] T027 [US4] Extend `src/trace/measure.ts` (depends on T025, T015): add the join to the run log by order, checked against tool name (prefix removed) and arguments, the cross-check against the result's `usage`, and the `mismatch` and `absent` outcomes with reasons that contain no personal data
- [ ] T028 [US4] Make T026 pass (depends on T026, T027, T017): wire the outcomes into `score.json` and confirm the call-based fields are unchanged in every case

---

## Phase 7: User Story 5 - Export a run as a replay bundle (Priority: P2)

**Goal**: A finished run exports to a self-contained folder of frames, trace and result that reveals only what the run did.

**Independent Test**: Export a finished run, delete the run folder and the world file, and check the bundle alone reproduces every step.

### Tests for User Story 5 (write first, confirm they fail)

- [ ] T029 [P] [US5] Write `test/frames.test.ts`: `deriveFrames(world, goal, entries)` returns a start frame (`seq` 0, tool `start`) then one frame per entry with contiguous `seq`; frame `n` equals an independent replay of entries `1..n` (grid, `craftable`, `held`, running action and refusal counts); `reached` turns true at the goal-reaching frame; `partial` appears only in worlds whose hints are `partial`; refusal frames carry `ok: false` and `error`; a craft frame carries `crafted`; a log that does not replay throws `ReplayError`; the result is deterministic across two calls
- [ ] T030 [P] [US5] Write `test/export.test.ts` with a run folder produced by the scripted driver: the bundle has exactly `bundle.json`, `frames.jsonl`, `trace.jsonl` and `score.json`; frame count is calls plus one; after deleting the run folder and world file, `readBundle` still returns everything; `framesAfter(bundle, n)` and trace `linesAfter` return exactly the later items; the bundle holds none of: the world file name, any item description, any recipe id, the injected personal values, the agent's final text; a `mismatch` and an `absent` run export frames and a result with no measured figures; export refuses an unfinished run (no `score.json`), an existing destination, and a missing world file, each with a one-line cause; a log that does not replay fails and leaves no folder behind, including no temporary one

### Implementation for User Story 5

- [ ] T031 [US5] Create `src/sim/frames.ts` (depends on T029): `Frame` type and `deriveFrames`, sharing the replay with `scoreRun` where practical (a small internal `replay` helper in `score.ts` or a shared module, not a copy), no MCP or SDK import
- [ ] T032 [US5] Create `src/harness/bundle.ts` (depends on T030, T003, T031): `BundleManifest`, `readBundle(dir)`, `framesAfter(bundle, n)`, `traceAfter(bundle, n)` per [contracts/replay-bundle.md](contracts/replay-bundle.md)
- [ ] T033 [US5] Create `src/harness/export.ts` (depends on T031, T032): `exportBundle(runDir, dest)` that reads `mcp.json` for the world, `score.json` for the goal and result, `run.jsonl` and `trace.jsonl`; writes into a temporary sibling folder and renames on success; removes the temporary folder on any failure; builds the reduced `score.json` (no agent text)
- [ ] T034 [US5] Create `scripts/export-run.ts` (depends on T033): `pnpm dev scripts/export-run.ts <run-dir> <dest>`, printing the destination and frame count, or a one-line cause and exit 1; add its cases to `test/scripts.test.ts`
- [ ] T035 [US5] Delete `test/helpers/fake-claude.ts` and confirm nothing imports it (depends on T012, T019, T030)

**Checkpoint**: a run exports to a bundle that plays back without the sources.

---

## Phase 8: Polish and cross-cutting

- [ ] T036 [P] Update `README.md`: the harness runs Claude Code through the Claude Agent SDK; run folders now hold `mcp.json`, `prompt.txt`, `run.jsonl`, `trace.jsonl`, `score.json` (no `claude.json`); the export command; the Layout row for `src/harness/` and a new row for `src/trace/`
- [ ] T037 [P] Update `AGENTS.md`: Layout table (`src/trace/`, the SDK confined to `src/harness/sdk-driver.ts`), the `run-agent.ts` note (no `--claude`; still costs real usage), a rule that agent text and reasoning are never written to the trace or a bundle, and the new `scripts/export-run.ts`
- [ ] T038 [P] Update `design/notes/agent-player-options.md`: the interim-tooling section names the SDK instead of `claude -p`; nothing else changes
- [ ] T039 Run [quickstart.md](quickstart.md) steps 1, 2, 3, 4 and 6 for real (step 3 spends real usage, so keep to one short run); record the outcome, including the `matched` status and the personal-data search result, in a short note at the end of `research.md`
- [ ] T040 Run quickstart step 5 (`--record`) only when the user asks for a recorded run; it is the one check that user settings load through the SDK the way the CLI flag did
- [ ] T041 Optional: point `design/notes/pixel-observer/mock/make-frames.ts` at `deriveFrames` in place of its own `framesFor`, only if regenerating produces the same `index.html` data; otherwise leave the mock as is
- [ ] T042 Run `pnpm typecheck && pnpm test` one last time; both pass (depends on all earlier tasks)

---

## Dependencies and order

- Phase 1, then Phase 2 (T003 to T007 in parallel where marked, then T008), then the stories.
- US1 and US2 are both P1. US2's tests need US1's harness (T017), so run US1 first; US2 then adds little code.
- US3 and US4 depend on US1's recorder and `measure.ts`. US4 edits the same file as T015, so it follows US1.
- US5 needs `reachedSeq` (T006) only through the score in the bundle, and the recorder's output for a real trace; `deriveFrames` (T031) is independent of the rest and can start once Phase 2 is done.
- T035 waits for every task that still uses the CLI stand-in.

## Parallel opportunities

- Phase 2: T002, T003, T004, T005 together; T007 once T005 exists.
- US1 tests T009 to T013 together (different files).
- T029 (`frames.test.ts`) can be written during Phase 2 or US1, since it needs only the engine and a world.
- T036 to T038 together.

## MVP scope

Phases 1 to 3 (T001 to T020) give a measured run: the figures in `score.json`. US2 to US5 add the privacy test, the resumable record, the mismatch guard and the exported bundle.
