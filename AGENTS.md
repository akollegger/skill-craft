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
ADR-004 (feature spec `specs/004-skillcraft-visualizer`). The critic loop, which reviews and revises a distilled skill, is
built (ADR-003 §2.6, feature spec `specs/005-critic-loop-harness`). The rest of the record, distill and compare workflow
is not built yet; it waits on the player and experiment-protocol decision
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
`scripts/run-agent.ts` (runs through the AI SDK, with a Claude model or `fireworks/<model>` via `--model`, scored and measured; `--dry-run`
spends nothing; `--prompt-version <n>` picks `prompts/base/v<n>.txt` (default 1); `--call-budget <n>` states a budget of tool calls for a version 2 prompt, `--max-turns <n>` a budget of steps for a version 1 one, and the other is refused; `--arm-sentence <n>` and `--skill-tool-version <n>` pick those prompts' versions; `--prompt-note` adds one free-text sentence and `--prompt-file` replaces the base prompt with an ad hoc template (both recorded as `custom`); `--experiment <folder>` refuses an arm that differs from the experiment's pinned prompt set: every arm of an experiment must use the same base prompt), `scripts/report.ts` (run folders to the
experiment results table), `scripts/score.ts` (score run logs against the best run) and `scripts/export-run.ts`
(export a finished run as a replay bundle), `scripts/prompts.ts` (list every prompt kind, version and fingerprint; exits 1 on a missing changelog entry) and `scripts/critic-loop.ts` (finished runs, or a candidate skill, to
a reviewed skill: up to three rounds of a critic and a reviser, then a loop record under `loops/`; `--dry-run`
spends nothing, `--allow-workspace` is needed to distill a candidate through NAMS), `scripts/viz.ts <folder>` (serve a
folder of runs and the built page on 127.0.0.1), `scripts/viz-export.ts <folder> <dest>` (a static copy of the same) and `scripts/art-sheet.ts <dest.html>` (a contact sheet of the sprite library, written outside the repository).
The server runs as
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
(`src/viz/`) uses only Node's built-ins and zod, and shares two files with the page, `src/viz/contract.ts` and `src/viz/glyphs.ts`, which must
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
  managed workspace that the experiment runner (not built yet) creates and deletes. The critic loop already
  works that way for its candidate step: it creates a managed workspace, records the runs, generates a skill,
  downloads it and deletes the workspace, only with `--allow-workspace`, and refuses any id it did not create,
  including `NAMS_WORKSPACE_ID`. Experiment runs keep
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
| `src/harness/` | Interim run harness (prompt, the AI SDK driver and its helpers, model specs and prices, errors, the command, export, bundle reader, the `RoleDriver` seam for the critic loop) |
| `src/trace/` | Run measurement: recorder, trace lines, join of trace to run log; no dependency on the SDK or `src/mcp` |
| `src/sim/notes.ts` | The world notes file: prior fit, per-recipe notes and omissions; never imported by the engine or server |
| `src/viz/` | The visualizer's backend: folder scanner, catalog, bundle supply, local server, static export, commands, and item art (`art/`: the sprite library, a world's art file, glyph allocation, world art, the contact sheet); `glyphs.ts` is shared with the page; no SDK and no `src/mcp` |
| `viz/` | The visualizer's page (Vite, Svelte, PixiJS, Tailwind); built to `dist-viz/` (gitignored); component tests in `viz/test/` |
| `prompts/` | Every prompt in play, versioned and never edited: `base/`, `arm-sentence/`, `skill-tool/`, `review-rubric/`, each `v<N>.<ext>` with a `CHANGELOG.md` (ADR-007) |
| `src/prompts/` | Loading, placeholder and word checks, filling, fingerprints, composing a run's prompt, and the prompt set check; no SDK import |
| `src/loop/` | The critic loop: rubric and roles' instructions (one versioned file), the verdict and revision schemas, role prompts, the round controller, the loop record, the NAMS seam with its workspace guard, the candidate step, a small zip reader and diff; no SDK import |
| `loops/` | One folder per loop (gitignored): rounds, verdicts, diffs, the accepted `skill/`. The only place model-authored review text may be written |
| `scripts/` | `solve.ts`, `make-world.ts`, `smoke.ts`, `run-agent.ts`, `report.ts`, `score.ts`, `export-run.ts`, `critic-loop.ts`, `viz.ts`, `viz-export.ts`, `dev-viz.ts` |
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
- `run-agent.ts` costs real model usage. Use `--dry-run` first, keep `--runs` small, and never
  point it at `worlds/forge.json` (neutral names). The player has only the craft tools (and the skill tool when
  a skill is installed) so it cannot read world files. Runs are not recorded to NAMS by hooks: the AI SDK has no
  Claude Code hooks, and a finished run is written through the REST API. A world with no notes
  file is stamped `undeclared` in every score and summary; an experimental world carries one.
- The AI SDK and its provider packages are imported only in `src/harness/ai-driver.ts`; everything else talks to the
  `AgentDriver` seam, and `src/harness/ai-options.ts` holds the mapping that is tested without them. Keys come from
  the environment (`ANTHROPIC_API_KEY`, `FIREWORKS_API_KEY`). A model is `<provider>/<model>` (a bare `claude-<id>` is shorthand for `anthropic/<id>`) and every record holds the canonical form; the providers are
  rows of the table in `src/harness/providers.ts`, and adding one is a row and its package (`spikes/fireworks/README.md`).
  Cost is provider-dependent and may be unavailable (ADR-006 §2.4, amended 2026-10-12; spec 007 FR-046 to FR-051): tokens are what is measured, and a dollar figure is
  recorded only when one can be had, from the first of a cost the provider reports, a pin in `prices.json` (an operator's choice; none ship, since a hand-entered rate
  goes stale), or a market quote from OpenRouter's public model list for a model with an alias in `src/harness/price-aliases.json`, else it is null and never zero.
  `costSource` and, for a pin or a quote, `priceQuote` (the OpenRouter id, when the list was read, the rates) are recorded in `score.json`. The CLIs resolve the price before
  any run or role call (`src/harness/pricing.ts`, which caches the list in `.cache/`); the drivers look none up, and `--max-usd` is refused when none resolves. A quote is a
  marketplace price and not a record of any host's rate, and the report labels it so. To add an alias, check the OpenRouter entry against the model (name, description,
  canonical slug) and never match by name; `spikes/fireworks/probe-prices.ts` shows what a model would be costed with. Totals state how many runs were unpriced and when
  their costs came from different sources. Do not hand-enter rates to make a number appear. A skill is offered as a `Skill` tool that returns its text,
  not as a native Claude Code skill, so the comparison is the same for every provider. `--step-timeout-seconds`, `--tool-timeout-seconds`, `--max-output-tokens`, `--max-total-tokens` and `--max-usd` limit a run (a dollar cap is refused for a model with no price; a token cap works for every model); a run that times out or is cancelled keeps the spend it had, and the driver ends a run with a fixed code when a step or tool stalls (`step_timeout`, `tool_timeout`), the craft server dies (`server_lost`) or five steps in a row make only invalid tool calls (`tool_loop`). `--settings <file>` pins a model's thinking, effort and temperature (refused before any spend where the table knows the model does not take one); `score.json` records them (`null` is unset) beside `retries` (the stated maximum and the attempts that failed, kept out of the trace) and, when a provider reports them, `reportedCostUsd` and `model.backend`. The driver reports the trace
  events in the shape `TraceRecorder` has always read, so `trace.jsonl` is unchanged, and tests use the scripted player in `test/helpers/fake-player.ts`.
- Time, tokens and cost live in `trace.jsonl` and `score.json`, measured by the harness. Never add a clock
  or a measurement to the engine, the server or `run.jsonl`. Agent text and reasoning are never written to
  a trace, a summary or a bundle; the privacy test enforces it, so keep it passing.
  The model's messages and reasoning have one home, decided in ADR-003 §2.4 (amended 2026-10-12) and built (spec 007 FR-028 to FR-031): `conversation.jsonl` in a run folder (one line per model turn: its text, the reasoning the provider returned and its calls), kept only for the NAMS recording and read only by it. A run made before it existed is recorded with placeholder steps and marked so. A NAMS recording holds what the model and the world produced and no harness judgement (no score, solver path or label of which calls were needed): those are for judging an agent, not helping one.
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
- Item art: a world's optional `<world>.art.json` and the sprite library (`src/viz/art/library.json`) are read only by the backend, at scan
  time. A library name says what is drawn, never an item's meaning, and the visualizer never interprets an item's name. A bundle's manifest and
  the catalog carry finished sprites and generated glyphs for the items a run shows, never library names, paths or other items of the world.
  Every library drawing is the project's own 16 by 16 work, with no black outline (a test measures each against the dark slot and the grid cell); one that started from a licensed reference is listed in `src/viz/art/CREDITS.md`.

## Prompt rules to keep in mind

- A prompt is a file under `prompts/<kind>/v<N>.<ext>` and a version is never edited: a change is a new file, a `## v<N>` section in the kind's
  `CHANGELOG.md`, and, for the review rubric, a new process version. `pnpm dev scripts/prompts.ts` lists them and fails on a missing entry.
- Version 1 of the base prompt reproduces the code's original prompt byte for byte (a test holds it); its budget is steps. Version 2 states a
  budget of tool calls, which the driver counts in the order the model emitted them: a call past it is not sent to the craft server,
  answers one fixed line, is absent from `run.jsonl` and is counted in `budgetRefused`. A goal held on the last in-budget call is `stopped`.
- A base prompt never mentions skills, memory or learning; from version 2 it does not say "explore" or "unfamiliar". The arm sentence and the skill
  tool's description exist to mention a skill and are not checked.
- `score.json` records `prompt` (the base version, `baseSha256` of the filled base prompt, `sha256` of the full text sent, the arm sentence's and the
  skill tool's versions) and `budget`. The report compares arms on `baseSha256`; a difference in only the arm sentence is listed, not warned about.
  A run with no `prompt` block is shown as unversioned, never as version 1.
- An experiment's summary may pin a `promptSet`; `run-agent`, `critic-loop` and the report refuse what differs from it. The review rubric
  file keeps its bytes and hash, so earlier loop records stay valid.

## Critic loop rules to keep in mind

- The critic and the reviser have no tools: a role's prompt is built in `src/loop/inputs.ts` from named parts
  only (rubric, goals, recordings, the current skill, and for the reviser the current verdict), so they cannot read
  the world, the goals file, the solver's output, a held-out goal or an earlier verdict (they are given only the goals the
  recordings cover). Keep it that way; `test/loop-inputs.test.ts` checks it.
- Roles run through `RoleDriver`; the SDK is still imported only in `src/harness/ai-driver.ts`, and tests use the
  scripted role in `test/helpers/fake-role.ts` and the scripted service in `test/helpers/fake-nams.ts`.
- Model-authored review text (verdicts, change lists, revised skills) lives only under `loops/<label>/`, as the
  schema's fields only. It never goes into a run folder, trace, summary, score, bundle or `reason`; the privacy test
  covers both sides.
- A loop never writes into a run folder it reads. Round snapshots are named `reviewed-skill.txt`, not any case
  variant of `SKILL.md` (macOS ignores case), so only an accepted loop's `skill/` folder installs through `--skill`.
- The loop touches only a NAMS workspace it created, never one named in `NAMS_WORKSPACE_ID`, and the key comes from
  the environment only. Run the live steps in a subshell that unsets `NAMS_WORKSPACE_ID` (see the spec's quickstart).
- Each loop's `loop.json` records how its skill was made: the process version (`PROCESS_VERSION` in `src/loop/process.ts`, explained in
  `design/notes/skill-process.md`, with a test that fails when the changelog has no entry for it), the commit and whether the tree had
  changes, the recorded runs with hashes and settings, the roles' models and settings, the memory service's version and build commit (read from its unauthenticated `/v1/version` while generation runs), the spend and the final skill's hash. It holds no
  recorded text and never goes inside `skill/`. A student run's `skill.sha256` finds it (`grep` for `finalSkillSha256` in `loops/*/loop.json`).
  Bump `PROCESS_VERSION` and add a changelog entry when what is recorded, what the distiller is asked, the rubric, the roles' instructions,
  the round limit or the roles' default settings change.
- An experiment declares a cast, not a fixed pair (ADR-003 §2.1, amended 2026-10-12; spec 007 FR-040): `cast` in `summary.json` gives the
  teacher, student and distiller (the memory service, with the critic and reviser as its review stage), each with a model and settings,
  one model may fill several roles, and the older `models` form is still read. The report prints the cast and which roles share a model,
  and when `review.json` has a `loop` path it checks that loop record against the reviewed skill and the cast and says who made the skill.
  Harness-based distillation is a later ADR; it must take only what the model and the world produced, never solver output or scores.
- `critic-loop.ts` costs real Claude usage (and `--allow-workspace` writes to the NAMS account). Use `--dry-run` first,
  and keep `--max-role-usd` and `--max-rounds` small.

## Conventions

- Match the surrounding code's style and comment density. Comments explain why, not what.
- Do not commit `.env`, `node_modules/` or `dist/`.
- Commit messages: short imperative subject, a body that says what and why.
