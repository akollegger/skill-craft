# Implementation Plan: Complete the AI SDK Runtime

**Branch**: `007-ai-sdk-runtime` | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-ai-sdk-runtime/spec.md`

## Summary

Finish what ADR-006 decides on top of the spike's code. The player and the critic and reviser roles already run
through the AI SDK for Claude and Fireworks models. This feature turns the hard-coded provider pair into a
data-only **provider table**, makes a run record the model the provider reports and the cost honestly (computed,
with the unpriced runs counted and any provider-reported cost kept beside it), turns on Anthropic prompt caching,
pins thinking, effort and temperature per model, makes retries a stated, recorded setting, and then runs what the
spike did not: the critic loop end to end, a thinking model as a role under a small spend cap, a real skill load
through the `Skill` tool, cancellation without orphaned processes, and the faithful world's calibration on the
new runtime. It ends by bringing the documents in line.

Three findings from the planning probes shape the design (research.md R2, R4, R5): the trace check requires
request lines to carry the same model the result lists, so the reported model has to reach the recorder; retries
happen inside the SDK and the per-call callbacks fire once per call, so attempts are counted with a model wrapper
and not a callback; and the trace is left as it is, with retries in the score only.

No file in `src/sim/`, `src/mcp/` or `run.jsonl` changes. The provider packages stay imported in one file.

## Technical Context

**Language/Version**: TypeScript (strict, ES modules) on Node 22+

**Primary Dependencies**: `ai` 7, `@ai-sdk/mcp`, `@ai-sdk/anthropic`, `@ai-sdk/fireworks` (already added by the spike);
zod 4; `@modelcontextprotocol/sdk`. No new package: a further provider is a table entry plus its package, added
when that provider is admitted (R1)

**Storage**: files. Run folders, `summary.json` and `score.json` gain fields (contracts/run-record.md); `prices.json`
at the repository root; calibration notes under `design/notes/`

**Testing**: vitest. Scripted models from the SDK's test kit (as `test/ai-driver.test.ts` does), a scripted
player and role for the harness and loop, and live checks gated by `LIVE_SDK=1` and skipped by default, one file per
check under `test/live-*.test.ts`. No default test calls the network or a model

**Target Platform**: macOS and Linux developer machines and CI

**Project Type**: single project (library and CLI scripts)

**Performance Goals**: none new. A 40-turn Claude run reads at least 80% of its input from cache (SC-004)

**Constraints**: provider and AI SDK packages imported only in `src/harness/ai-driver.ts` (ADR-006 §2.1); no clock or
measurement in the engine, the server or `run.jsonl`; agent text and reasoning never reach a trace, summary, score,
bundle or `reason`; a `reason` is `code: fixed message`; keys only from the environment; live spend under US$10
for the checks and US$5 for the calibration rerun

**Scale/Scope**: about 12 small source changes, 5 gated live checks, 30 calibration runs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Basis |
|---|---|---|
| I. Deterministic, replayable environments | Pass | No change to the engine, the craft server or `run.jsonl`. Scoring still replays the log. Everything added is measurement outside them (FR-017) |
| II. Data-driven worlds | Pass | No world knowledge enters the runtime. The calibration rerun reads the committed faithful world as data |
| III. Discovery over disclosure | Pass | The tool surface is unchanged; the `Skill` tool returns only the skill's text. Calibration results name the world's prior fit (faithful) |
| IV. Test-first rules | Pass | Each requirement gets its test before its code (tasks order this). Live checks are gated tests with recorded results, not a substitute for the scripted tests |
| V. Simplicity | Pass | The provider table is data (one row per provider) read by existing code, not a plug-in framework. Retries are one wrapper and one count. Nothing is added that the comparison does not need |
| VI. Secrets hygiene | Pass | Keys come from the environment; a missing key ends a run with a fixed reason that names the variable and never shows a value; probes and live checks print no key (FR-018) |
| VII. Decisions before specs | Pass | ADR-006 is accepted and lists this feature as its spec |

Re-check after Phase 1: still passes. The one design tension, a table that would import provider packages and so
break ADR-006 §2.1, is avoided by holding package and factory names as data that `ai-driver.ts` imports (R1).

## Project Structure

### Documentation (this feature)

```text
specs/007-ai-sdk-runtime/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── provider-table.md    # the table's fields, admission rules and refusals
│   ├── run-record.md        # what score.json, summary.json and the report gain
│   └── cli.md               # --settings and the checks' commands
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks, not this command
```

### Source Code (repository root)

```text
src/harness/
├── providers.ts       # NEW: the provider table (data), spec parsing, reported-model normalising, setting rules
├── models.ts          # CHANGED: parseModelSpec reads the table; price lookup by spec
├── ai-driver.ts       # CHANGED: creates models from the table, cache option, retry wrapper, reported model, settings
├── ai-options.ts      # CHANGED: mapping helpers for the above (pure, tested without the SDK)
├── run.ts             # CHANGED: ModelInfo, aggregate (priced and unpriced), summary fields
├── report.ts          # CHANGED: unpriced column, settings in the summary schema
├── cli.ts             # CHANGED: --settings
└── errors.ts          # CHANGED: UnknownProvider, SettingRefused, BackendNotPinned
src/trace/
├── recorder.ts        # CHANGED: a request's model is the last one a start or usage event names
└── measure.ts         # unchanged (it already compares trace models with the result's)
spikes/fireworks/
├── probe-tools.ts, probe-schema.ts   # becomes the admission probe: one command per provider
└── reconcile.ts                      # unchanged
prices.json            # CHANGED: canonical keys; entries are optional pins. Cost sources, aliases and the quote cache: Phase 16 (not built)
test/
├── providers.test.ts          # NEW
├── ai-driver.test.ts          # EXTENDED: reported model, retries, caching option, settings
├── recorder.test.ts, privacy.test.ts, harness.test.ts   # EXTENDED
└── live-*.test.ts             # NEW gated checks (critic loop, thinking role, skill, cancel)
design/notes/runtime-recalibration.md   # NEW: the calibration rerun's results
README.md, AGENTS.md, specs/002-*/, specs/005-*/        # CHANGED: history markers
```

**Structure Decision**: the existing single-project layout. One new source file (`providers.ts`), no new directory.

## Complexity Tracking

No constitution violations.
