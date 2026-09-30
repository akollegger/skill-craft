# Research: Crafting-Table Simulation

Decisions that the spec deliberately left to planning, plus choices that shape the design. Each
records the decision, why, and what else was considered. No `NEEDS CLARIFICATION` remains.

## 1. World size limit and solver budget (FR-019, SC-008)

**Decision**: Reject a world at load if any of these is exceeded, or if the solver's search runs
past its state budget while proving the world's goals solvable:

| Limit | Value |
|---|---|
| Items | 30 |
| Recipes | 40 |
| Table cells | 36 (up to 6 x 6) |
| Total starting stock units | 120 |
| Solver state budget | 250,000 distinct inventory states |

All values live in one file (`src/sim/limits.ts`) so they can be tuned.

**Measured (2026-09-29, Node 24, one laptop core):** a synthetic world at the parameter limits (30
items, 40 recipes, a 6 x 6 table, 120 stock units) with an unreachable goal hits the 250,000-state
budget in 1.5 s. A world whose full search finishes at 349,000 states takes 3.2 s for search,
shortest paths and slack together, so a world just under the budget costs about 2 to 3 s. The
committed worlds take 0.1 to 3 ms. The 10-second target has a wide margin and the limits stand.
The search explores every state reachable from the start, so a world whose full state space exceeds
the budget is rejected even when its goal is easy to reach.

**Rationale**: The solver's cost is the number of distinct inventories it visits, not any single
parameter. A state budget is the honest bound. The parameter limits keep obviously oversized
worlds out early with a clear message, and the budget catches the rest. The numbers are set so a
search of that size finishes well inside 10 s in Node; the first benchmark task confirms this and
adjusts them if not.

**Alternatives**: Parameter limits alone (rejected: a small world with many interchangeable recipes
can still blow up the search). Budget alone (rejected: gives the author a late, opaque failure
instead of an early, specific one).

## 2. Best-run definition (FR-018, SC-002)

**Decision**: Between crafts the table is empty, so the solver searches over **inventory states**
only. A move is applying one recipe whose inputs the inventory covers; it removes the inputs and
adds the output. A goal is met when the inventory holds the goal quantity. The solver reports:

- **minCrafts**: fewest recipe applications to reach the goal (breadth-first search).
- **minCalls**: fewest agent tool calls, where applying a recipe costs one `place` per item on the
  table plus one `craft` (so *k* items cost *k* + 1). Least-cost search over the same states. This
  counts only calls that change the world (`place`, `craft`). It excludes `help`, `inventory` and
  `look`, which cost no stock and which a player may use freely. The two minima may come from
  different paths; both are reported.
- **calls**: the concrete tool-call sequence for the minimum-call path, so it can be replayed
  (User Story 5, scenario 3). Shapeless recipes place their items in row-major order from the
  first cell; shaped recipes place their pattern anchored at the top-left of the table.
- **slack**: the largest *w* (up to 5) such that after **any** *w* recipe applications from the
  starting stock the goal is still reachable. It answers "how many wasted crafts can a run absorb".
  Computed by a memoized search that combines a reachability check with a worst-case walk over
  successor states. Capping at 5 keeps the computation bounded.

**Rationale**: Because exact matching means a mismatched `craft` consumes nothing (FR-006), the only
way to waste stock is to commit a valid but unhelpful recipe. Slack counts exactly those. The
inventory-state view makes all three numbers exact.

**Alternatives**: Report spare stock units instead of slack (rejected: says nothing about recipe
choices, which is where runs go wrong). Count `look` and `inventory` in minCalls (rejected: a
scripted best run never needs them, and players differ in how much they check).

## 3. Recipe matching and conflict detection (FR-003, FR-004, FR-016)

**Decision**: At load, compute a canonical key for each recipe and index it.

- Shapeless key: the sorted item multiset, for example `a:2|b:1`.
- Shaped key: the pattern trimmed to its bounding box (empty border rows and columns removed),
  written as its dimensions plus cells row by row. Two patterns that differ only by position get the
  same key. Rotations and mirrors get different keys and so do not match (ADR-001 Section 2.2).

The table gets the same two keys at match time: its item multiset and its trimmed bounding box.
`craftable` is whichever recipe is found under the matching key.

Two recipes can match the same table state exactly when: two shapeless recipes share a multiset; two
shaped recipes share a trimmed pattern; or a shaped recipe's item multiset equals a shapeless
recipe's (the shaped arrangement, if it fits, is itself a table state that matches both). Those
three collisions are the load-time conflict check.

**Rationale**: One definition of a match serves the engine, the loader and the solver, and lookup is
constant time. Conflicts fall out of key collisions with no second algorithm.

**Alternatives**: Scan all recipes per call (rejected: needs a separate conflict checker).
Rotation- and mirror-invariant matching (rejected in ADR-001).

## 4. The `partial` hint (FR-013)

**Decision**: `partial` is true when the table is non-empty, is not itself an exact match, and some
recipe could become an exact match by adding at least one item without removing any. For a
shapeless recipe, the table's multiset is a proper sub-multiset of the recipe's. For a shaped
recipe, some position of the pattern inside the table covers every occupied cell with the same
item at that pattern cell, with at least one pattern cell still empty in the table, and the whole
pattern fits inside the table. Checked by scanning recipes at preview time (worlds are small).

**Rationale**: It matches the ADR's wording, leaks no recipe or item names, and needs no
precomputation beyond the loaded recipes.

**Alternatives**: Report a count of candidate recipes (rejected: leaks how many recipes exist).
Report "distance to match" (rejected: a stronger hint than the spec allows).

## 5. Tool results and refusals (FR-008, FR-009, FR-011, FR-012)

**Decision**: Every tool returns a single JSON text block with a fixed key order. A refusal returns
the same shape with `ok: false`, a stable `error` code and a short `message`, and sets the MCP
result's `isError` flag. Refusal codes are `out_of_bounds`, `cell_occupied`, `not_in_inventory`,
`nothing_to_craft` and `unknown_item`, plus one addition: `cell_empty`, for `remove` on an empty
cell. An empty cell is a distinct reason, and letting `remove` quietly succeed would hide an
agent's mistake. FR-012 is updated to list it.

Table coordinates are zero-based `(row, col)`. `help` states this.

Malformed arguments (for example a non-integer row) are rejected by the tool's input schema before
the engine sees them, as a protocol-level error. They are not a game refusal and are not written
to the run log as engine outcomes.

**Rationale**: A stable, machine-readable code lets a harness count failure kinds. Flagging refusals
as errors is intended to make the recorded tool-call status say "failed", which the memory service
uses to separate successful patterns from anti-patterns. Whether the recording hook stores that
flag as a failure is unverified and is a pilot check, not a planning dependency.

**Alternatives**: Return refusals as ordinary successful results (rejected: loses the status
signal). Make `remove` on an empty cell a no-op (rejected above).

## 6. Run log (FR-023, SC-010)

**Decision**: The engine keeps an ordered in-memory log of every tool call. The MCP server
additionally appends each entry as one JSON line to the file named by the `SIM_RUN_LOG`
environment variable, when set. Each entry has a sequence number, the tool, its arguments, whether
it succeeded, and the refusal code or crafted item. It has no timestamps, so a replay of the same
call sequence produces a byte-identical log (constitution principle I).

A log file is never reused. If `SIM_RUN_LOG` already names a non-empty file, the server refuses to
start (message on stderr, non-zero exit) rather than append or truncate. A restart is a reset, and
the world silently returns to its initial stock, so a restarted server writing to the same file
would restart `seq` at 1 in the middle of it and mix two runs, corrupting every count derived from
it. Failing at startup makes the mistake visible, and the harness gives each run its own path.

The file is written by the server process and no tool reads it, which satisfies "the agent cannot
read the log" at the tool level. A player that can also run shell commands could open the file;
keeping that from happening is a property of the player configuration, to be settled with the
player decision, and is noted in the design note on player options.

**Rationale**: A file survives the server exiting, needs no extra protocol, and is easy for a
harness to read and count. An environment variable keeps the path harness-owned.

**Alternatives**: Truncate an existing file at startup (rejected: silently destroys a finished
run's data). Append with a run identifier per record (rejected: the harness would have to split
mixed files, and a reset the agent cannot see would still go unnoticed). A `log` tool (rejected:
the agent could read it, FR-023). A local HTTP or socket
endpoint (rejected: heavier than needed). Timestamped entries (rejected: breaks byte-identical
replay; a harness can add its own wall-clock).

## 7. Goals live beside the world, not in it (FR-010, FR-021, SC-007)

**Decision**: Each committed world has a sibling goals file (`<world>.goals.json`) listing intended
goals as item and quantity. The world file never contains goals, and the engine never reads the
goals file. The loader-side test suite and the solver read it: the suite proves each listed goal
solvable (FR-021), and the re-skinner maps the goals file along with the world so variants can be
checked for the same goals (SC-007).

**Rationale**: It keeps goals out of the world, as ADR-001 requires, while giving tests something to
check. The experiment harness may later relocate or extend this.

**Alternatives**: Goals inside the world file (rejected by ADR-001). Goals only in test code
(rejected: the re-skinner and the solver CLI need them too).

## 8. Re-skin and perturbation (FR-020)

**Decision**: Keep the existing seeded renamer (invented names; category-only descriptions by
default). Extend `--perturb` to the new recipe forms: nudge shapeless input quantities by one, and
for shaped recipes swap two occupied cells or move one cell to an empty position inside the
pattern's bounding box. After each perturbation, re-run the loader's validation, including
conflict detection, and the goals' solvability; if it fails, redraw from the same seeded stream a
bounded number of times, then report failure for that seed.

**Rationale**: It reuses working code, stays reproducible from a seed, and guarantees the variant
is valid and solvable for the same goals (SC-007).

**Alternatives**: Perturb only quantities (rejected: never changes a shaped recipe, which is the
drift case worth demonstrating).

## 9. Existing code (FR-022)

**Decision**: Delete the gather, tier, station and fuel mechanics, the old planner, the old world
and its generated variants, and the old tests. Rewrite `schema.ts`, `engine.ts`, `mcp/server.ts`
and the tests. Adapt `world-loader.ts` (renamed `loader.ts`), `rename.ts`, `scripts/make-world.ts`
and `.mcp.json`. Keep the PRNG in `rename.ts`.

**Rationale**: The old data model does not fit the new one, and keeping dead mechanics would
contradict Constitution Principle V.

## 10. Determinism check (SC-001)

**Decision**: A test drives each committed world with seeded pseudo-random sequences of valid and
invalid calls, records the outcome sequence and the run log, replays it against a fresh game 100
times, and asserts identical results each time. Seeded randomness is confined to the test.

**Rationale**: It exercises refusals and crafts together without hand-written sequences, and the
seed makes any failure reproducible.
