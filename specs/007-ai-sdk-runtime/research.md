# Research: Complete the AI SDK Runtime

Decisions for the questions the spec and ADR-005 left to the plan. Two probes were run against the installed
SDK (`ai` 7.0.133) with its scripted model; their results are stated where they matter.

## R1. The provider table is data that `ai-driver.ts` reads

**Decision**: `src/harness/providers.ts` holds one row per provider: `prefix`, `package` (the npm name), `factory`
(the export that creates the provider, such as `createFireworks`), `keyEnv`, `expand(shortName)`, `normaliseReported(id)`,
`routed` (true for a router) with `pinnedBackend` required when routed, `usageReport` (a name or null), and
`settings` (which of thinking, effort and temperature the provider accepts, with per-model exceptions). `ai-driver.ts`
creates a model with `await import(row.package)` and calls the named factory. The module has no SDK import, so
spec parsing and the dry run stay light and ADR-005 §2.1 (one file imports the SDK) holds.

**Rationale**: SC-003 asks for a provider through the table and price entries alone. A table of factory functions
would import every provider package wherever the table is read. Holding the package and factory names as strings
keeps the table readable by pure code and still one row per provider. The package is declared in `package.json`
when the row is added, which is a dependency and not a source change.

**Alternatives**: factories in the table (imports every package at parse time, breaks §2.1); a table in `ai-driver.ts`
plus a pure list of names elsewhere (two places to edit, so SC-003 fails); a plug-in registry (more machinery
than one row).

## R2. The model that ran comes from each step's response, and the trace must agree

**Decision**: a run's models are the set of `response.modelId` values over its steps, each normalised through the
table row to the canonical form (Fireworks `accounts/fireworks/models/x` becomes `fireworks/x`; a Claude id as reported,
such as a dated snapshot, becomes `anthropic/<id>`).
An id the row cannot normalise is recorded as reported. When a step reports none, the requested spec stands in.
`measure.ts` compares the trace's request models with the result's `modelsUsed` and records a mismatch on any
difference, so request lines must carry the reported id. The recorder takes a request's model from the last of its
`message_start` and `message_delta` events that names one, and the driver names the reported id on the usage event.

**Probe**: a scripted step with `response.modelId: "reported-model-x"` returned it as `steps[0].response.modelId`.

**Rationale**: the driver cannot know the reported id when the request starts, and moving the start event to the end
would lose the request's start time. The model field is already on the recorder's allowlist (ADR-002 §2.3), so the
change adds no new field.

**Alternatives**: report the id on `message_stop` only (the recorder already writes the line there, but a start-only
reader would miss it); drop the models check in `measure.ts` (it is the guard against lost lines).

## R3. Computed cost stays the figure of record; a reported cost is kept beside it

**Decision**: `costUsd` stays computed (tokens and a price entry, `null` without one). A provider row may name how
to read a per-request cost from the provider metadata (`reportedCost`); the run sums it into `reportedCostUsd`,
absent when the provider gives none. Neither Anthropic nor Fireworks reports one today, so the field is built and
tested with a scripted provider and filled when a provider that reports (OpenRouter) is admitted.
`aggregate()` adds `pricedRuns` and `unpricedRuns`, `totalCostUsd` sums priced runs only, and the report prints the
unpriced count beside every cost.

**Rationale**: computed cost is comparable across providers; a reported figure is a cross-check, not a replacement.
Counting an unpriced run as zero is the spike's defect (a Fireworks total read `$0.000`).

## R4. Anthropic prompt caching through the provider's call option

**Decision**: the Anthropic row carries a call option, `providerOptions.anthropic.cacheControl = { type: "ephemeral" }`,
that `ai-driver.ts` passes on every call to that provider. The provider package declares this option (its option
schema has `cacheControl` with a `type` and an optional `ttl`).

**Verification, not assumption**: whether the call-level option caches the tool list and the growing message history
is confirmed by one measured Claude run before the calibration rerun (task order in tasks.md). The target is at
least 80% of input tokens read from cache. If the call-level option does not reach the history, the fallback is a
cache breakpoint on the last message in `prepareStep`, which is also pure and testable.

**Rationale**: the spike's Claude runs read 0% from cache and cost about US$0.6 each. Caching is the largest cost
lever and changes nothing the model does.

## R5. Retries: two, stated, counted by a model wrapper, kept out of the trace

**Decision**: the driver passes `maxRetries` explicitly (a constant, 2, the SDK default) so the setting is
recorded and not inherited. The language model is wrapped with the SDK's model middleware, whose `wrapGenerate`
runs once per attempt, so it counts attempts and failures. `failedAttempts` is the count of attempts that threw.
A run's score records `retries: { max, failedAttempts }`. The trace holds only the successful request (FR-011).

**Probe**: with a scripted model that threw a retryable error twice and then succeeded, `maxRetries: 2` made three
`doGenerate` attempts, and `onLanguageModelCallStart` and `onLanguageModelCallEnd` each fired once. The call
callbacks therefore cannot see retries; the wrapper can.

**Rationale**: a hidden retry makes a failing provider look healthy and inflates a run's duration without
explanation. A count in the score is enough to see it; a trace line per failed attempt would need a fixed shape and
adds a reader obligation to every consumer of the trace.

## R6. Settings are pinned per model, refused up front where the table knows, and recorded either way

**Decision**: a settings file (contracts/cli.md) maps model specs to `{ temperature?, effort?, thinking? }`, where
`thinking` is `"adaptive"` or `"off"` and `effort` is one of the provider's levels. The provider row maps them to
call options and lists refusals: for example a Claude model that takes only adaptive thinking refuses `off`, and one
that removed sampling parameters refuses `temperature`. `planExperiment` checks every pinned setting against the row
before anything is spent and refuses with a fixed message that names the model and the setting. A setting the table
does not know a model refuses is sent, and a provider rejection ends the run with `request_rejected`, recorded.
A run's score records the settings it used, with an unset setting recorded as `null`. The experiment summary
records the settings per model before the first trial.

**Rationale**: the table cannot know every model's limits, so the check is as good as the row; the rejection path
covers the rest without silently changing a setting. Recording `null` for an unset value states that the provider's
own default applied, which the harness did not choose.

**The calibration settings** (`calibration-settings.json`) mirror what the earlier runtime was found to send, captured on
2026-10-11 through a local forwarder that logged request shapes only (`design/notes/role-parse-rate.md`):

| Model | thinking | effort | temperature | Reason |
|---|---|---|---|---|
| `anthropic/claude-sonnet-5-5` (teacher) | `adaptive` | `medium` | unset | Claude Code sent `thinking: adaptive` and effort `medium`. The model refuses a non-default temperature. |
| `anthropic/claude-haiku-4-5-20251001` (student) | `31999` (a budget) | unset | unset | Claude Code sent `thinking: enabled` with `budget_tokens: 31999`. Haiku 4.5 takes a budget and no effort level, and Anthropic requires the default temperature while thinking is on. |

An earlier version of this file pinned Haiku to thinking off and temperature 0 and Sonnet to effort high, from Anthropic's published
notes and not from the earlier runtime's actual requests; it would have compared different configurations. The limits themselves
come from Anthropic's published notes; the first call to each model confirms them, and a rejection ends the run as
`request_rejected`, recorded.

## R7. The calibration rerun is the faithful world's, by the procedure in spec 003

**Decision**: rerun the faithful world's calibration on this runtime: the teacher and student of ADR-003 §2.1, the
three goals, five trials each (30 runs, about US$3.60 earlier), by the commands in
`specs/003-faithful-minecraft-world/quickstart.md` Part B step 1 with a new label prefix (`rt-cal-`). Caching (R4) is
confirmed first, so the rerun is not billed at the uncached rate. Roles come from the unchanged rule. Results go in
`design/notes/runtime-recalibration.md` with the runtime named, the base prompt wording used, and the settings
pinned (R6). The invented world and a full 60-run rerun are not part of this feature.

## R8. The live checks are gated tests, each leaving a record

**Decision**: four gated tests, skipped without `LIVE_SDK=1`:

1. **Critic loop end to end**: `critic-loop.ts --runs <finished runs> --candidate <skill folder>` in candidate mode, which
   distils nothing through NAMS and so writes nothing outside the repository, with a Claude critic and reviser and
   `--max-rounds 1`. It asserts a recorded accept or reject and one round.
2. **Thinking role under a small cap**: a Claude Opus role with `--max-role-usd` set low enough that its reasoning can
   exhaust the output ceiling. It asserts a complete schema-valid answer or the fixed `spend cap` reason, never a partial answer.
3. **Skill through the tool**: `run-agent.ts --skill <folder>` for three runs on a real model, asserting the score's
   `skill.invoked` and `loadedAfterCalls`.
4. **Cancellation**: start a run, send SIGINT after a few turns, and separately set a very short `--timeout-minutes`. Assert exit 130 or the timeout
   reason, a written summary, and no remaining process whose command line contains `src/mcp/server.ts`.

Each writes a short record under `design/notes/` (what ran, cost, outcome). The total is capped at US$10.

**Rationale**: these are the paths an experiment depends on and none has run on this runtime. Gating keeps the default
test suite free and offline, as the existing live tests do.

## R9. Documents

**Decision**: README and AGENTS already describe the runtime. Specs 002 and 005 and the design notes that name the
Agent SDK or `--record` get a one-line history marker pointing at ADR-005, as ADR-002 and ADR-003 already carry
amendments. No spec's requirements are rewritten.

## R12. Operational limits and failure codes (added 2026-10-11)

**Decision**: the player passes the SDK's `timeout: { stepMs, toolMs }` (defaults five minutes and one minute); a step that stalls
throws a `TimeoutError`, which the SDK does not retry, and a tool that stalls comes back as an MCP client error whose cause is
the `TimeoutError`. Caps (`maxTotalTokens`, `maxUsd`) are `stopWhen` conditions, so a run ends cleanly after the step that crosses
one and keeps its totals; a per-step `maxOutputTokens` is passed only when set. A dead craft server shows as an MCP client error
for a closed client in the tool-end event, and a streak of five steps with only invalid tool calls ends the run; both are `stopWhen`
conditions too. A driver aborted by its signal rejects with `DriverAborted`, which carries what it had spent.

**Read from the SDK (`ai` 7.0.133)**: `retry-after` is honoured only below 60 seconds and otherwise the wait is 2 s then 4 s; an
invalid or unknown tool call becomes a tool error with no tool-start event, so it is not in the trace and still costs a step; the
code uses `generateText`, so a stream that drops mid-response cannot occur and `wrapStream` is not needed.

**Rationale**: each of these, left alone, looks like a model failure or a lost cost in the calibration data.

**Left open**: whether `MAX_RETRIES = 2` is enough under parallel Fireworks runs; no pruning of a long run's history; the role
driver has a spend cap but no per-call stall timeout.
