---
id: ADR-002
title: Measure run time and tokens on the client with OpenTelemetry
status: accepted
created: 2026-09-30
specs: [specs/002-client-otel-trace]
---

# ADR-002: Measure run time and tokens on the client with OpenTelemetry

## 1. Context

The demo compares runs of an agent on the same goal: without help, with recalled memory, and with a
distilled skill. Scoring so far counts calls. `scoreRun` replays a run's `run.jsonl` (the log the
`craft` MCP server appends, one line per tool call, no timestamps) and reports action calls against
the best possible (`callsToGoal` is the number of action calls up to the one that first produced the goal
item). The harness writes the result to `score.json` in the run's folder. Fewer calls stand in for fewer tokens and less time, but the proxy is loose: context
grows every turn, so a run with a few extra calls can cost far more than the call count suggests, and
a skill's own text adds tokens the call count never sees. The demo needs real time and token figures.

The `craft` server cannot supply them. It sees one tool call at a time, with no view of the model
requests around it. The client sees all of it: each model request with its token usage and latency, and
each tool round trip. The memory side already works this way, since the `nams-hooks` plugin records
tool calls from client-side hooks.

Claude Code, the agent player in the interim harness, exports OpenTelemetry (OTel). It was tested on
real `claude -p` runs against a local OTLP (OpenTelemetry protocol) receiver over HTTP:

- Each `claude_code.api_request` log event carries `input_tokens`, `output_tokens`,
  `cache_read_tokens`, `cache_creation_tokens`, `cost_usd`, `duration_ms` and a `request_id`. Summed
  over a run they equal the CLI's own totals exactly.
- The `claude_code.llm_request` span adds `ttft_ms` (time to first token); `claude_code.tool.execution` spans give each tool
  call's duration (4 to 17 ms in the test); `claude_code.interaction` spans the whole run.
- `tool_use_id` is the same in spans, log events and the CLI stream. Spans carry the full tool name
  (`mcp__craft__place`); the `tool_result` event carries the arguments when `OTEL_LOG_TOOL_DETAILS=1`.
- With `OTEL_LOGS_EXPORT_INTERVAL` and `OTEL_TRACES_EXPORT_INTERVAL` at 250 ms, events arrived 30 to
  360 ms after they happened (median about 240 ms). The default interval is 5 s.
- Every log record carries the user's email, user id, account ids and organization id. Storing the raw
  posts would put personal data in `runs/`, and run folders are shared when a demo is shared.
- User-level plugin hooks were measured at about 0.2 to 0.3 s of start-up per run and no tokens, so no
  baseline isolation is needed.

The observer (see `design/notes/pixel-observer.md`) is a separate read-only process that replays a run
log on its world to draw the crafting table; a *frame* is the table state, inventory and preview after
one call. It wants time on each step and totals in the score row, live. It is meant to be shareable: people watching should be able to open a recorded run and poke
around it, and replay is enough for that.

## 2. Decision

### 2.1 Two records with separate jobs

`run.jsonl` stays as it is: what the world did, written by the server, with no clock, so a replay is
byte-identical and `scoreRun` treats it as ground truth. A new `trace.jsonl` beside it records what the
run cost: model requests, tool round trips, time and tokens. Nothing in the server, the engine or
`run.jsonl` gains a timestamp.

### 2.2 Source: Claude Code's OTel export, received by the harness

The harness starts a small OTLP/HTTP receiver on `127.0.0.1` with an ephemeral port before it spawns
`claude -p`, and sets on the child: `CLAUDE_CODE_ENABLE_TELEMETRY=1`,
`CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` (spans), `OTEL_{LOGS,TRACES,METRICS}_EXPORTER=otlp`,
`OTEL_EXPORTER_OTLP_PROTOCOL=http/json`, `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:<port>`,
`OTEL_LOG_TOOL_DETAILS=1`, and both export intervals at 250 ms. Each run has its own receiver, so a
run's posts need no routing key. (`run.id` in `OTEL_RESOURCE_ATTRIBUTES` is a standard way to add one as
a cross-check; it is untested here.) The receiver is harness code; the observer reads the resulting file
and does not host it. The player runs with `--setting-sources project` (a Claude Code flag that leaves
user settings, including the NAMS hooks, out of the run), so its exports do not depend on them.

### 2.3 Scrub on ingest; never store raw posts

The receiver keeps an allowlist and writes only allowed fields: request id, turn (the count of model
requests so far, kept by the receiver), start and end offsets, `duration_ms`, `ttft_ms`, the four token
counts, `cost_usd`, `tool_use_id`, tool name, arguments, `success`. Resource and record attributes
outside the allowlist, including email, user id, account ids and organization id, are dropped before
anything is written. Raw OTLP bodies are not persisted anywhere, including debug logs.

### 2.4 Shape of `trace.jsonl`

One JSON object per line, ordered as received, each with a `seq` (0, 1, 2, ...) and a `kind`:

- `request`: `{seq, kind, requestId, turn, startMs, endMs, ttftMs, inputTokens, outputTokens,
  cacheReadTokens, cacheCreationTokens, costUsd}`
- `tool`: `{seq, kind, toolUseId, tool, args, startMs, endMs, ok}`

Times are milliseconds from the run's first event, not wall-clock, so the file reveals nothing about
when the run happened. `seq` makes the file resumable: a consumer that has seen up to `n` asks for
lines after `n`.

### 2.5 Joining trace to log, and what the score gains

A `tool` line joins to a `run.jsonl` line by order, checked against tool name (with the `mcp__craft__`
prefix removed) and arguments. Order decides identical consecutive calls; the check catches a trace and
log that disagree. `score.json` gains, next to the call counts: `durationMs`, the four token totals,
`costUsd`, and the same figures "to goal": the sum of every `request` line whose `endMs` is at or before
the `endMs` of the tool call that first reached the goal (the call `scoreRun` reports as `callsToGoal`),
including the request that issued that call, plus every `tool` line up to it. A trace that fails to join
(different count or arguments than the log) is recorded as `trace: "mismatch"` and its figures are left
out of the score; the log's figures stand. Requests the CLI makes outside the agent loop are excluded
from the totals, as the CLI's own totals exclude them.

### 2.6 Hosted viewing is replay of exported bundles

A run is shared as a **replay bundle**: the frames the observer derives from `run.jsonl` (the bundle
holds these, not the log), each with a `seq`, plus `trace.jsonl` and `score.json`. It contains no world
file (a world lists every recipe) and no raw OTLP. Frames still show every recipe the run exercised,
since crafted outputs appear in them. A static viewer, the same page the observer serves, loads a bundle
and plays it back; the visitor can pause, scrub, and open other bundles. No ingest endpoint,
authentication or live mirror exists. Where a bundle is hosted is outside this decision. The observer's
own live mode stays local. Frame derivation is a function of the simulation library, called by export and by the observer; the wire contract between frame
source and viewer is the `seq`-numbered frame list, so a live mirror could be added later without
changing the viewer.

### 2.7 Fallback

If a player does not export OTel, the CLI's `stream-json` output with `--include-partial-messages`
gives the same token counts (deduplicated by message id, using the final usage from `message_delta`)
and tool times measured at the client. The harness writes the same `trace.jsonl` from it. It is not
built until needed.

## 3. Alternatives Considered

- **Timestamps in `run.jsonl`, stamped by the server or injected by the harness.** Rejected: the server's
  view has no model time or tokens, and any clock in the log gives up byte-identical replay.
- **Derive timing from NAMS.** `nams-hooks` records `durationMs` per tool call. Rejected: it exists only
  when the session is recorded (`--record`), which the baseline arm must not be, and it carries no
  token counts.
- **The observer hosts the OTLP receiver.** Rejected: the run would have no trace unless the observer
  is up, and `score.json` needs the totals when the run ends. The harness owns the run's lifecycle.
- **Parse `stream-json` only.** Rejected as the primary path: it gives tokens but not TTFT or tool spans,
  and needs message-id deduplication. Kept as the fallback.
- **Store the raw OTLP and filter on read.** Rejected: personal attributes on every record would be one
  copied folder away from leaking.
- **A hosted service with live ingest.** Rejected for now: the goal is letting viewers explore a
  recorded run, and bundles achieve that without authentication, resumable ingest or a running server.

### Deferred

- **OpenTelemetry Collector.** The harness receiver is the only supported path. A Collector could later
  relay to it, or be configured to write `trace.jsonl` through an allowlisting processor, without
  changing the file format. This waits until a second consumer, or a player that exports through a
  Collector, justifies running another service for a demo.

## 4. Consequences

- The score row can show duration, tokens and cost, and the leaderboard can sort by them. What single
  figure "cost" should be is still open (observer note, open question 1).
- The harness gains a receiver, an allowlisting scrubber and a joiner, each testable with fake OTLP
  posts and no real CLI. Tests come first.
- Runs of a player that is not Claude Code need their own trace source.
- Times carry a delivery lag of 30 to 360 ms in live views, which is invisible in replay; finished
  totals are exact because the CLI also flushes on exit.
- Interactive sessions and the desktop app ignore environment variables set in a shell and ignore OTLP
  variables in project settings, so they cannot be measured this way without editing the user's global
  settings. They are out of scope.
- The trace is not verifiable by replay the way the log is. It is trusted as the client reported it.
- `score.json` gains fields, so its contract changes; the harness spec owns that change, not ADR-001.
- Bundles need an export command and a viewer that runs without the observer's server. The viewer
  becomes a static page with a data loader.

## 5. Related

- Design notes: `design/notes/pixel-observer.md`, `design/notes/agent-player-options.md`
- ADRs: [ADR-001](ADR-001-crafting-table-world.md) (the run log this decision leaves untouched). The
  player choice (Claude Code, `claude -p`) is assumed here and belongs to the pending experiment-protocol ADR.
- Specs: _(populated automatically by the speckit ADR-link hook once `/speckit-specify` references this ADR)_

## 6. Amendments

- **2026-09-30**: §2.6 said "Frame derivation remains the observer's job". That misplaced ownership.
  The observer is a separate process so the agent cannot reach it and the server stays clean; that says
  nothing about who defines the frame shape. A frame is the published contract of a replay bundle, and
  the viewer has no world to derive it from, so the producer side defines it. Frame derivation is a
  pure replay function in the simulation library, beside `scoreRun`, with no server or HTTP
  dependency. Bundle export and the observer's live mode both call it. Spec
  `002-client-otel-trace` builds it with bundle export. The bundle's contents and the `seq`-numbered
  frame contract are unchanged.
- **2026-09-30** (found while planning spec `002-client-otel-trace`):
  - §2.2 sets all three exporters to `otlp`. The harness sets `OTEL_METRICS_EXPORTER=none`, since
    nothing reads metrics and they carry the same personal attributes; the receiver also discards
    `/v1/metrics` unread.
  - §2.4 offsets are measured from the `user_prompt` log event, so start-up before the agent loop is
    excluded. Total duration is the `claude_code.interaction` span's duration when known.
  - §2.5 "requests the CLI makes outside the agent loop are excluded" is implemented by pairing: a
    request line needs both its `llm_request` span and its `api_request` event, and the excluded
    auxiliary request has no event.
  - The harness becomes asynchronous (`spawn` in place of `spawnSync`) so the receiver can answer while
    the child runs.
