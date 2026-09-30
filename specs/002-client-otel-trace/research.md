# Research: Run Observability

Facts come from a spike on one real run (Claude Code 2.1.285, goal `glirol` on `forge-7`, 20 model
requests, 36 tool calls, ended at its 20-turn budget). The run went through the Claude Agent SDK
(0.3.285) with the same process's OTel export switched on, so both views describe the same run. The
spike script and captures live in the session scratchpad, not the repository. Personal attributes are
never quoted.

## D1. The trace source is the Claude Agent SDK

- **Decision**: run the player through the SDK's `query()` in the harness's own process; record from its
  streamed messages and tool hooks.
- **Evidence** (SDK against OTel for the same run):

  | Quantity | OTel | SDK | Result |
  |---|---|---|---|
  | Four token counts, run total | 40 / 3,165 / 108,158 / 9,584 | identical (per-message final usage and result) | exact |
  | Tokens per request | 20 requests | same 20 | 20 of 20 identical |
  | Time to first token | per request | per request, same values | identical |
  | Request duration | span start to end | `message_start` arrival minus time to first token, to `message_stop` | consistent (first-byte to stop 236 vs 248 ms) |
  | Tool arguments | `tool_input` | `PreToolUse` input | 36 of 36 identical |
  | Tool duration | median 4 ms | median 9 ms from hooks | both negligible; hooks add dispatch |
  | Run duration | 45,311 ms | `duration_ms` 45,305 | within 6 ms |
  | Cost | per request | run total $0.0916976, equal to OTel's sum | per-request unavailable |
  | Personal identifiers | each of five appears 385 times | 0 occurrences of each | no scrubber needed for them |

- **Rationale**: every quantity the trace needs is available exactly except per-request cost. The route
  needs no receiver, no OTLP parsing, no pairing of two record kinds, no child environment, and no
  asynchronous rewrite of the subprocess call. Delivery is in-process, with no export lag.
- **Alternatives considered**: OTel export with a harness-hosted receiver (measured; adds per-request
  cost, costs the four things above; kept as the documented alternative); `claude -p` `stream-json`
  (same stream as the SDK without typed messages or hooks); NAMS `durationMs` (only when recorded, no
  tokens); backends such as Phoenix or Langfuse (do not join to `run.jsonl`).

## D2. What the recorder reads

- **Decision**: a request is recorded from three stream events sharing one message: `message_start`
  (arrival time, `ttft_ms`, message id), `message_delta` (final usage: the four token counts),
  `message_stop` (end). A tool call is recorded from `PreToolUse` (tool name, `tool_use_id`, input,
  start) and `PostToolUse` or `PostToolUseFailure` (end). The spike run had no refused calls, so which
  hook a refusal fires is unverified; the recorder accepts both. Only tools named `mcp__craft__*` become tool lines. Everything else in
  the stream, including assistant text, thinking, system messages and the session id, is ignored.
- **Rationale**: these are exactly the fields the spike validated. A line is written when it is
  complete (request at `message_stop`, tool at `PostToolUse`), so `seq` is completion order and a
  request precedes the tool calls it issued.
- **Note**: the SDK reports the main agent loop only, so there is nothing to filter for auxiliary
  requests; in the OTel capture the auxiliary request was the one span with no `api_request` event.

## D3. Time base and totals

- **Decision**: `t0` is the arrival of the SDK's `init` system message. Offsets are milliseconds on the
  harness's monotonic clock from `t0`. Request start is `message_start` arrival minus `ttft_ms`; end is
  `message_stop` arrival. Total duration is the result's `duration_ms`.
- **Evidence**: in the spike, `init` arrived 4,682 ms after the query began and the first request began
  at +42 ms from `init`. The result arrived 49,948 ms in; `result - init` was 45,266 ms against the
  result's own `duration_ms` of 45,305. Start-up is 4.7 s here (MCP server connect and hooks), which
  compared runs should not count.
- **Alternatives considered**: offset from `query()` start (includes start-up noise); the SDK messages'
  `timestamp` fields (documented as the originating host's clock, for display only); wall-clock times
  (leak when a run happened).
- **Testing**: the recorder takes an injected clock so tests use fixed times.

## D4. Order and the join

- **Decision**: the join sorts nothing: tool lines are in call order because `PostToolUse` fires in
  call order for a sequential agent. It pairs the k-th tool line with the k-th run-log entry, then checks
  tool name and arguments. A different count or any difference is a mismatch.
- **Rationale**: the agent calls tools one at a time, so hook order is call order, and so is the run log.
- **Alternatives considered**: join by arguments alone (breaks on repeated calls); join by time (the
  server has no clock).

## D5. The goal-reaching call and "to goal" figures

- **Decision**: `scoreRun` records the run-log `seq` of the entry after which the goal is first held
  (`reachedSeq`: 0 if held at the start, null if never). "To goal" figures are the tool line paired with
  that entry, then: duration is its `endMs`; tokens are summed over request lines with `endMs` at or
  before it. No cost: the SDK gives a run total only. `reachedSeq` 0 gives zeros.
- **Rationale**: one definition of "reached", already computed by `scoreRun`. The request that issued the
  call ends before the tool starts, so the rule includes it.

## D6. Cross-check against the totals in the player's final result

- **Decision**: when the result message arrives, compare the sum of the trace's request lines with the
  result's `usage` token counts. Any difference makes the trace a `mismatch` with a reason.
- **Rationale**: the spike showed all three sources agree exactly, so any difference means lost or
  duplicated lines. It costs one comparison and makes SC-001 an enforced property, not a hope.

## D7. The driver seam and the abort path

- **Decision**: `AgentDriver` is a small function type: given options and a sink for messages and hook
  calls, run the player and resolve with its result (`ended`, `turns`, `costUsd`, `durationMs`, `usage`,
  final text). `sdk-driver.ts` is the only file importing the SDK. Tests pass a scripted driver.
- **Budget behaviour**: the SDK delivers a result message with subtype `error_max_turns` and then throws.
  The SDK driver catches that throw when a result was already delivered and returns the result; only a
  throw with no result becomes `ended: "error"`.
- **Alternatives considered**: mock the SDK module in tests (couples tests to its internals); keep the
  CLI stand-in (no longer matches the harness).

## D8. Options carried over from the CLI flags

- **Decision**: `query()` options: the `craft` server via `mcpServers` with `strictMcpConfig: true`;
  `tools: []`; `allowedTools: ["mcp__craft"]`; `maxTurns`; `model`; `persistSession: false`;
  `settingSources: []` unless the run records to NAMS (then user settings load, as `--record` did);
  `includePartialMessages: true`; `PreToolUse` and `PostToolUse` hooks; `cwd` set to the run folder.
- **Evidence**: this option set ran the spike successfully. `settingSources: []` and `tools: []` kept
  built-in tools and user plugins out of the run, and the transcript recorded 36 calls to the craft tools.
- **Open**: with `--record`, whether user settings load through `settingSources` the way they did for the
  CLI is checked in the quickstart, since the spike ran without it.

## D9. What a bundle holds, and what "exercised" means

- **Decision**: a bundle holds a manifest (world name and grid size, goal, best-possible figures, label,
  how the run ended), `frames.jsonl`, `trace.jsonl`, and a reduced result (`ended`, `turns`, the score,
  the measured figures). The agent's final message (`text` in the run's `score.json`) is left out. A
  frame carries the table, the held items (item ids and counts), the preview (`craftable`, `partial`)
  and running counts. No recipe, no item description, no world file.
- **Rationale**: the agent's closing words can restate reasoning, and a bundle is meant to be shared.
  Item ids appear only as the run met them (placed, held, crafted, or named in a preview), which is what
  "exercised" means in FR-016; nothing lists a recipe's inputs. A test searches bundles for the world
  file's name, item descriptions and recipe records.
- **Alternatives considered**: include the agent's text (privacy and reasoning exposure); include the
  world's item list for legends (leaks unmet items).

## D10. Bundle atomicity

- **Decision**: write into a temporary sibling folder, then rename to the destination; a failure removes
  the temporary folder. An existing destination is refused before any work.
- **Rationale**: FR-019 forbids partial bundles, and rename is atomic on one volume.

## D11. Frame derivation

- **Decision**: `deriveFrames(world, goal, entries)` returns a start frame (`seq` 0, tool `start`) and one
  frame per log entry, each with the table, `craftable`, optional `partial`, held items, running action
  and refusal counts and a `reached` flag. It uses the same replay as `scoreRun` and throws
  `ReplayError` on a log that does not replay.
- **Rationale**: the observer mock's `framesFor` already has this shape and was checked on a real
  recording; moving it into `src/sim/` under tests makes the frame the tested contract.

## D12. Failure handling: typed errors in plain TypeScript, Effect later

- **Decision**: harness failures are a small set of error classes with stable codes (`RunFolderExists`,
  `UnknownGoalItem`, `ReplayFailed`, `DriverFailed`, `RunTimedOut`), each run is guarded so one failure
  cannot end an experiment, every run has a time limit and an abort signal, and the command-line layer
  matches errors by class. A `reason` on a failed run is `code: fixed message`, never the wrapped
  error's text.
- **Rationale**: the harness before this feature had one `try/catch`, an unguarded `scoreRun` after a
  paid run, and exit codes chosen by matching message text. These are fixed in plain TypeScript.
- **Deferred**: Effect would add typed error channels, scoped cleanup, interruption, retries and bounded
  parallelism. The constitution names zod and plain TypeScript, so adopting it needs an ADR. It pays
  off when the NAMS skills client arrives (generate, poll, review, publish, with rate limits, retries and
  partial failures), so revisit it then. The seams here (the driver as a service, an injected clock,
  pure `measureRun` and recorder) map onto Effect services and layers without rework.
