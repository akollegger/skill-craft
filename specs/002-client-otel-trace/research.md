# Research: Run Observability

Facts come from captures of real `claude -p` runs (Claude Code 2.1.285, OTLP/HTTP JSON, export interval
250 ms) against a local sink, plus the CLI's own `--output-format json` totals. Personal attributes
were seen on every record and are never quoted here.

## D1. Which events and spans carry what

- **Decision**: build each **request** line from two records joined on `request_id`, and each **tool**
  line from two records joined on `tool_use_id`.

  | Line | Half A | Half B |
  |---|---|---|
  | request | span `claude_code.llm_request`: start and end times, `ttft_ms`, the four token counts, `request_id`, `query_source_safe` | log event `api_request`: `cost_usd`, `request_id`, `query_source`, same tokens |
  | tool | span `claude_code.tool`: `tool_name` (`mcp__craft__place`), `tool_use_id`, start and end times | log event `tool_result`: `tool_input` (JSON text), `success`, `tool_use_id`, `duration_ms` |

- **Rationale**: no single record has everything. The `api_request` event has cost but no start time
  or time to first token, and the span has those but no cost; the tool span has the full name but not the arguments, and the event's
  `tool_name` is the placeholder `mcp_tool`. Both halves of each pair arrived in every capture.
- **Alternatives considered**: the CLI's `stream-json` (no spans, needs de-duplication; kept as the
  fallback per ADR-002); the `tool_decision` event (no timing).

## D2. The auxiliary request

- **Decision**: a request line is emitted only when both its span and its `api_request` event have
  arrived. A span with no event is dropped when the run ends.
- **Rationale**: in the capture, five `llm_request` spans exist but only four `api_request` events; the
  fifth has `query_source_safe=agent_classifier`. The four events sum to the CLI totals exactly
  (222 output tokens; cost matches to the digit), so the fifth is what the CLI excludes. Pairing
  needs no filter list and holds if other auxiliary sources appear.
- **Alternatives considered**: filter on `query_source == "sdk"` (a list to maintain; the pairing rule is
  data-backed and simpler).

## D3. Time base and totals

- **Decision**: offsets are milliseconds from the `user_prompt` log event's time (the agent loop
  starts there). Total duration is the `claude_code.interaction` span's duration when it has arrived,
  otherwise the largest `endMs` in the trace. Start-up (about 1.1 s to connect the MCP server, 0.2 s of
  hooks) is before `t=0` and excluded.
- **Rationale**: `user_prompt` arrives immediately, so live views have `t0` at once; the interaction
  span only exists at the end. Excluding start-up compares runs on the work the agent did, and the
  interaction span matches the CLI's `duration_ms` (7841 vs 7833 ms).
- **Alternatives considered**: offset from the first record of any kind (includes start-up noise);
  wall-clock times (leak when a run happened, break the "nothing about when" rule in ADR-002).

## D4. Order and the join

- **Decision**: `seq` follows completion order (when a line's second half arrives). The join sorts tool
  lines by `startMs` (then `seq`) and pairs the k-th with the k-th run-log entry, then checks tool name
  and arguments. Any difference, or a different count, is a mismatch.
- **Rationale**: the agent calls tools one at a time, so start order is call order and the run log
  (written by the server in call order) has the same order. The check catches lost or altered records.
- **Alternatives considered**: join by arguments alone (breaks on repeated calls); join by time
  (the server has no clock).

## D5. The goal-reaching call

- **Decision**: `scoreRun` records the run-log `seq` of the entry after which the goal is first held
  (`reachedSeq`, 0 if held at the start, null if never). "To goal" figures sum requests with
  `endMs <=` the `endMs` of the tool line paired with that entry, and that line's offset as the
  duration; `reachedSeq` 0 gives zeros.
- **Rationale**: `scoreRun` already finds that moment for `callsToGoal`; reusing it keeps one
  definition of "reached". The request that issued the call ends before the tool starts, so it is
  included by the rule.

## D6. Metrics export off

- **Decision**: set `OTEL_METRICS_EXPORTER=none` on the child; the receiver still answers `/v1/metrics`
  with 200 and discards it unread, in case a CLI version ignores the switch.
- **Rationale**: nothing here reads metrics, and they carry the same personal attributes. ADR-002 §2.2
  lists all three exporters as `otlp`; this is recorded as an amendment. `none` is the standard
  OpenTelemetry value; it is confirmed by the first real run in the quickstart.

## D7. An async harness

- **Decision**: replace `spawnSync` with `spawn`, awaiting exit, and run the receiver in the same
  process. Experiments still run their runs one after another.
- **Rationale**: `spawnSync` blocks the event loop, so the receiver could not accept posts. Sequential
  runs keep the harness simple and give each run its own port and folder (FR-002).

## D8. What a bundle holds, and what "exercised" means

- **Decision**: a bundle holds a manifest (world name and grid size, goal, best-possible figures, label,
  how the run ended), `frames.jsonl`, `trace.jsonl`, and a reduced result (`ended`, `turns`, the score,
  the measured figures). The agent's final message (`text` in the run's `score.json`) is left out. A
  frame carries the table, the held items (item ids and counts), the preview (`craftable`, `partial`)
  and running counts. No recipe, no item description, no world file.
- **Rationale**: the agent's closing words can restate reasoning, and a bundle is meant to be shared.
  Item ids appear only as the run met them (placed, held, crafted, or named in a preview), which is
  what "exercised" means in FR-016; nothing lists a recipe's inputs. A test searches bundles for the
  world file's name, item descriptions and recipe records.
- **Alternatives considered**: include the agent's text (privacy and reasoning exposure); include the
  world's item list for legends (leaks unmet items).

## D9. Bundle atomicity

- **Decision**: write into a temporary sibling folder, then rename to the destination; a failure
  removes the temporary folder. An existing destination is refused before any work.
- **Rationale**: FR-019 forbids partial bundles, and rename is atomic on one volume.

## D10. Frame derivation

- **Decision**: `deriveFrames(world, goal, entries)` returns a start frame (`seq` 0, tool `start`) and one
  frame per log entry, each with the table, `craftable`, optional `partial`, held items, running action
  and refusal counts and a `reached` flag. It uses the same replay as `scoreRun` and throws
  `ReplayError` on a log that does not replay.
- **Rationale**: the observer mock's `framesFor` already has this shape and was checked on a real
  recording; moving it into `src/sim/` under tests makes the frame the tested contract.
