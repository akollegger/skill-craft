# AGENTS.md

Guidance for AI coding agents working in skill-craft. See [README.md](README.md) for the project
overview and [the constitution](.specify/memory/constitution.md) for the binding rules.

## What this project is

A demo of skill distillation from Neo4j Agent Memory (NAMS). A simulated crafting table serves as
the task environment; runs are recorded to NAMS, a skill is distilled, and runs with and without
it are compared. The environment's design is [ADR-001](design/adr/ADR-001-crafting-table-world.md).

The simulation implements ADR-001 (feature spec `specs/001-crafting-table-sim`). An interim run
harness runs Claude Code against it, measures each run and exports replay bundles (ADR-002, feature
spec `specs/002-client-otel-trace`). The skillcraft visualizer, a read-only page over a folder of runs, implements
ADR-004 (feature spec `specs/004-skillcraft-visualizer`). The record, distill and compare workflow is not
built yet; it waits on the player and experiment-protocol decision
(`design/notes/agent-player-options.md`). Do not add mechanics beyond ADR-001 (gathering, tool tiers,
stations, fuel were deliberately removed).

## Commands

```bash
pnpm install
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm build         # emit to dist/
pnpm build:viz     # build the visualizer's page to dist-viz/
pnpm dev:viz <folder>   # the page with hot reload over a folder of runs
pnpm dev <file>    # run a TypeScript file with tsx
```

Scripts (run with `pnpm dev`): `scripts/solve.ts` (best run for a goal), `scripts/make-world.ts`
(re-skinned world plus goals), `scripts/smoke.ts` (replay a best run over stdio),
`scripts/run-agent.ts` (Claude Code runs through the Claude Agent SDK, scored and measured; `--dry-run`
spends nothing; `--prompt-note` adds one fixed sentence to the prompt), `scripts/report.ts` (run folders to the
experiment results table), `scripts/score.ts` (score run logs against the best run) and `scripts/export-run.ts`
(export a finished run as a replay bundle), `scripts/viz.ts <folder>` (serve a folder of runs and the built page on
127.0.0.1) and `scripts/viz-export.ts <folder> <dest>` (a static copy of the same). The server runs as
`SIM_WORLD=<world.json> [SIM_RUN_LOG=<fresh file>] pnpm exec tsx src/mcp/server.ts`.

`pnpm typecheck` and `pnpm test` must pass before a change is considered done. `pnpm typecheck` checks the page's
TypeScript too; the TypeScript inside `.svelte` files is not type-checked yet (`svelte-check` does not support
TypeScript 7; see `specs/004-skillcraft-visualizer/research.md` R2).

## Stack

TypeScript (strict, ES modules) on Node 22.12+ (Vite 8 needs it), pnpm, vitest, zod, and the official MCP SDK. Import
local files with the `.js` extension (NodeNext resolution). `@types/node` is declared explicitly
in `tsconfig.json`; TypeScript 7 does not include it automatically.

The visualizer's page (`viz/`) is built with Vite: Svelte for the shell, PixiJS for the table scene, Tailwind over a
local brand palette, and bundled fonts, with its own `viz/tsconfig.json` (DOM library, bundler resolution). The data side
(`src/viz/`) uses only Node's built-ins and zod, and shares one file with the page, `src/viz/contract.ts`, which must
not import anything from Node (a test enforces it).

## Rules that matter most

These are summarized from the constitution; read it for the full text.

- **Deterministic simulation.** No randomness and no clock in the engine. Randomness is allowed
  only in world-generation tooling, from an explicit seed.
- **Data-driven worlds.** The engine knows nothing about any specific world. Swapping a world must
  never need a code change.
- **Discovery over disclosure.** Tools never reveal recipes or solutions, and error messages state
  the constraint, not the fix. Every experimental world declares its prior fit (invented, perturbed
  or faithful); a faithful world is a control.
- **Test first.** Write the test for engine rules, world validation and the renamer before the
  implementation. Every committed world must be proven solvable by a test.
- **Simplicity.** Do not add a mechanic unless it adds something to the with/without-memory
  comparison.
- **Decisions before specs.** A significant design choice needs an ADR. A change to the rules,
  world structure or tool surface updates or supersedes the ADR that decided it.

## Secrets

- API keys live in `.env` only (gitignored; names in `.env.example`). Never print, log, commit or
  pass a key as a command-line argument. Load it in a script with
  `set -a; source ./.env; set +a` and reference the variable.
- This repository's sessions are recorded to NAMS by the `nams-hooks` plugin, including tool
  inputs and outputs. Assume anything typed or printed is stored. Do not `cat` `.env`, and redact
  values when inspecting it.

## Working with NAMS

- API base: `https://memory.neo4jlabs.com/v1`. Data calls need `Authorization: Bearer <key>` and an
  `X-Workspace-Id` header. The public spec is at `/openapi.json`.
- One key, `NAMS_API_KEY`, covers recording and the skills endpoints (it needs `skills:read` and
  `skills:write` as well as the memory scopes). There is no separate skills key.
- `NAMS_WORKSPACE_ID` is the experiment workspace, never the one development sessions record to. Today
  it is the "Skill Distillation" workspace from the pilot; ADR-003 has each experiment use a fresh
  managed workspace that the experiment runner (not built yet) creates and deletes. Experiment runs keep
  the hooks off and a finished run is written to NAMS through the REST API. Development sessions
  record to a different workspace on purpose: entities extracted from our own design talk about the
  world and its goals were found in recall, which would leak solutions into an experiment run. Send the
  workspace id explicitly on every call, and never export `NAMS_WORKSPACE_ID` in a shell where a
  development session starts, because the hooks read it and would record that session into the
  experiment workspace.
- Read-only calls (GET, and `POST /v1/query` for read-only Cypher) are fine to run. Calls that
  create, review or publish skills (`POST /v1/skills/*`), create keys, or change a workspace are
  outward-facing writes: get the user's go-ahead first.

## Design workflow

1. Record decisions as ADRs in `design/adr/` with `/adr-create`; check them with `/adr-review`.
   ADRs are standalone and need no parent RFC.
2. Start features with `/speckit-specify ADR-NNN: <description>`. The `speckit-adr-gate` hook
   blocks a request that does not reference an existing ADR, and `speckit-adr-link` backlinks the
   new spec afterward.
3. Continue with `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`.
4. Do design work on a branch, not on `main`.

The ADR and hook skills are project-local copies in `.claude/skills/`, adapted from the
zebra-space project with the RFC requirement removed.

## Layout

| Path | Contents |
|---|---|
| `src/sim/` | Schema, matcher, engine, run log, solver, loader, goals, re-skinner; no MCP dependency |
| `src/mcp/server.ts` | MCP server exposing a world to an agent (`SIM_WORLD` selects the file, `SIM_RUN_LOG` the log) |
| `worlds/` | World, goals and notes JSON files (the notes file declares the world's prior fit); `worlds/README.md` explains them and credits the faithful world's inspiration; `worlds/generated/` holds re-skinned examples |
| `src/harness/` | Interim run harness (prompt, SDK options and driver, errors, the command, export, bundle reader) |
| `src/trace/` | Run measurement: recorder, trace lines, join of trace to run log; no dependency on the SDK or `src/mcp` |
| `src/sim/notes.ts` | The world notes file: prior fit, per-recipe notes and omissions; never imported by the engine or server |
| `src/viz/` | The visualizer's data side: folder scanner, catalog, bundle supply, local server, static export, commands; no SDK and no `src/mcp` |
| `viz/` | The visualizer's page (Vite, Svelte, PixiJS, Tailwind); built to `dist-viz/` (gitignored); component tests in `viz/test/` |
| `scripts/` | `solve.ts`, `make-world.ts`, `smoke.ts`, `run-agent.ts`, `report.ts`, `score.ts`, `export-run.ts`, `viz.ts`, `viz-export.ts`, `dev-viz.ts` |
| `spikes/` | Fixtures and helper scripts from exploratory spikes (the pilot's distilled skill, the REST-ingest script, the experiment workspace helpers, the faithful-world skills); not part of the product |
| `test/` | vitest suites (`test/viz/` for the visualizer's data side); `fixtures/valid` and `fixtures/invalid` hold the world fixtures |
| `design/adr/` | ADRs and index |
| `design/notes/` | Exploratory notes that may become ADRs |
| `specs/` | Spec Kit feature specs, plans and tasks |
| `.specify/` | Spec Kit config, constitution, templates, extension hooks |

## Simulation rules to keep in mind

- Worlds hold no goals. Goals live in a sibling `<world>.goals.json` that only tests, the solver
  and the generator read; the engine never does.
- A world used for an experiment declares its prior fit (constitution, Principle III). Today every
  experimental world is *invented*: a generated one from `worlds/generated/`, because
  `worlds/forge.json` keeps neutral ids on purpose and is only a base for generation. Generated goals
  omit notes, because notes name base items. Faithful and perturbed worlds (Minecraft vocabulary,
  ADR-001 amendment of 2026-10-01) are decided but not built; the generator cannot yet keep names.
- The run log has no timestamps and one process is one run. The server refuses to start on a
  `SIM_RUN_LOG` file that already has data; give each run a new path.
- Tests never use randomness. Use fixed or exhaustively enumerated sequences. `src/sim/prng.ts` is
  for world generation only.
- `run-agent.ts` costs real Claude usage. Use `--dry-run` first, keep `--runs` small, and never
  point it at `worlds/forge.json` (neutral names). Built-in tools stay removed so the agent cannot
  read world files. `--record` sends the session to NAMS; only pass it when asked. A world with no notes
  file is stamped `undeclared` in every score and summary; an experimental world carries one.
- The Claude Agent SDK is imported only in `src/harness/sdk-driver.ts`; everything else talks to the
  `AgentDriver` seam, and tests use the scripted player in `test/helpers/fake-player.ts`.
- Time, tokens and cost live in `trace.jsonl` and `score.json`, measured by the harness. Never add a clock
  or a measurement to the engine, the server or `run.jsonl`. Agent text and reasoning are never written to
  a trace, a summary or a bundle; the privacy test enforces it, so keep it passing.
- A run's `reason` is `code: fixed message`; never write a wrapped error's own text to disk.
- Scoring replays a run log on a fresh game. A log that does not replay is an error, not a score.
- `look`, `help`, `inventory` and every refusal must reveal no recipe; `test/tools-orient.test.ts`
  sweeps for leaks.

## Visualizer rules to keep in mind

- The visualizer is read-only. It never writes into a folder it reads, and `viz-export` refuses a destination inside it.
- The catalog and every bundle hold no world file, recipe list or item description; `test/viz/catalog.test.ts` and
  `test/viz/parity.test.ts` check it. Frames show the crafts a run made, which is accepted.
- The catalog carries no timestamp and no filesystem path, and a reason for a run that cannot be opened is `code: fixed
  message`, never a wrapped error's text. An address from a request is looked up in the catalog and never turned into a path.
- The page reads only `catalog.json` and `bundles/<id>/...` by relative address, so one build runs against the local
  process and a static host. At most two PixiJS scenes are alive at once (the scene pool).
- Drawing is checked by hand (see the quickstart); the scene's logic is tested through `viz/src/scene/model.ts`.

## Conventions

- Match the surrounding code's style and comment density. Comments explain why, not what.
- Do not commit `.env`, `node_modules/` or `dist/`.
- Commit messages: short imperative subject, a body that says what and why.
