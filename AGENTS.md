# AGENTS.md

Guidance for AI coding agents working in skill-craft. See [README.md](README.md) for the project
overview and [the constitution](.specify/memory/constitution.md) for the binding rules.

## What this project is

A demo of skill distillation from Neo4j Agent Memory (NAMS). A simulated crafting table serves as
the task environment; runs are recorded to NAMS, a skill is distilled, and runs with and without
it are compared. The environment's design is [ADR-001](design/adr/ADR-001-crafting-table-world.md).

The simulation implements ADR-001 (feature spec `specs/001-crafting-table-sim`). The experiment
harness and the record, distill and compare workflow are not built yet; they wait on the player
and experiment-protocol decision (`design/notes/agent-player-options.md`). Do not add mechanics
beyond ADR-001 (gathering, tool tiers, stations, fuel were deliberately removed).

## Commands

```bash
pnpm install
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm build         # emit to dist/
pnpm dev <file>    # run a TypeScript file with tsx
```

Scripts (run with `pnpm dev`): `scripts/solve.ts` (best run for a goal), `scripts/make-world.ts`
(re-skinned world plus goals), `scripts/smoke.ts` (replay a best run over stdio). The server runs as
`SIM_WORLD=<world.json> [SIM_RUN_LOG=<fresh file>] pnpm exec tsx src/mcp/server.ts`.

`pnpm typecheck` and `pnpm test` must pass before a change is considered done.

## Stack

TypeScript (strict, ES modules) on Node 22+, pnpm, vitest, zod, and the official MCP SDK. Import
local files with the `.js` extension (NodeNext resolution). `@types/node` is declared explicitly
in `tsconfig.json`; TypeScript 7 does not include it automatically.

## Rules that matter most

These are summarized from the constitution; read it for the full text.

- **Deterministic simulation.** No randomness and no clock in the engine. Randomness is allowed
  only in world-generation tooling, from an explicit seed.
- **Data-driven worlds.** The engine knows nothing about any specific world. Swapping a world must
  never need a code change.
- **Discovery over disclosure.** Tools never reveal recipes or solutions, and error messages state
  the constraint, not the fix. Experimental worlds use invented names.
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
- Skills endpoints need a key with `skills:read` and `skills:write` (`NAMS_SKILLS_KEY`).
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
| `worlds/` | World and goals JSON files; `worlds/generated/` holds re-skinned examples |
| `scripts/` | `solve.ts`, `make-world.ts`, `smoke.ts` |
| `test/` | vitest suites; `fixtures/valid` and `fixtures/invalid` hold the world fixtures |
| `design/adr/` | ADRs and index |
| `design/notes/` | Exploratory notes that may become ADRs |
| `specs/` | Spec Kit feature specs, plans and tasks |
| `.specify/` | Spec Kit config, constitution, templates, extension hooks |

## Simulation rules to keep in mind

- Worlds hold no goals. Goals live in a sibling `<world>.goals.json` that only tests, the solver
  and the generator read; the engine never does.
- A world used for an experiment must be a generated one (invented names). `worlds/forge.json` keeps
  neutral ids on purpose and is only a base for generation. Generated goals omit notes, because
  notes name base items.
- The run log has no timestamps and one process is one run. The server refuses to start on a
  `SIM_RUN_LOG` file that already has data; give each run a new path.
- Tests never use randomness. Use fixed or exhaustively enumerated sequences. `src/sim/prng.ts` is
  for world generation only.
- `look`, `help`, `inventory` and every refusal must reveal no recipe; `test/tools-orient.test.ts`
  sweeps for leaks.

## Conventions

- Match the surrounding code's style and comment density. Comments explain why, not what.
- Do not commit `.env`, `node_modules/` or `dist/`.
- Commit messages: short imperative subject, a body that says what and why.
