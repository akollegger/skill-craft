# Implementation Plan: Run Observability

**Branch**: `002-client-otel-trace` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-client-otel-trace/spec.md`; decision in
[ADR-002](../../design/adr/ADR-002-client-otel-trace.md) (amended 2026-09-30: the trace source is the
Claude Agent SDK, chosen after a spike, see [research.md](research.md) D1).

## Summary

Give each harness run a measured cost. The harness stops spawning `claude -p` and runs the player through
the Claude Agent SDK in its own process. A recorder turns the SDK's streamed messages and tool hooks
into a scrubbed, numbered `trace.jsonl`. Trace and run log are joined by order, and `score.json` gains
duration, token and cost totals, plus duration and tokens up to the goal. A pure frame function in the
simulation library replays a run log into numbered frames, and a bundle exporter packages frames, trace
and result into a folder with no world and no personal data.

The spike ran one real 20-request run through the SDK with OTel export on, as ground truth: tokens,
time to first token, tool arguments and duration matched, the SDK stream carried none of the five
personal identifiers the OTel posts carry on every record, and only per-request cost is unavailable.
That removes the receiver, the OTLP parsing, the request and tool pairing, and the asynchronous
subprocess rewrite from the earlier plan.

## Technical Context

**Language/Version**: TypeScript (strict, ES modules), Node 22+

**Primary Dependencies**: one new: `@anthropic-ai/claude-agent-sdk`, pinned to an exact version
(0.3.285 in the spike; pre-1.0). `zod` and `@modelcontextprotocol/sdk`, which the SDK also uses, are
already present

**Storage**: files in the run folder: `trace.jsonl` (appended as lines complete), `score.json`
(extended); bundle folders written elsewhere

**Testing**: vitest, test first. A driver seam lets tests supply a scripted player that emits
SDK-shaped messages and hook calls with invented personal attributes; one env-gated live check and the
quickstart cover the real SDK

**Target Platform**: macOS/Linux, local

**Project Type**: library plus CLI scripts (existing layout)

**Performance Goals**: a trace line is on disk within 50 ms of the message that completes it, so a step
shows within about a second (SC-003)

**Constraints**: no raw message, agent text or reasoning is ever written; no new field in `run.jsonl`;
engine and server untouched; the SDK is imported in exactly one file

**Scale/Scope**: runs of tens of calls and single-digit to a few dozen model requests; a run folder stays
under a megabyte

## Constitution Check

*GATE: passes before research; re-checked after design (still passes).*

| Principle | Status |
|---|---|
| I. Deterministic, replayable | Pass. The engine, server and `run.jsonl` gain nothing. Time exists only in harness-side `trace.jsonl`, read from an injected clock so tests are deterministic. Frame derivation is a deterministic replay. |
| II. Data-driven worlds | Pass. Frame derivation takes any world. |
| III. Discovery over disclosure | Pass. A bundle carries frames (what the agent saw) and no world, recipe list, item descriptions or agent text; a test searches for them. |
| IV. Test first | Applies. Recorder, allowlist, join, score figures, frames and export each get tests before code; tasks order them so. |
| V. Simplicity | Pass, and improved by the amendment: no receiver, no parser, no pairing. One new dependency, behind a seam. |
| VI. Secrets hygiene | Pass. Only allowlisted fields are kept; the SDK inherits the login and no key is handled or logged. |
| VII. Decisions before specs | Pass. ADR-002 accepted and amended; the amendment records the source change. |

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
│   ├── player-driver.md    # the driver seam, SDK options, what the recorder reads
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
├── trace/               # NEW  harness-side measurement; no dependency on src/mcp or the SDK
│   ├── lines.ts         #      TraceLine types and the reader for trace.jsonl
│   ├── recorder.ts      #      TraceRecorder: SDK-shaped messages and tool hooks -> numbered lines
│   └── measure.ts       #      join to run log; totals and to-goal figures; cross-check; trace status
└── harness/
    ├── driver.ts        # NEW  AgentDriver seam (types only) and PlayerResult
    ├── sdk-options.ts   # NEW  pure: SDK options builder and result classification (type-only SDK imports)
    ├── sdk-driver.ts    # NEW  the only runtime importer of the SDK: the query() loop and hooks
    ├── run.ts           # EDIT drop CLI args/parsing; async runOnce via a driver, default loaded lazily
    ├── errors.ts        # NEW  HarnessError and its codes: RunFolderExists, UnknownGoalItem, ReplayFailed, DriverFailed, RunTimedOut
    ├── bundle.ts        # NEW  read a bundle; framesAfter(n)
    └── export.ts        # NEW  exportBundle(runDir, dest)
scripts/
├── run-agent.ts         # EDIT await async harness; print time and tokens; drop --claude
└── export-run.ts        # NEW  pnpm dev scripts/export-run.ts <run-dir> <dest>
test/
├── trace-lines.test.ts  recorder.test.ts  measure.test.ts  sdk-options.test.ts  frames.test.ts
├── export.test.ts  privacy.test.ts  live-sdk.test.ts   # live-sdk runs only with LIVE_SDK=1
├── harness.test.ts      # EDIT drive through the seam; budget error after result; trace cases
└── helpers/fake-player.ts  # NEW scripted driver; replaces helpers/fake-claude.ts (CLI stand-in)
```

**Structure Decision**: extend the existing single project. Measurement lives in `src/trace/`, which
only the harness imports, so the simulation library and server stay free of clocks and networking.
The SDK is confined to `sdk-driver.ts` behind the `AgentDriver` seam (`sdk-options.ts` is pure and imports only types), so the recorder, join and export
are tested without it and a different player could be added by writing another driver. Frame
derivation is in `src/sim/` beside `score.ts` (ADR-002 amendment); the observer and the exporter will
both import it.

## Complexity Tracking

No constitution violations. One deliberate cost:

| Cost | Why needed | Simpler alternative rejected because |
|---|---|---|
| A pre-1.0 dependency that bundles the Claude Code binary (about 5 MB) | The SDK gives exact tokens, time to first token, tool timing and no personal identifiers, in-process | The OTel route needs a receiver, an OTLP parser, an async subprocess rewrite and a scrubber for identifiers on every record, for the one extra figure (per-request cost) |
