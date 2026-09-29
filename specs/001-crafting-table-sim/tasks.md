# Tasks: Crafting-Table Simulation

**Input**: Design documents from `/specs/001-crafting-table-sim/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. The constitution (Principle IV, non-negotiable) requires tests before implementation and a proof that every committed world is solvable. Write each story's tests first and confirm they fail before implementing.

**Organization**: Grouped by user story. Stories share files (`engine.ts`, `server.ts`), so their implementation tasks run in priority order; each story's tests and fixtures are separate files and can be written in parallel.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: The user story the task serves (US1 to US7)

## Path Conventions

Single project: `src/sim/` (core, no MCP dependency), `src/mcp/` (server), `scripts/`, `worlds/`, `test/`. Imports of local files use the `.js` extension (NodeNext). Reference behavior in [contracts/](contracts/) and [data-model.md](data-model.md); do not restate it in code comments.

---

## Phase 1: Setup (clear the old implementation)

**Purpose**: Remove the gathering, tier, station and fuel design (FR-022) while keeping the one reusable piece.

- [ ] T001 Copy the `rng` function (mulberry32) from `src/sim/rename.ts` into a new `src/sim/prng.ts`, exported unchanged, with a one-line comment that it is the only source of randomness and is used by world-generation tooling only, never by the engine or by tests
- [ ] T002 [P] Write `test/prng.test.ts`: the same seed gives the same first 20 values, different seeds differ, every value is in [0, 1)
- [ ] T003 Delete the old implementation: `src/sim/engine.ts`, `src/sim/plan.ts`, `src/sim/schema.ts`, `src/sim/rename.ts`, `src/sim/world-loader.ts`, `src/sim/index.ts`, `src/mcp/server.ts`, `scripts/make-world.ts`, `scripts/smoke.ts`, `test/sim.test.ts`, `test/mcp.test.ts`, `worlds/ember-forge.json`, and the whole `worlds/generated/` directory; also empty the `mcpServers` object in `.mcp.json` so no session tries to start a server whose files are gone until T050 restores it (depends on T001)
- [ ] T004 [P] Create `src/sim/limits.ts` exporting `MAX_ITEMS = 30`, `MAX_RECIPES = 40`, `MAX_TABLE_CELLS = 36`, `MAX_STOCK_UNITS = 120`, `SOLVER_STATE_BUDGET = 250_000`, `SLACK_CAP = 5`, each with a comment citing research Decision 1 or 2
- [ ] T005 Run `pnpm typecheck && pnpm test`; both pass with only the prng test present (depends on T002, T003, T004)

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The schema, error type and matcher that every story builds on.

**⚠️ CRITICAL**: No user story work starts until this phase is complete.

- [ ] T006 [P] Write `test/schema.test.ts` (must fail first): accepts the example world in `contracts/world-format.md`; rejects an unknown top-level field such as `tasks` or `goals`; rejects a recipe with an unknown `kind`, a non-rectangular pattern, an all-`null` pattern, a non-positive quantity, and an id not matching `^[a-z][a-z0-9_-]*$`; trims empty border rows and columns of a shaped pattern; defaults `hints` to `"exact"`
- [ ] T007 [P] Write `test/matcher.test.ts` (must fail first): shapeless key ignores item order; a shaped pattern placed at (0,0) and the same pattern at (2,1) give the same table key; a rotated or mirrored pattern gives a different key; extra items on the table prevent a match; the conflict finder reports (a) two shapeless recipes with the same multiset, (b) two shaped recipes with the same trimmed pattern, (c) a shaped and a shapeless recipe with the same multiset, and reports nothing for two shaped recipes with the same multiset but different arrangements
- [ ] T008 [P] Create `src/sim/errors.ts` with `WorldError extends Error` holding a `problems: string[]`; its message lists every problem, one per line
- [ ] T009 Implement `src/sim/schema.ts` (depends on T006, T008): strict zod schemas for `World`, `Item`, `Recipe` (discriminated on `kind`: `shapeless` with `inputs`, `shaped` with `pattern`), `Stock`, `Grid`, `Hints`; export the inferred types and `parseWorld(data: unknown): World`, which normalizes shaped patterns and throws `WorldError` listing every schema issue
- [ ] T010 Implement `src/sim/matcher.ts` (depends on T007, T009): `shapelessKey`, `shapedKey` (trimmed bounding box), `tableKeys(grid)` returning the table's multiset key and trimmed-box key, and `buildMatcher(recipes)` returning `{ match(grid): Recipe | null, conflicts: Array<[string, string]> }` per research Decision 3
- [ ] T011 [P] Create `test/helpers/worlds.ts` (depends on T009): `makeWorld(overrides?)` returning a small valid world (3x3 grid, stock, a shapeless and a shaped recipe, one recipe whose output feeds another) and `gridOf(rows)` for building table states in tests

**Checkpoint**: schema and matcher tests pass; `pnpm typecheck` clean.

---

## Phase 3: User Story 1 - Discover what a combination makes (Priority: P1) 🎯 MVP

**Goal**: An agent can place items on the table, see what could be made, commit a craft, and use made items as ingredients.

**Independent Test**: A scripted agent against a small world places items, reads each preview, commits a craft, and ends up holding the expected item, through the `place` and `craft` tools.

### Tests for User Story 1 (write first, confirm they fail)

- [ ] T012 [P] [US1] Write `test/engine-craft.test.ts` covering the five Story 1 scenarios: placing the two inputs of a shapeless recipe reports its output as `craftable`; `craft` consumes the table and adds the output to the inventory leaving the table empty; a table that matches nothing makes `craft` refuse with `nothing_to_craft` and consume nothing; a made item placed later counts toward another recipe; a shaped recipe reports nothing in the wrong arrangement and its output when rearranged correctly; and `loadWorld` on a valid world file returns the same `World` as `parseWorld` of that file's parsed contents
- [ ] T013 [P] [US1] Write `test/tools-craft.test.ts` using the SDK's in-memory transport (as the old `test/mcp.test.ts` did): `place` and `craft` are listed; `place` returns `{ ok, grid, craftable }`; `craft` returns `{ ok, crafted }`; a refusal has `ok: false`, a stable `error` code and `isError: true`

### Implementation for User Story 1

- [ ] T014 [US1] Implement a minimal `loadWorld(path)` in `src/sim/loader.ts` that reads a JSON file and returns `parseWorld(...)`; full validation comes in US4
- [ ] T015 [US1] Implement `Game` in `src/sim/engine.ts` (depends on T010, T012): constructor takes a `World`, builds the matcher, sets the inventory from `stock` and an empty table; `place(item, row, col)` with its four refusals (`unknown_item`, `not_in_inventory`, `out_of_bounds`, `cell_occupied`), `craft()` with `nothing_to_craft`, and `preview()` returning `{ grid, craftable }`. Outcomes are plain objects (`{ ok: true, ... }` or `{ ok: false, error, message }`); messages state the violated constraint and never the fix
- [ ] T016 [US1] Implement `src/mcp/server.ts` (depends on T013, T014, T015): `createCraftServer(world)` registering `place` and `craft`; a `respond(outcome)` helper that emits one JSON text block with the key order in `contracts/tools.md` and sets `isError` on refusals; `main()` reads `SIM_WORLD`, loads the world and connects over stdio, guarded so importing the module does not start it

**Checkpoint**: US1 tests pass; a scripted client can craft an item over the in-memory transport.

---

## Phase 4: User Story 2 - Wrong crafts have a cost (Priority: P1)

**Goal**: Exploring is free and reversible; only `craft` spends stock; refusals never change state.

**Independent Test**: In a tight-stock world, a wrong `craft` spends raw items and makes the goal unreachable, while `place`, `remove` and `clear` never change the total quantity of items.

### Tests for User Story 2 (write first, confirm they fail)

- [ ] T017 [P] [US2] Write `test/engine-stock.test.ts` covering the five Story 2 scenarios plus: `remove` on an empty cell gives `cell_empty`; `remove` out of bounds gives `out_of_bounds`; a bounded exhaustive test: on a 2x2 table with two items, enumerate every sequence of up to 4 calls drawn from {`place` each item at each cell, `remove` each cell, `clear`} (13 choices per call, under 30,000 sequences) and assert after every step that inventory plus table quantities equal the stock; that every refusal leaves inventory, table and preview unchanged (compare snapshots before and after); and that two `Game` instances built from one world share no state (crafting in one leaves the other's inventory unchanged)
- [ ] T018 [P] [US2] Write `test/tools-table.test.ts`: `remove` and `clear` are listed and return previews; each refusal code appears with the documented shape; a non-integer `row` is rejected by the input schema as a protocol error and is not a game refusal

### Implementation for User Story 2

- [ ] T019 [US2] Add `remove(row, col)` (`out_of_bounds`, `cell_empty`) and `clear()` to `src/sim/engine.ts` (depends on T015, T017)
- [ ] T020 [US2] Register `remove` and `clear` in `src/mcp/server.ts` with integer input schemas (depends on T016, T018, T019)

**Checkpoint**: US1 and US2 tests pass. This is the playable MVP: a world with scarcity that an agent can explore.

---

## Phase 5: User Story 3 - Look without touching, and get oriented (Priority: P2)

**Goal**: `help`, `inventory` and `look` each answer one question and change nothing.

**Independent Test**: Repeated calls to the three tools leave the world identical, and no answer carries recipe information.

### Tests for User Story 3 (write first, confirm they fail)

- [ ] T021 [P] [US3] Write `test/tools-orient.test.ts`: `help` returns the world name, description, table size, the zero-based note, all seven tools with purposes, and no recipes or item ids; the tool list is exactly `help, inventory, look, place, remove, clear, craft`, so there is no gather, reset or log tool; `inventory` returns only `{ items }` with zero quantities omitted and keys sorted; `look` equals the preview of the last change and alters nothing; calling all three ten times in several states leaves inventory, table and preview unchanged (SC-009); a leak sweep over `help`, `inventory`, `look` and every refusal message confirms none contains a recipe id or an item id other than the one in the request, and none contains a remedy word (`try`, `should`, `instead`, `need to`) (SC-006)

### Implementation for User Story 3

- [ ] T022 [US3] Add `inventory()` returning `{ items }` and `look()` returning `preview()` to `src/sim/engine.ts` (depends on T015, T021)
- [ ] T023 [US3] Register `help`, `inventory` and `look` in `src/mcp/server.ts` (depends on T020, T021, T022); build `help`'s tool list from the registered tools so it cannot drift from the code, and follow `contracts/tools.md`

**Checkpoint**: all three orientation tools pass US3 tests; tool count is seven.

---

## Phase 6: User Story 4 - Swap worlds without changing code (Priority: P2)

**Goal**: Any valid world file works with no code change, and every invalid one is rejected with all its problems named.

**Independent Test**: Load each valid fixture and play it; load each invalid fixture and see the expected problem in the error.

### Tests and fixtures for User Story 4 (write first)

- [ ] T024 [P] [US4] Write `test/loader.test.ts`: every file in `test/fixtures/valid/` loads and validates; every file in `test/fixtures/invalid/` fails with a `WorldError` whose message contains the fixture's `$expect` string (strip the `$expect` key before loading); a world with several problems reports all of them together; a world over any size limit reports which limit
- [ ] T025 [P] [US4] Write `test/goals.test.ts`: a goals file parses (`{ goals: [{ item, qty, note? }] }`); an unknown item, a non-positive quantity, or an unknown field is rejected; goals may not appear in a world file
- [ ] T026 [P] [US4] Write `test/server-worlds.test.ts`: create servers for two different valid fixtures with different table sizes and stock; `help` reports each one's own size and `inventory` equals each one's stock (Story 4 scenario 1)
- [ ] T027 [P] [US4] Create ten valid fixtures `test/fixtures/valid/*.json` (SC-004) differing in table size (2x2 to 6x6), stock, hint level, and the mix of shaped and shapeless recipes; include one with a recipe chain three deep and one with two recipes producing the same item; each fixture ships a sibling `<name>.goals.json` with at least one goal
- [ ] T028 [P] [US4] Create invalid fixtures in `test/fixtures/invalid/*.json`, each carrying a top-level `"$expect"` substring: two shapeless recipes with the same multiset; two shaped recipes equal up to translation; a shaped and a shapeless recipe with the same multiset; a shaped pattern larger than the table; a shapeless recipe with more items than table cells; an unknown item in a recipe; an unknown item in `stock`; an unobtainable input (not in stock, no producer); an unobtainable-input cycle (two recipes each needing the other's output); an empty pattern; a stray `tasks` field; a table over the cell limit; more items than the limit; duplicate item ids; duplicate recipe ids; total stock over the limit

### Implementation for User Story 4

- [ ] T029 [US4] Extend `src/sim/loader.ts` (depends on T024, T027, T028): add `validateWorld(world): string[]` implementing every check in `data-model.md` (World, Validation), using `buildMatcher(...).conflicts`, an obtainability fixpoint over the recipes, and `limits.ts`; make `loadWorld` throw one `WorldError` with all problems
- [ ] T030 [US4] Create `src/sim/goals.ts` (depends on T025): a strict schema for the goals file, `loadGoals(path, world)` checking every goal's item exists in the world, and the `Goal` type
- [ ] T031 [US4] Author the base world `worlds/forge.json` and `worlds/forge.goals.json` (depends on T029, T030): a 3x3 table, `hints: "exact"`, neutral item ids, about 12 items and 10 recipes mixing shapeless and shaped, dependency depth up to 4, tight stock; three goals: a one-recipe warm-up, a two-to-three-step goal, and a held-out goal that combines intermediates made for the earlier goals. Targets: every goal solvable, the warm-up has slack of at least 1, and the held-out goal needs at least one intermediate made for an earlier goal and takes at least 4 crafts. `forge.json` is the base for generation; it keeps neutral ids and is not used for experiments. Confirm it loads with `loadWorld`; solvability is proven in US5

**Checkpoint**: loader and server-world tests pass; the base world loads.

---

## Phase 7: User Story 5 - Score a run against the best possible run (Priority: P2)

**Goal**: The runner gets the minimum crafts, minimum calls and slack for a goal, plus a complete run log to compare against.

**Independent Test**: For hand-worked worlds the solver's numbers match, replaying its call list reaches the goal in exactly `minCalls`, and the run log's counts match a hand count.

### Tests for User Story 5 (write first, confirm they fail)

- [ ] T032 [P] [US5] Write `test/solver.test.ts` with hand-worked worlds. (a) Stock `a:2`, recipe `[a,a]->b`, goal `b:1`: `minCrafts 1`, `minCalls 3`, `slack` at the cap. (b) Stock `a:3`, recipes `[a,a]->b` and `[a]->x`, goal `b:1`: `slack 1` (one wasted `x` is survivable, two are not). (c) Stock `a:6,b:1`, recipes `[a×6]->g`, `[a,a]->x`, `[x,b]->g`, goal `g:1`: `minCrafts 1` but `minCalls 6`, showing the two minima come from different paths. (d) An unreachable goal returns `reachable: false`. (e) A search over `stateBudget: 5` throws an error naming the budget. (f) Replaying `calls` on a fresh `Game` reaches the goal in exactly `minCalls`
- [ ] T033 [P] [US5] Write `test/runlog.test.ts`: entries carry `seq`, `tool`, `args` as received, `ok`, plus `error` or `crafted`; refusals are logged; two identical call sequences give byte-identical JSONL; `createRunLog(path)` writes one JSON line per call; it throws `RunLogInUseError` naming the path when the file exists and is non-empty and leaves that file byte-for-byte unchanged (a one-line file and a long file); an existing empty file is accepted; spawning the server (`tsx src/mcp/server.ts`) with a used `SIM_RUN_LOG` exits non-zero with the path on stderr (SC-011); the tool list contains no log-reading tool (SC-010)
- [ ] T034 [P] [US5] Write `test/worlds.test.ts`: for every world under `worlds/` (including `worlds/generated/`) and every fixture under `test/fixtures/valid/`, a sibling goals file exists, every listed goal is solvable, replaying each best run through the in-memory MCP client, using only the tools, reaches the goal in exactly `minCalls`, and each solve finishes in under 10 seconds (FR-021, SC-002, SC-008)

### Implementation for User Story 5

- [ ] T035 [US5] Implement `src/sim/runlog.ts` (depends on T033): `RunLog` with `append(entry)`, `entries`, and an optional JSONL sink; `createRunLog(path?)` and `RunLogInUseError`; fixed key order; no timestamps; the format is in `contracts/run-log.md`
- [ ] T036 [US5] Wire the log into every `Game` operation in `src/sim/engine.ts`, including `help`, `inventory`, `look` and refusals (depends on T035); expose `game.log`
- [ ] T037 [US5] In `src/mcp/server.ts` read `SIM_RUN_LOG` and call `createRunLog`; on `RunLogInUseError` print the message to stderr and exit non-zero before connecting the transport (depends on T036)
- [ ] T038 [US5] Implement `src/sim/solver.ts` (depends on T032): `solve(world, goal, options?)` searching inventory states per research Decision 2 (breadth-first for `minCrafts`, least-cost for `minCalls` with cost `k + 1` per recipe of `k` items, memoized reachability and worst-case walk for `slack` up to `SLACK_CAP`), producing the concrete `calls` list (shapeless items placed row-major from the first cell, shaped patterns anchored at the top-left) and throwing on `SOLVER_STATE_BUDGET`
- [ ] T039 [US5] Create `scripts/solve.ts` (depends on T038): options and output per `contracts/solver-cli.md`, including `--goals-file` and the exit statuses; covered by `test/scripts.test.ts`, written first, which spawns the script and asserts its JSON shape and exit status
- [ ] T040 [US5] Create `scripts/smoke.ts` (depends on T037, T038): spawn the server with `StdioClientTransport` (`pnpm exec tsx src/mcp/server.ts`, `SIM_WORLD` set), replay the best run for `<item>:<qty>`, print the number of world-changing calls and whether the goal item is held, exit non-zero on a mismatch with `minCalls`
- [ ] T041 [US5] Run `pnpm test`; confirm `test/worlds.test.ts` passes for `worlds/forge.json` and adjust its recipes or stock until the targets in T031 are met (every goal solvable, warm-up slack of at least 1, held-out goal takes at least 4 crafts) (depends on T031, T034, T038)

**Checkpoint**: solver, run-log and worlds tests pass; `scripts/solve.ts` and `scripts/smoke.ts` run on the base world.

---

## Phase 8: User Story 6 - Tune difficulty with hints (Priority: P3)

**Goal**: A world can report a `partial` hint without naming any recipe.

**Independent Test**: The same world at each hint level shows the extra signal only at `partial`.

### Tests for User Story 6 (write first, confirm they fail)

- [ ] T042 [P] [US6] Write `test/hints.test.ts`: at `exact` the preview has no `partial` key; at `partial` it is `true` for a proper sub-multiset of a shapeless recipe, true for a shaped recipe's pattern with cells still to add at a position that fits the table, false for an exact match with no larger recipe, false for an empty table, false for an arrangement no recipe can extend (a wrong position or wrong item); `help` mentions `partial` only in `partial` worlds; no output names an item or recipe that was not already visible

### Implementation for User Story 6

- [ ] T043 [US6] Add `couldBecomeMatch(grid, recipes, gridSize)` to `src/sim/matcher.ts` (depends on T042), following research Decision 4
- [ ] T044 [US6] Add `partial` to `Game.preview()` when the world's `hints` is `"partial"`, and the matching sentence to `help` in `src/mcp/server.ts` (depends on T043)

**Checkpoint**: hint tests pass at both levels.

---

## Phase 9: User Story 7 - Re-skin a world with invented names (Priority: P3)

**Goal**: Reproducible variants with invented vocabulary and optional perturbation, still valid and solvable for the same goals.

**Independent Test**: Generate variants from the base world for 20 seeds and check names, structure, determinism and solvability.

### Tests for User Story 7 (write first, confirm they fail)

- [ ] T045 [P] [US7] Write `test/rename.test.ts`: the same base and seed give byte-identical output and different seeds differ; no base item name survives; without `perturb` recipe shapes and quantities are unchanged; descriptions become `"A raw material."` or `"A made item."` unless kept; for 20 seeds a perturbed variant is valid, differs from the unperturbed one in at least one recipe, keeps at least one shaped recipe changed across the seeds, and every mapped goal is still solvable; the goals file is mapped to the new names

### Implementation for User Story 7

- [ ] T046 [US7] Implement `src/sim/rename.ts` (depends on T045, T029, T030, T038): `renameWorld(base, goals, { seed, perturb?, opaque? })` using `src/sim/prng.ts`; invented pronounceable names; perturbation per research Decision 8 (shapeless quantity by one, shaped cells swapped or moved inside the bounding box), re-validating and re-solving after each draw with a bounded retry, and a clear error when a seed cannot produce a valid variant
- [ ] T047 [US7] Create `scripts/make-world.ts` (depends on T046): options and outputs per `contracts/solver-cli.md`, writing the world and `<name>.goals.json`; covered by `test/scripts.test.ts` (same file as T039) with a case that spawns the script and asserts the files written, the exit status, and that the same seed gives byte-identical files
- [ ] T048 [US7] Generate and commit the example variants `worlds/generated/forge-7.json` and `forge-8-perturbed.json` with their goals files using `scripts/make-world.ts` (depends on T047)

**Checkpoint**: rename tests pass; `test/worlds.test.ts` also covers the generated worlds.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Whole-feature checks, documentation, and cleanup.

- [ ] T049 [P] Write `test/determinism.test.ts` (SC-001): for each committed world, build a fixed 200-call sequence that cycles through every tool and every cell in a set order, including deliberately invalid arguments (no randomness), record the outcomes and the run log, replay against a fresh `Game` 100 times, and assert identical outcomes and byte-identical logs
- [ ] T050 [P] Re-add the `craft` server to `.mcp.json` with `SIM_WORLD=worlds/generated/forge-7.json` (depends on T048); leave `SIM_RUN_LOG` unset because each run needs its own path
- [ ] T051 [P] Update `README.md` and `AGENTS.md`: remove the "code predates ADR-001" notes, describe the new tools, world and goals files, run log and commands (`solve.ts`, `smoke.ts`, `make-world.ts`), and correct the layout tables
- [ ] T052 Benchmark the solver on the largest valid fixture and the base world (depends on T041); if any solve exceeds 10 seconds, lower the limits in `src/sim/limits.ts` and record the measured figures in `research.md` Decision 1
- [ ] T053 [P] Search `src/`, `test/`, `scripts/`, `README.md`, `AGENTS.md` and `.mcp.json` for leftovers of the old design (`gather`, `tier`, `station`, `fuel`, `survey`, `place_station`, `recipe_lookup`, `recipes_using`) and remove them
- [ ] T054 Run every step of `quickstart.md` and correct the document where a command or expected output differs from what the code does (depends on T048, T051)
- [ ] T055 Record any deviation from ADR-001 found during implementation as a dated entry in the `## 6. Amendments` section of `design/adr/ADR-001-crafting-table-world.md`; if there is none, add nothing
- [ ] T056 Run `pnpm typecheck && pnpm test && pnpm build` and confirm all pass

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies. T003 needs T001.
- **Foundational (Phase 2)**: needs Setup. Blocks every story.
- **US1 (Phase 3)**: needs Foundational.
- **US2 (Phase 4)**: needs US1 (extends `engine.ts` and `server.ts`).
- **US3 (Phase 5)**: needs US2 (same files); its tests can start after Foundational.
- **US4 (Phase 6)**: needs US1 for the server tests; loader work is independent of US2 and US3. Its fixtures and goals code can start after Foundational.
- **US5 (Phase 7)**: needs US4 (the base world and goals) and US3 (the engine's operations, so the log covers all seven tools).
- **US6 (Phase 8)**: needs US1 (the engine's preview) and the matcher; independent of US4 and US5 apart from `server.ts`.
- **US7 (Phase 9)**: needs US4 and US5 (the loader, goals and solver).
- **Polish (Phase 10)**: needs the stories it covers; T049 needs US5.

### User story dependencies

```text
Setup → Foundational → US1 → US2 → US3 ─┐
                         └────→ US4 ────┼→ US5 → US7 → Polish
                         └────→ US6 ────┘
```

### Within each story

- Tests first; confirm they fail.
- Engine before server.
- Story complete (checkpoint) before the next priority.

### Parallel opportunities

- Setup: T002 and T004 together.
- Foundational: T006, T007 and T008 together; T011 after T009.
- Every story's test files and fixtures are separate files and are marked [P].
- US4: T024 to T028 all at once.
- US5: T032, T033 and T034 at once.
- Polish: T049, T050, T051 and T053 at once.
- With two people: after Foundational, one takes US1 to US3 (the tool surface) and the other takes US4 fixtures, goals and loader, then both meet at US5.

---

## Parallel Example: User Story 4

```bash
# Launch all US4 tests and fixtures together:
Task: "Write test/loader.test.ts"
Task: "Write test/goals.test.ts"
Task: "Write test/server-worlds.test.ts"
Task: "Create ten valid fixtures in test/fixtures/valid/"
Task: "Create invalid fixtures in test/fixtures/invalid/"
```

---

## Implementation Strategy

### MVP first (US1 and US2)

1. Complete Setup and Foundational.
2. Complete US1, then US2 (both P1). Together they are the smallest thing worth using: a world with scarcity that an agent can explore and craft in.
3. **Stop and validate**: drive the server from a scripted client; check the tests.

### Incremental delivery

1. Add US3 (orientation tools) so a real agent can be pointed at the server.
2. Add US4 (validated, swappable worlds and the base world).
3. Add US5 (solver and run log). At this point the simulation is ready for a pilot run: it can be scored and measured.
4. Add US6 and US7 (hints, re-skinning) when experiments need them.
5. Finish with Polish.

### Notes

- Do not extend the old mechanics; T003 removes them first.
- The simulation stops at the pilot's door: recording runs, distilling, and comparing arms belong to later work (the player and experiment-protocol ADR).
- Commit after each task or logical group. Follow the constitution: `pnpm typecheck` and `pnpm test` pass before a change is merged.
