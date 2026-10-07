---
id: ADR-002
title: Measure run time and tokens on the client
status: accepted
created: 2026-09-30
specs: [specs/002-client-otel-trace]
---

# ADR-002: Measure run time and tokens on the client

## 1. Context

The demo compares runs of an agent on the same goal: without help, with recalled memory, and with a
distilled skill. Scoring so far counts calls. `scoreRun` replays a run's `run.jsonl` (the log the
`craft` MCP server appends, one line per tool call, no timestamps) and reports action calls against
the best possible (`callsToGoal` is the number of action calls up to the one that first produced the
goal item). The harness writes the result to `score.json` in the run's folder. Fewer calls stand in for
fewer tokens and less time, but the proxy is loose: context grows every turn, so a run with a few extra
calls can cost far more than the call count suggests, and a skill's own text adds tokens the call count
never sees. The demo needs real time and token figures.

The `craft` server cannot supply them. It sees one tool call at a time, with no view of the model
requests around it. The client sees all of it: each model request with its token usage and latency, and
each tool round trip. The memory side already works this way, since the `nams-hooks` plugin records
tool calls from client-side hooks.

The agent player in the interim harness is Claude Code. Two client-side routes were measured on real
runs of the same goal (a 20-request, 36-call run), the second with the first switched on for ground
truth.

- **OpenTelemetry (OTel) export** to a local OTLP (OpenTelemetry protocol) receiver over HTTP. Each
  `claude_code.api_request` event carries the four token counts, `cost_usd` and a `request_id`; spans
  add time to first token (`ttft_ms`) and per-tool durations. Summed, the events equal the CLI's own
  totals exactly. Events arrive 30 to 360 ms after they happen. Every record carries the user's email,
  user id, account ids and organization id (385 occurrences of each in one run). The route needs a
  receiver that keeps serving while the child runs, so the harness's blocking `spawnSync` would have
  to become asynchronous.
- **The Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`, 0.3.x), which runs the same Claude Code
  binary and streams its messages to the caller. With partial messages and tool hooks on, all 20
  requests matched the OTel figures token for token, time to first token was identical, tool arguments
  matched for all 36 calls, and run duration agreed within 6 ms. Its run total for cost equals OTel's
  sum. The stream carried none of the five identifiers (0 occurrences of each). It offers no
  per-request cost, only the run total.

The visualizer (see `design/notes/pixel-observer.md`) is a separate read-only process that replays a run
log on its world to draw the crafting table; a *frame* is the table state, inventory and preview after
one call. It wants time on each step and totals in the score row, live. It is meant to be shareable:
people watching should be able to open a recorded run and poke around it, and replay is enough for that.

## 2. Decision

### 2.1 Two records with separate jobs

`run.jsonl` stays as it is: what the world did, written by the server, with no clock, so a replay is
byte-identical and `scoreRun` treats it as ground truth. A new `trace.jsonl` beside it records what the
run cost: model requests, tool round trips, time and tokens. Nothing in the server, the engine or
`run.jsonl` gains a timestamp.

### 2.2 Source: the Claude Agent SDK, driven by the harness

The harness runs the player through the SDK's `query()` in its own process, in place of spawning
`claude -p`. It passes the options the CLI flags carried: the `craft` server as an MCP server with
`strictMcpConfig`, no built-in tools (`tools: []`), `allowedTools: ["mcp__craft"]`, `maxTurns`, the
model, and `persistSession: false`. Unless the run is being recorded to NAMS, `settingSources: []` keeps
user settings, and so the NAMS hooks, out of the run; with recording, user settings load as before.
`includePartialMessages: true` exposes each request's start, first token and stop, and `PreToolUse` and
`PostToolUse` hooks expose each tool call. A **recorder** turns these into `trace.jsonl`. A thin
driver seam separates the harness from the SDK, so tests can supply a scripted player.

### 2.3 Record only an allowlist

The recorder keeps only allowed fields: request id, the four token counts, time to first token, start
and end offsets, tool use id, tool name and arguments. The stream also carries the agent's text,
thinking and a session id; none of that is written, in `trace.jsonl` or in any log. The SDK stream
carried no account identifiers in the spike, and the allowlist keeps it that way by construction.

### 2.4 Shape of `trace.jsonl`

One JSON object per line, ordered as recorded, each with a `seq` (0, 1, 2, ...) and a `kind`:

- `request`: `{seq, kind, requestId, turn, startMs, endMs, ttftMs, inputTokens, outputTokens,
  cacheReadTokens, cacheCreationTokens}`
- `tool`: `{seq, kind, toolUseId, tool, args, startMs, endMs}`

Per-request cost is not recorded because the SDK does not report it. A tool line has no success flag;
`run.jsonl` already records each call's outcome.

Times are milliseconds on the harness's monotonic clock from `t0`, the moment the SDK's `init` message
arrives (the session is ready, after the MCP server connects), so start-up is excluded and the file
reveals nothing about when the run happened. A request starts at its `message_start` arrival minus
its time to first token and ends at its `message_stop`; a tool call starts at `PreToolUse` and ends at
`PostToolUse`. `seq` makes the file resumable: a consumer that has seen up to `n` asks for lines after
`n`.

### 2.5 Joining trace to log, and what the score gains

A `tool` line joins to a `run.jsonl` line by order, checked against tool name (with the `mcp__craft__`
prefix removed) and arguments. Order decides identical consecutive calls; the check catches a trace and
log that disagree. `score.json` gains, next to the call counts: `durationMs` (the CLI's own
`duration_ms` for the run), the four token totals and `costUsd` (the run total from the SDK's result);
and "to goal" figures, without cost: duration (the `endMs` of the tool call that first reached the goal, the
call `scoreRun` reports as `callsToGoal`) and the four token totals summed over every `request` line written
before that call's `tool` line, which includes the request that issued the call. The order is the trace's
`seq`, not the clock: lines can share a millisecond, and the closing request must not be charged to the goal. A trace that fails to
join (different count or arguments than the log) is recorded as `trace: "mismatch"` and its figures are
left out of the score; the log's figures stand. The SDK reports the main agent loop only, so requests
made outside it never appear in the trace or the totals.

### 2.6 Hosted viewing is replay of exported bundles

A run is shared as a **replay bundle**: the frames derived from `run.jsonl` (the bundle holds these, not
the log), each with a `seq`, plus `trace.jsonl` and `score.json`. It contains no world file (a world
lists every recipe) and no raw messages. Frames still show every recipe the run exercised, since
crafted outputs appear in them. A static viewer, the same page the visualizer serves, loads a bundle and
plays it back; the visitor can pause, scrub, and open other bundles. No ingest endpoint, authentication
or live mirror exists. Where a bundle is hosted is outside this decision. The visualizer's own live mode
stays local. Frame derivation is a function of the simulation library, called by export and by the
visualizer; the wire contract between frame source and viewer is the `seq`-numbered frame list, so a live
mirror could be added later without changing the viewer.

## 3. Alternatives Considered

- **Timestamps in `run.jsonl`, stamped by the server or injected by the harness.** Rejected: the server's
  view has no model time or tokens, and any clock in the log gives up byte-identical replay.
- **Derive timing from NAMS.** `nams-hooks` records `durationMs` per tool call. Rejected: it exists only
  when the session is recorded (`--record`), which the baseline arm must not be, and it carries no
  token counts.
- **Claude Code's OpenTelemetry export with a harness-hosted receiver.** Measured and rejected as the
  source: it matches the SDK on every figure and adds per-request cost, but it needs a receiver
  running alongside the child, an asynchronous harness, and a scrubber for personal attributes on
  every record, and events arrive with a 30 to 360 ms lag. It stays the route to take if per-request
  cost is needed, or if a player that is not run through the SDK must be measured; an OTel Collector
  could relay to or replace the receiver then.
- **Parse `claude -p --output-format stream-json`.** Rejected: the SDK exposes the same stream as typed
  messages with hooks, without a child process to manage.
- **Off-the-shelf observability backends (Phoenix, Langfuse) or `ccusage`.** Rejected: none joins to
  `run.jsonl`, and `ccusage` reads session transcripts, which the harness does not persist.
- **A hosted service with live ingest.** Rejected for now: the goal is letting viewers explore a
  recorded run, and bundles achieve that without authentication, resumable ingest or a running server.

## 4. Consequences

- The score row can show duration, tokens and cost, and the leaderboard can sort by them. What single
  figure "cost" should be is still open (visualizer note, open question 1). Cost is a run total only; a
  "to goal" figure is tokens and time.
- The harness depends on a pre-1.0 package that bundles the Claude Code binary (about 5 MB). It is
  pinned to an exact version and upgraded deliberately.
- The SDK raises an error after delivering an `error_max_turns` result. The harness must catch it and
  still classify the run as `budget`.
- The harness gains a recorder and a joiner, each testable with scripted messages and no real agent, and
  a driver seam that replaces the CLI stand-in. Tests come first.
- The player is Claude Code through the SDK, which the pending experiment-protocol ADR must confirm.
  A different player needs its own trace source.
- Interactive sessions and the desktop app are not measured by either route without changing the user's
  global settings, and are out of scope.
- The trace is not verifiable by replay the way the log is. It is trusted as the harness observed it.
- Bundles need an export command and a viewer that runs without the visualizer's server. The viewer
  becomes a static page with a data loader.
- `score.json` gains fields, so its contract changes; the harness spec owns that change, not ADR-001.

## 5. Related

- Design notes: `design/notes/pixel-observer.md`, `design/notes/agent-player-options.md`
- ADRs: [ADR-001](ADR-001-crafting-table-world.md) (the run log this decision leaves untouched). The
  player choice (Claude Code, through the SDK) is assumed here and belongs to the pending
  experiment-protocol ADR.
- Specs: specs/002-client-otel-trace

## 6. Amendments

- **2026-09-30**: §2.6 said "Frame derivation remains the observer's job". That misplaced ownership.
  The observer is a separate process so the agent cannot reach it and the server stays clean; that says
  nothing about who defines the frame shape. A frame is the published contract of a replay bundle, and
  the viewer has no world to derive it from, so the producer side defines it. Frame derivation is a
  pure replay function in the simulation library, beside `scoreRun`, with no server or HTTP
  dependency. Bundle export and the observer's live mode both call it. Spec
  `002-client-otel-trace` builds it with bundle export. The bundle's contents and the `seq`-numbered
  frame contract are unchanged.
- **2026-09-30** (planning, superseded by the next entry): recorded OTel-specific deviations — metrics
  export off, offsets from the `user_prompt` event, request pairing to exclude auxiliary requests, and
  an asynchronous harness.
- **2026-09-30**: the trace source changed from Claude Code's OpenTelemetry export to the Claude Agent
  SDK, after a spike that ran one 20-request run through both and compared them (§1). Tokens, time to
  first token, tool arguments and duration matched; the SDK adds no personal identifiers and removes
  the receiver, the asynchronous harness rewrite and the OTLP scrubber. What was given up: per-request
  cost (run total only) and the `ok` flag on tool lines. §§1, 2.2 to 2.5, 3 and 4 were rewritten to
  match; OTel remains a documented alternative (§3). The title dropped "with OpenTelemetry"; the file
  name was kept so links stay valid.
- **2026-09-30** (implementation and review): the "to goal" token boundary is completion order (`seq`), as above,
  not `endMs`; a scripted player put every event in one millisecond and exposed the difference. Four checks were
  made stricter: a run log whose `seq` is not 1, 2, 3 and so on is a failed replay; replay compares what a craft
  made and the refusal code, not only whether the call succeeded; a trace is a mismatch when the player states no
  token totals, or names no models while the lines do, since the check cannot be made; and a model request whose
  usage lacks any of the four counts is skipped and counted, not read as zero.
- **2026-10-01**: ADR-003 retires hooks-based recording for experiment runs. §2.2's rule that user settings
  (and so the NAMS hooks) load when a run is recorded describes the interim `--record` flag. Experiment runs
  no longer use it: user settings stay out of every experiment run, and the harness records a finished run to
  NAMS afterward through the REST API, regenerating each tool output by replaying the run log. The
  measurement design here is unchanged.
- **2026-10-02**: ADR-004 (the skillcraft visualizer) extends §2.6. A replay bundle's manifest gains optional attributes so a
  catalog of runs can be built from bundles alone: the world's prior fit, the added prompt sentence, and the
  installed skill's name, whether the agent loaded it and after how many calls. The attributes are additive and
  readers ignore fields they do not know, so earlier bundles stay valid; the bundle still holds no world file, raw
  messages or agent text. The export code and the test that pins a bundle's contents change with it.
- **2026-10-03**: ADR-003's critic loop gets a designated place for model-authored review text. The rule that agent
  text and reasoning never reach a trace, summary, score or bundle protects what an agent says while playing a run, and
  is unchanged. The critic loop produces text written by other models: verdicts, change lists and revised skills. That
  text may be stored under `loops/<label>/` and nowhere else. A role's free-form text and reasoning are discarded, only
  the schema's fields are kept, and a role's failure reason is `code: fixed message`. The privacy test is extended to
  enforce both sides of the boundary.
- **2026-10-07**: [ADR-005](ADR-005-per-world-item-art.md) gives the bundle manifest one more optional field, `art`: the sprites of the
  items that appear in the run, for a viewer that has no world file (built; spec 006). It holds finished drawings and generated glyphs, never
  names from the sprite library. Readers that do not know it ignore it, and the manifest's format number does not change.
