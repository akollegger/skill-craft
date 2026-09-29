# Implementation Plan: Crafting-Table Simulation

**Branch**: `001-crafting-table-sim` | **Date**: 2026-09-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-crafting-table-sim/spec.md`

## Summary

Replace the first-iteration simulation (gathering, tool tiers, stations, fuel) with the
grid-based crafting table decided in [ADR-001](../../design/adr/ADR-001-crafting-table-world.md):
a world of a table grid, a finite stock, and shapeless or shaped recipes, exposed to an agent as
seven single-purpose tools. Around that core the feature delivers a world-file validator, an exact
solver that produces the best run for a goal, a seeded world re-skinner, and an ordered run log.

Technical approach: keep the current stack (strict TypeScript, zod, the MCP SDK over stdio, vitest).
Recipe matching is a constant-time lookup on canonical keys built at load time, so conflicts between
recipes are detected by key collision. The solver is a search over inventory states, since the
table is always empty between crafts. The run log is a JSONL file written by the server process
to a path the experiment runner owns; the server refuses to start if that file already has content,
so a restart cannot silently mix two runs. Most of the existing code is rewritten; the loader, renamer,
scripts and test scaffolding are adapted. See [research.md](research.md) for the decisions.

## Technical Context

**Language/Version**: TypeScript 7 (strict, ES modules, NodeNext) on Node 22+

**Primary Dependencies**: `zod` (world schema), `@modelcontextprotocol/sdk` (stdio server); no new
dependencies

**Storage**: Files only: world definitions and goal files (JSON), and an append-only JSONL run log

**Testing**: vitest. Unit tests per module, contract tests for the tool surface over the SDK's
in-memory transport, and a stdio smoke script. Tests use fixed or exhaustively enumerated call sequences,
never randomness.

**Target Platform**: macOS and Linux developer machines running Node 22+; the server runs as a
child process of an agent harness

**Project Type**: Single library-plus-CLI project (simulation core, one MCP server, small scripts)

**Performance Goals**: The best-run calculation finishes in under 10 s for every committed world
(SC-008). Tool calls answer in single-digit milliseconds.

**Constraints**: Fully deterministic (no randomness or clock in the engine); no recipe or solution
in any tool output; one server process is one run, and the server refuses to start on a run-log
path that already holds data; world size capped so the exhaustive solver stays tractable (limits in
[research.md](research.md), Decision 1)

**Scale/Scope**: Worlds of up to 30 items, 40 recipes, a 6x6 table and 120 stock units; about 10
valid and 10 invalid test worlds; one committed base world with its goals

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| I. Deterministic, Replayable Environments | Pass. The engine and matcher use no randomness or clock; the run log records no timestamps. Randomness appears only in the seeded re-skinner. |
| II. Data-Driven Worlds | Pass. Table size, stock, items, recipes and hint level come from a validated world file; no world-specific code. |
| III. Discovery Over Disclosure | Pass. `help`, `inventory`, `look` and every refusal are specified to carry no recipe information; a test sweeps outputs for leaks (SC-006). |
| IV. Test-First Rules | Pass. The task order writes tests before each module; every committed world is checked solvable in the suite. |
| V. Simplicity | Pass. No new dependencies; the old mechanics are deleted, not kept behind flags. The one addition beyond the ADR is a `cell_empty` refusal. |
| VI. Secrets Hygiene | Pass. The feature handles no credentials. The run-log path comes from an environment variable, never a key. |
| VII. Decisions Before Specs | Pass. The spec derives from ADR-001. The player and experiment protocol are deferred to a later ADR and are out of scope. |

Post-design re-check (after Phase 1): no violations; see Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-crafting-table-sim/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── tools.md         #   agent-facing tool contract
│   ├── world-format.md  #   world and goals file format
│   ├── run-log.md       #   run log record format
│   └── solver-cli.md    #   best-run and world-generation commands
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
src/
├── sim/
│   ├── schema.ts        # zod schema and types for worlds and recipes        (rewrite)
│   ├── errors.ts        # WorldError carrying every validation problem       (new)
│   ├── prng.ts          # seeded PRNG for world generation only              (kept from rename.ts)
│   ├── goals.ts         # goals file schema and loader                       (new)
│   ├── limits.ts        # size limits and solver budget, one place          (new)
│   ├── loader.ts        # parse, normalize, validate a world                 (adapt world-loader.ts)
│   ├── matcher.ts       # canonical keys, exact match, partial-match check   (new)
│   ├── engine.ts        # Game: inventory, table, place/remove/clear/craft   (rewrite)
│   ├── runlog.ts        # ordered call log, optional JSONL sink              (new)
│   ├── solver.ts        # best run: min crafts, min calls, slack, call plan  (replaces plan.ts)
│   └── rename.ts        # seeded re-skin and perturbation                    (adapt)
└── mcp/
    └── server.ts        # seven tools over stdio; reads SIM_WORLD, SIM_RUN_LOG (rewrite)

scripts/
├── make-world.ts        # generate a re-skinned world and its goals          (adapt)
├── solve.ts             # print the best run for a world and goal            (new)
└── smoke.ts             # spawn the server over stdio and replay a best run  (rewrite)

worlds/
├── forge.json           # base world                                         (new; replaces ember-forge.json)
├── forge.goals.json     # its intended goals                                 (new)
└── generated/           # regenerated examples

test/
├── prng.test.ts     schema.test.ts   matcher.test.ts  loader.test.ts  goals.test.ts
├── engine-craft.test.ts  engine-stock.test.ts  hints.test.ts  runlog.test.ts
├── tools-craft.test.ts   tools-table.test.ts   tools-orient.test.ts  server-worlds.test.ts
├── solver.test.ts   rename.test.ts  worlds.test.ts  scripts.test.ts  determinism.test.ts
├── helpers/         # makeWorld, gridOf
└── fixtures/
    ├── valid/       # ten distinct valid worlds (SC-004)
    └── invalid/     # broken worlds, each with its expected problem (SC-005); includes an
                     # unobtainable-input cycle
```

**Structure Decision**: Keep the existing single-project layout (`src/sim` for the core,
`src/mcp` for the server). The core has no dependency on the MCP SDK, so the engine, solver and
loader are testable and reusable by any player harness. New files are split by responsibility:
matching, logging and limits are separate so each can be specified by its own tests first.

## Complexity Tracking

No constitution violations to justify.

Two choices add code beyond the minimum and are recorded so they are deliberate:

| Choice | Why needed | Simpler alternative rejected because |
|---|---|---|
| Constant-time matching by canonical keys (`matcher.ts`) | Load-time conflict detection (FR-016) falls out of key collision, and the solver and engine share one definition of a match | Re-scanning every recipe per call would need a second, separate conflict checker that could disagree with the matcher |
| Exact solver with a state budget (`solver.ts`) | SC-002 and SC-008 need true minima and a slack figure, and the budget doubles as the enforceable world-size limit (FR-019) | A heuristic planner cannot prove minimality, so it cannot serve as the scoring yardstick |
