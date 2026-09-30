# Implementation Plan: Run Observability

**Branch**: `002-client-otel-trace` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-client-otel-trace/spec.md`; decision in
[ADR-002](../../design/adr/ADR-002-client-otel-trace.md).

## Summary

Give each harness run a measured cost. The harness starts a per-run OTLP/HTTP receiver, points the
headless `claude` child at it, and turns Claude Code's OpenTelemetry posts into a scrubbed,
numbered `trace.jsonl`. Trace and run log are joined by order, and `score.json` gains duration, token
and cost totals, plus the same figures up to the goal. A pure frame function in the simulation
library replays a run log into numbered frames, and a bundle exporter packages frames, trace and
result into a folder with no world and no personal data. Tokens and cost were verified exact against
the CLI's own totals (see [research.md](research.md)).

The design leans on three verified facts. Request tokens and timing come from the `llm_request` span
and cost from the `api_request` event, joined by `request_id`. A tool line is the `claude_code.tool`
span (name and times) joined to the `tool_result` event (arguments) by `tool_use_id`. The one
auxiliary request the CLI excludes from its totals has no `api_request` event, so "requests with both
halves" reproduces the CLI totals with no special case.

## Technical Context

**Language/Version**: TypeScript (strict, ES modules), Node 22+

**Primary Dependencies**: none new. Node's `http` for the receiver; hand-written OTLP JSON extraction
(no OpenTelemetry SDK); existing zod for the persisted shapes

**Storage**: files in the run folder: `trace.jsonl` (appended as lines complete), `score.json`
(extended); bundle folders written elsewhere

**Testing**: vitest, test first; stand-in OTLP posts derived from a real capture with invented values;
the fake `claude` child extended to post them

**Target Platform**: macOS/Linux, local; the receiver listens on `127.0.0.1` only

**Project Type**: library plus CLI scripts (existing layout)

**Performance Goals**: a trace line reaches disk within 50 ms of the post that completes it; with the
child's 250 ms export interval a step shows up within about a second of happening (SC-003)

**Constraints**: no raw post is ever written; no new field in `run.jsonl`; engine and server untouched;
the receiver must keep serving while the child runs (forces an async harness)

**Scale/Scope**: runs of tens of calls and single-digit model requests to a few hundred; posts of a few
KB; a run folder stays under a megabyte

## Constitution Check

*GATE: passes before research; re-checked after design (still passes).*

| Principle | Status |
|---|---|
| I. Deterministic, replayable | Pass. The engine, server and `run.jsonl` gain nothing. Clock values exist only in harness-side `trace.jsonl`. Frame derivation is a deterministic replay function. |
| II. Data-driven worlds | Pass. Frame derivation takes any world; nothing world-specific. |
| III. Discovery over disclosure | Pass. A bundle carries frames (what the agent saw) and no world, recipe list or item descriptions; a test searches for them. |
| IV. Test first | Applies. Receiver, allowlist filter, assembler, join, score figures, frames and export each get tests before code (tasks will order them so). |
| V. Simplicity | Pass. No collector, no SDK, no live mirror, no viewer. Hand-rolled JSON extraction of about ten attributes. |
| VI. Secrets hygiene | Pass. Personal attributes are dropped on ingest; raw posts never persisted; the child receives only the endpoint and OTel switches. No key is involved. |
| VII. Decisions before specs | Pass. ADR-002 accepted; deviations found while planning are recorded in its amendments. |

## Project Structure

### Documentation (this feature)

```text
specs/002-client-otel-trace/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── trace-jsonl.md      # per-run trace file
│   ├── score-json.md       # additions to score.json
│   ├── child-telemetry.md  # what the harness sets on the claude child, what the receiver accepts
│   └── replay-bundle.md    # bundle folder, manifest, frames, export command
├── checklists/requirements.md
└── tasks.md                # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── sim/
│   ├── frames.ts        # NEW  deriveFrames(world, goal, entries): Frame[]  (pure replay, beside score.ts)
│   └── score.ts         # EDIT RunScore gains reachedSeq (additive); no behaviour change
├── trace/               # NEW  harness-side measurement; no dependency on src/mcp
│   ├── otlp.ts          #      parse OTLP/HTTP JSON bodies -> allowlisted items (drops everything else)
│   ├── assemble.ts      #      TraceBuilder: pair halves, offset times, assign seq, flag leftovers
│   ├── receiver.ts      #      per-run 127.0.0.1 server; feeds the builder; appends trace.jsonl
│   └── measure.ts       #      join to run log; totals and to-goal figures; trace status
└── harness/
    ├── run.ts           # EDIT async spawn; start receiver; child env; measured figures in score.json
    ├── bundle.ts        # NEW  read a bundle; framesAfter(n)
    └── export.ts        # NEW  exportBundle(runDir, dest)
scripts/
├── run-agent.ts         # EDIT await the async harness; print time and tokens
└── export-run.ts        # NEW  pnpm dev scripts/export-run.ts <run-dir> <dest>
test/
├── otlp.test.ts  assemble.test.ts  receiver.test.ts  measure.test.ts  frames.test.ts
├── export.test.ts  privacy.test.ts
├── harness.test.ts      # EDIT async, plus trace cases
└── helpers/fake-claude.ts  # EDIT can post stand-in OTLP (with invented personal attributes)
    helpers/otlp.ts         # NEW builders for stand-in posts
```

**Structure Decision**: extend the existing single project. Measurement lives in a new `src/trace/`
directory that only the harness imports, so the simulation library and server stay free of
networking and clocks. Frame derivation is in `src/sim/` because it is a pure replay of the engine,
next to `score.ts` (ADR-002 amendment); the observer and the exporter will both import it.

## Complexity Tracking

No constitution violations. Two deliberate costs, both forced by facts rather than choice:

| Cost | Why needed | Simpler alternative rejected because |
|---|---|---|
| `runOnce` and `runExperiment` become async | `spawnSync` blocks the event loop, so an in-process receiver could not answer the child's posts | A separate receiver process would add process management and IPC for the same result |
| Hand-written OTLP JSON extraction | About ten attributes are needed; the JSON shape was captured from a real run | The OpenTelemetry SDK is a large dependency for reading a few fields, and would decode personal attributes we want never to touch |
