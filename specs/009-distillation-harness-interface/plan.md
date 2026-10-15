# Implementation Plan: The Distillation Harness Interface

**Branch**: `009-distillation-harness-interface` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/009-distillation-harness-interface/spec.md`

## Summary

Replace the hardwired pipeline (`scripts/critic-loop.ts` calling `obtainCandidate` and then `runLoop`) with a harness interface, as ADR-008
decides. A harness is a named process that opens a session, records finished runs, distills a skill set from run ids the experiment names,
describes itself and closes. The plan has seven parts: (1) `src/distill/`: the interface, the refusal codes, a registry of harness names, and
the two data contracts as zod definitions that generate committed JSON Schema files under `schemas/`, with a drift test and a property-list
test that holds the no-oracle rule as data; (2) the `nams-reviewed` harness, an adapter over the existing `src/loop/` internals
(`obtainCandidate` split into open, record, distill and close; `runLoop` as the review inside `distill`), with no behaviour change;
(3) the `bespoke-one-shot` harness, one tool-less `RoleDriver` call, with a new `distiller` prompt kind (the fifth under ADR-007);
(4) `scripts/distill.ts` and `src/distill/cli.ts`, which replace `scripts/critic-loop.ts`; (5) a provenance record and a cast shape that
name the harness, and the report reading them (the report stops requiring `review.json`); (6) the ADR-003 amendments, ADR-008's acceptance and
the guidance and glossary; (7) the optional live comparison of the two harnesses on Fable's `wooden_stool` recordings.

Three design choices come from reading the code (research.md R1, R3, R8). `src/loop/` stays where it is as the internals of one harness,
and the harness adapter wraps it, so the existing loop tests keep covering it. The report finds a distillation's record through a new
`distillation.record` field of the experiment summary (a legacy `review.json` that names a loop path is still read, with no verdict
enforced). Process versions become per harness.

No file in `src/sim/`, `src/mcp/` or `run.jsonl` changes. The AI SDK stays imported in one file.

## Technical Context

**Language/Version**: TypeScript (strict, ES modules) on Node 22+

**Primary Dependencies**: no new package. zod 4.6 (already used everywhere) generates the JSON Schema with `z.toJSONSchema`; the AI SDK
stays behind `RoleDriver` in `src/harness/ai-driver.ts`

**Storage**: files. `schemas/run-record.v1.json` and `schemas/skill-set.v1.json` committed at the repository root; a distillation writes
`distills/<label>/` (gitignored) with the skill set, the sidecar and the provenance record; the experiment summary gains `cast.harness` and
`distillation`; earlier `loops/<label>/` folders stay readable

**Testing**: vitest, with the scripted role (`test/helpers/fake-role.ts`), the scripted memory service (`test/helpers/fake-nams.ts`) and a
scripted harness defined in the tests as a test double. No default test calls the network or a model; the live comparison is gated like the
other live checks

**Target Platform**: macOS and Linux developer machines and CI

**Project Type**: single TypeScript project (library plus scripts)

**Performance Goals**: none

**Constraints**: no change to `src/sim/`, `src/mcp/` or `run.jsonl`; `nams-reviewed` behaves as the pipeline it wraps (same skill, same
rounds, same recorded runs for the same scripted input); a run record holds no field in the no-oracle list; no model text in any
provenance record; earlier loop folders and casts keep reading

**Scale/Scope**: two schemas, two harnesses, one command, one prompt kind; the live comparison is 2 harnesses x several generations (3 each by
default) x 2 students x 5 trials, about 60 student runs on `wooden_stool` plus 6 distillations

## Constitution Check

| Principle | Status |
|---|---|
| I. Deterministic, replayable environments | Pass. Nothing in the engine or run log changes; a run record is built from a replayed run, so its outputs are regenerated, not recorded |
| II. Data-driven worlds | Pass. A harness never receives a world or goals file; the contract has none |
| III. Discovery over disclosure | Pass. The run record and every harness prompt carry no score, solver path or goal role; tests sweep the property list and the prompts. The bespoke harness's instructions are neutral wording about the recordings (version 1 names no world or finding) |
| IV. Test-first rules | Pass. Every task lists its test first; the schema drift test and the property-list test come before the schemas |
| V. Simplicity | Pass. No world mechanic is added. The interface has four operations, two contracts and two implementations; `src/loop/` is reused, not rewritten, and the subprocess adapter, several-skill output and streaming are left out |
| VI. Secrets hygiene | Pass. A harness reads its key from the environment only, never an argument; `nams-reviewed` keeps the workspace guard and the explicit workspace option |
| VII. Decisions before specs | Pass once ADR-008 is accepted; T001 sets it `accepted`, and the ADR-003 amendment lands with the feature |

Re-check after design: unchanged. No violation to justify.

## Project Structure

### Documentation (this feature)

```text
specs/009-distillation-harness-interface/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── harness-interface.md
│   ├── run-record.md
│   ├── skill-set.md
│   ├── provenance-record.md
│   ├── cast-and-report.md
│   └── cli.md
└── tasks.md              # /speckit-tasks
```

### Source (repository root)

```text
schemas/
├── run-record.v1.json                    # generated from src/distill/schemas.ts; committed
└── skill-set.v1.json
prompts/distiller/                        # v1.txt, CHANGELOG.md: the bespoke harness's instructions
src/distill/                              # new; no SDK import
├── harness.ts                            # Harness, Session, DistillRequest, DistillResult, Refusal, the refusal codes
├── schemas.ts                            # zod: RunRecord, SkillSet, Provenance; JSON Schema generation
├── run-record.ts                         # Recording -> RunRecord (replay already regenerates outputs)
├── skill-set.ts                          # write a skill set as a root folder plus sidecar; read one back
├── provenance.ts                         # the provenance record, the legacy loop record read as nams-reviewed
├── registry.ts                           # name -> constructor table
├── harnesses/nams-reviewed.ts            # adapter over src/loop (candidate step split into open/record/distill/close; runLoop inside distill)
├── harnesses/bespoke-one-shot.ts         # one RoleDriver call
└── cli.ts                                # runDistillCli
scripts/distill.ts                        # replaces scripts/critic-loop.ts
scripts/schemas.ts                        # writes schemas/*.json from the zod definitions
src/prompts/index.ts, set.ts              # the distiller kind and its pin in the prompt set
src/loop/                                 # stays as the internals of nams-reviewed; process.ts keeps the changelog check per harness
src/harness/report.ts                     # cast.harness, distillation.record, provenance printing, no review.json requirement
test/                                     # distill-schemas.test.ts, distill-lifecycle.test.ts, distill-nams-reviewed.test.ts, distill-bespoke.test.ts, distill-cli.test.ts, plus report, prompts and loop test updates
design/adr/ADR-003-experiment-protocol.md, ADR-008-*.md, README.md; AGENTS.md; design/notes/skill-process.md
```

**Structure Decision**: a new `src/distill/` owns the contract and the command; `src/loop/` is kept whole as the internals of
`nams-reviewed` so the existing candidate, loop, record and rubric tests keep their coverage, and moving those files is not part of this
feature. Nothing under `src/distill/` imports the AI SDK; roles run through `RoleDriver`.

## Complexity Tracking

None.
