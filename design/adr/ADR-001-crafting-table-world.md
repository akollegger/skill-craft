---
id: ADR-001
title: Grid-based crafting table as the distillation demo world
status: accepted
created: 2026-09-29
specs: []
---

# ADR-001: Grid-based crafting table as the distillation demo world

## 1. Context

The demo compares an agent solving a task with and without a skill distilled from its earlier
runs. Two properties of the memory service (NAMS, the Neo4j Agent Memory Service) shape what the
task environment has to look like.

**The procedure has to live in tool calls.** The `nams-hooks` plugin records each tool call with
its name, full input, output, status and duration. It records the agent's reasoning only as
placeholders: every reasoning step reads `"Claude Code ran Bash with the provided tool input."`
with an empty result. The distiller derives a skill's step graph from recorded tool calls, so the
environment must make its procedure visible as distinctive, parameterized calls.

**Runs must be cheap, repeatable and countable.** A skill's value shows up as fewer tool calls and
fewer failed attempts on a later run. That needs a deterministic environment, a known optimal
solution to score against, and many short runs. The distiller also withholds a skill when its
scope mixes several procedures, and it needs at least three recorded steps, so each run has to be
one coherent task.

**The agent must not be able to answer from prior knowledge.** If items are called `torch` and
`lantern`, a model already knows the recipes, and memory has nothing to add.

A first implementation modelled a Minecraft-shaped workshop: gatherable raw materials, tool
tiers that gate gathering, placeable stations, fuel, and seven tools. Its base world has 17 items
and 12 recipes, and solving the held-out task takes 37 planned actions. Most of those actions are
resource logistics performed in a fixed order (gather, upgrade a tool, place a station, gather
again). The part worth remembering, which combinations produce what, is a small fraction of the
run. The logistics add cost to every run and add little to what a skill can capture.

## 2. Decision

The demo world is a single crafting table: a grid on which the agent places items to discover
what they combine into. Everything else in the first implementation (gathering, tool tiers,
stations, fuel) is removed. The world defines the table, the items and the recipes. It does not
define goals: what to make is the agent's concern, supplied from outside the world (Section 2.6).

### 2.1 World state

- **Grid.** Each world defines `grid: { rows, cols }`. A cell holds at most one item; there are
  no stacks and no quantities in a cell.
- **Stock.** Each world defines `stock: { <item>: qty }`, the finite raw items available at the
  start. There is no gathering. Stock is the only source of raw items, so it sets how many
  wasted crafts a run can absorb.
- **Inventory.** Placing an item moves one unit from the inventory to a cell; removing moves it
  back. Crafting consumes the grid's contents and adds the output to the inventory. Outputs can
  be placed and used as inputs to later recipes.

### 2.2 Recipes

A recipe has an output (`item`, `qty`) and is one of two kinds:

- **Shapeless.** A multiset of items. It matches when the grid holds exactly those items, in any
  cells.
- **Shaped.** A 2-D pattern of items (with empty cells allowed). It matches when the grid holds
  exactly that arrangement, at any position on the grid. Rotations and mirror images do not
  match.

Matching is exact: extra items on the grid prevent a match. A world is valid only if no two
recipes can match the same grid state, every shaped pattern fits inside the grid, and every
recipe input is either in the stock or the output of another recipe. Because matching is exact
and unambiguous, at most one recipe matches the grid at any moment.

### 2.3 Tool surface

An MCP server named `craft` exposes these tools. Each has one purpose, and none lists recipes.

| Tool | Purpose |
|---|---|
| `help` | Describes the world briefly (its description and grid size) and each tool, including what a preview reports in this world. Changes nothing. |
| `inventory` | Returns the items held and their quantities. Nothing else. |
| `look` | Returns a preview of the grid as it is now. Changes nothing. |
| `place(item, row, col)` | Moves one unit from the inventory to the cell. Returns a preview. |
| `remove(row, col)` | Moves the cell's item back to the inventory. Returns a preview. |
| `clear` | Moves every grid item back to the inventory. Returns a preview. |
| `craft` | Commits the matching recipe: consumes the grid, adds the output to the inventory. |

A **preview** is the result of `look` and of any tool that changes the grid: the grid contents plus
`craftable`, the output item that would result from `craft` right now, or `null` if nothing
matches. Looking, placing, removing and clearing are free and reversible, so exploring costs tool calls
but not stock. `craft` is irreversible and is the only action that spends stock. The world keeps no
list of tasks and does not report whether a goal has been met; the agent tracks its own goal and
checks `inventory`.

Errors are structured codes with a short message that states the constraint and not the fix:
`out_of_bounds`, `cell_occupied`, `not_in_inventory`, `nothing_to_craft`, `unknown_item`.

### 2.4 Hint level

Each world sets `hints`:

- `exact`: a preview reports only `craftable`.
- `partial`: a preview also reports `partial: true` when the current grid could still become a
  match by adding items, without naming which.

`exact` is the hardest setting, since a mismatch gives no signal. `partial` gives the agent a
gradient. The hint level and the grid size together set how large the search space feels.

### 2.5 World files and vocabulary

Worlds are JSON files validated with a zod schema:
`{ name, description, grid, stock, hints, items, recipes }`. The server loads the file
named by the `SIM_WORLD` environment variable. A seeded renamer re-skins any world with invented
item names and, by default, replaces flavour text with category-only descriptions, so an agent
cannot infer a recipe from a name. Its `--perturb` option changes quantities and patterns
deterministically, which produces a world whose recorded results no longer match the original
(used later to exercise drift detection).

### 2.6 Validation, goals and scoring

The loader checks that every recipe input is reachable from the starting stock through some
sequence of crafts. A separate solver takes a world and a goal (an item and a quantity) and
searches exhaustively over craft orders. It returns the minimum number of crafts and tool calls
and the slack, meaning how many wasted crafts a run can absorb and still reach the goal. Goals live
outside the world file, in the experiment harness, which also gives the goal to the agent (for
example in its prompt). The solver is the yardstick for scoring a run. World size is capped so the
search stays tractable.

### 2.7 State and reset

Game state lives in the server process. Each agent session spawns a fresh server, so every run
starts from the initial stock. The agent has no reset tool; between-run reset is a harness
concern.

## 3. Alternatives Considered

- **Keep gathering, tool tiers, stations and fuel.** Rejected: the logistics dominate a run and
  the distinguishing knowledge is a small fraction of it (Section 1).
- **Use real game recipes.** Rejected: a model already knows them, so a with/without comparison
  would measure nothing.
- **Fully procedural worlds generated from a seed.** Rejected: hand-authored structure plus a
  renamer already gives fresh vocabulary, and a generated recipe graph is harder to reason about
  and to explain in a demo.
- **A `craft(item)` tool with recipe lookup.** Rejected: one lookup call reveals the recipe, which
  removes the discovery the demo is about.
- **Crafting fires automatically when the grid matches.** Rejected: it removes the commit
  decision, so exploring would spend stock and there would be no wasted-craft cost to learn from.
- **Stacks or quantities in a cell.** Rejected: one item per cell keeps the grid a plain 2-D
  layout and makes shaped patterns unambiguous.
- **Rotation- and mirror-invariant patterns.** Rejected for now: they multiply the layouts that
  match a recipe, which enlarges the search space without adding a new kind of decision.

## 4. Consequences

- A distilled skill from this world will mostly encode recipes: which items in which layout make
  which output. That is knowledge more than strategy. The harness chooses goals so a held-out goal is
  built from intermediates made in earlier runs, which lets a skill help on a goal it never saw.
  Whether a skill transfers to a re-skinned world, where only a search strategy could carry over,
  is an open experiment and may show little.
- Every run produces many `place` and `remove` calls with row and column arguments. NAMS records
  each one, so run volume and any per-call latency in the recording hooks need checking in the
  first pilot.
- The distiller must derive at least three grounded steps from `place` and `craft` calls alone.
  Whether it does is unverified. A two-run pilot comes before building the full experiment.
- The existing implementation under `src/sim/` and `src/mcp/` is replaced: the schema, engine,
  planner, MCP tools and their tests are rewritten. The world loader, renamer, scripts and test
  scaffolding are adapted. Generated example worlds are regenerated.
- The exhaustive solvability search grows with stock and grid size, which bounds how large a world
  can be.
- The experiment protocol (goal definitions, how runs are recorded, distilled, published and
  compared) is a separate decision and gets its own ADR.
- With no goal in the world, an agent learns its goal only from its prompt. A recorded run
  therefore shows the goal in the conversation, not in the tool calls, and the distiller has to
  connect the two.

## 5. Related

- Related ADRs: none yet.
- Specs: _(populated automatically by the speckit ADR-link hook once `/speckit-specify` references this ADR)_
