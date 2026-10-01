# Implementation Plan: Faithful Minecraft-Inspired World and Its Experiments

**Branch**: `003-faithful-minecraft-world` | **Date**: 2026-10-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-faithful-minecraft-world/spec.md`

## Summary

Add a small faithful world as data (a pickaxe family with decoys), a sibling notes file that declares its
prior fit and records where each recipe comes from, and an invented counterpart derived with the existing
renamer. Add three small pieces of tooling the experiments need and the repository lacks: a fixed prompt
note for the pointed-skill arm, the world's prior fit in every run's summary, and a report script that
turns run folders into the table the spec asks for. The experiments themselves run by a documented manual
procedure, using the harness, the skill installer and the REST-ingest spike that already exist. No engine,
server or tool-surface change.

## Technical Context

**Language/Version**: TypeScript (strict, ES modules) on Node 22+ (CI runs 22 and 24)

**Primary Dependencies**: zod, `@modelcontextprotocol/sdk`, `@anthropic-ai/claude-agent-sdk` (pinned,
imported only in `src/harness/sdk-driver.ts`); no new dependency

**Storage**: JSON files in `worlds/`, run folders under `runs/` (gitignored), results note in `design/notes/`

**Testing**: vitest; the existing `test/worlds.test.ts` already solves and replays every committed world

**Target Platform**: macOS and Linux developer machines and CI

**Project Type**: single project (library, MCP server and CLI scripts)

**Performance Goals**: each goal solves in under 10 s (existing check); the world stays well inside the
solver's state budget

**Constraints**: world limits in `src/sim/limits.ts` (30 items, 40 recipes, 36 cells, 120 stock units);
shaped matching is translation-only, so only symmetric or non-mirrored recipes can be included; the world
schema rejects unknown fields; the engine reads no goals and no notes

**Scale/Scope**: one world of 13 items and 10 recipes, one counterpart, about 120 agent runs in the
experiments (see research R9)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Basis |
|---|---|---|
| I. Deterministic, replayable environments | Pass | The world is data. The counterpart comes from the seeded renamer. Regenerating gives identical files (tested). No clock or randomness enters the engine |
| II. Data-driven worlds | Pass | No code path knows this world. The prior fit and recipe notes live in a sibling file the engine and server never read |
| III. Discovery over disclosure (v1.1.1) | Pass | Descriptions are category-only. The orientation tools and refusals are swept for leaks on this world. The attribution text lives in documentation and a test proves it is absent from everything the agent receives. The world declares its prior fit |
| IV. Test first | Pass | Tests for the notes file, the world's properties, the counterpart, the prompt note and the report are written before the code and data they check |
| V. Simplicity | Pass | No mechanic is added. The only new code is a notes loader, a prompt option, a summary field and a report script, each needed to state a result the spec requires |
| VI. Secrets hygiene | Pass | The manual NAMS steps read `.env` through the shell and never print values; `NAMS_WORKSPACE_ID` is never exported where a development session starts |
| VII. Decisions before specs | Pass | ADR-003 is accepted; the world-prior-fit amendments to the constitution, ADR-001 and ADR-003 are merged |

The check holds after Phase 1 design.

## Project Structure

### Documentation (this feature)

```text
specs/003-faithful-minecraft-world/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── world-notes.md
│   ├── experiment-summary.md
│   └── report.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks, not created here
```

### Source Code (repository root)

```text
worlds/
├── minecraft-inspired.json              # the faithful world
├── minecraft-inspired.goals.json        # two learn goals, one held-out goal
├── minecraft-inspired.notes.json        # prior fit, per-recipe notes, omissions
├── README.md                            # attribution and what the files mean
└── generated/
    ├── minecraft-inspired-7.json        # invented counterpart (seed 7)
    ├── minecraft-inspired-7.goals.json
    ├── minecraft-inspired-7.notes.json
    ├── forge-7.notes.json               # backfilled: invented
    └── forge-8-perturbed.notes.json     # backfilled: invented

src/sim/notes.ts                         # notes schema and loader; no MCP or SDK dependency
src/harness/run.ts, cli.ts               # --prompt-note; prior fit and note in summary and score
scripts/make-world.ts                    # also writes the notes file of a generated world
scripts/report.ts                        # run folders to the results table

test/
├── notes.test.ts                        # schema, coverage, no version strings
├── minecraft-world.test.ts              # slack, family shape, leak sweep, attribution absent
├── counterpart.test.ts                  # same structure, no Minecraft names, regenerates identically
├── prompt-note.test.ts                  # the note reaches prompt.txt and the agent, and only then
└── report.test.ts                       # table, ceiling flag, claimable flag, manual-step listing

design/notes/faithful-control-results.md # written when the experiments have run
```

**Structure Decision**: single project. Everything new is data, tests, one small module in `src/sim`
that nothing in the engine imports, a prompt option and summary fields in the harness, and one script.

## Complexity Tracking

No constitution violations.
