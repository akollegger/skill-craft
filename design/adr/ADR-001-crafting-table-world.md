---
id: ADR-001
title: Grid-based crafting table as the distillation demo world
status: accepted
created: 2026-09-29
specs:
  - specs/001-crafting-table-sim
---

# ADR-001: Grid-based crafting table as the distillation demo world

## 1. Context

The demo compares an agent solving a task with and without a skill distilled from its earlier
runs. Two properties of the memory service (NAMS, the Neo4j Agent Memory Service) shape what the
task environment has to look like.

**The procedure has to live in tool calls.** The `nams-hooks` plugin records each tool call with
its name, full input, output, status and duration. It records the agent's reasoning only as
placeholders: every reasoning step reads `"Claude Code ran Bash with the provided tool input."`
with an empty result. NAMS's distillation step (the *distiller*, which turns recorded memory into a skill) derives a
skill's step graph from recorded tool calls, so the environment must make its procedure visible as
distinctive, parameterized calls.

**Runs must be cheap, repeatable and countable.** A skill's value shows up as fewer tool calls and
fewer failed attempts on a later run. That needs a deterministic environment, a known optimal
solution to score against, and many short runs. The distiller also withholds a skill when its
scope mixes several procedures, and it needs at least three recorded steps, so each run has to be
one coherent task.

**Prior knowledge decides how much memory can add.** If items are called `torch` and `lantern`, a
model already knows the recipes, and memory has nothing to add. That suits a control world and
not a demo of help on real processes, where the vocabulary is familiar and the specifics differ.
A world therefore declares its prior fit: invented, perturbed or faithful (see Amendments).

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
recipe input is obtainable: it is in the stock, or it is the output of a recipe whose own inputs
are all obtainable. Because matching is exact and unambiguous, at most one recipe matches the
grid at any moment.

### 2.3 Tool surface

A Model Context Protocol (MCP) server named `craft` exposes these tools. Each has one purpose, and none lists recipes.

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
`out_of_bounds`, `cell_occupied`, `cell_empty`, `not_in_inventory`, `nothing_to_craft`,
`unknown_item`. A refusal also sets the tool result's error flag, so a recording of the call marks
it as failed. `craft` returns the item made and its quantity, not a preview. Coordinates are
zero-based, and `help` says so.

### 2.4 Hint level

Each world sets `hints`:

- `exact`: a preview reports only `craftable`.
- `partial`: a preview also reports `partial: true` when the current grid could still become a
  match by adding items, without removing any and without naming which.

`exact` is the hardest setting, since a mismatch gives no signal. `partial` gives the agent a
gradient. The hint level and the grid size together set how large the search space feels.

### 2.5 World files and vocabulary

Worlds are JSON files validated against a schema:
`{ name, description, grid, stock, hints, items, recipes }`. The server loads the file
named by the `SIM_WORLD` environment variable, and writes the run log to the file named by
`SIM_RUN_LOG`. A seeded renamer re-skins any world with invented
item names and, by default, replaces flavour text with category-only descriptions, so an agent
cannot infer a recipe from a name. This is the *invented* prior fit; the other two are described in
Amendments. Its `--perturb` option changes quantities and patterns
deterministically, which produces a world whose recorded results no longer match the original
(used later to exercise drift detection).

### 2.6 Validation, goals and scoring

The loader checks that every recipe input is obtainable (Section 2.2), which is a single pass over
the recipes and needs no search. A separate solver takes a world and a goal (an item and a quantity) and
searches exhaustively over craft orders. It returns the minimum number of crafts and tool calls
and the slack, meaning how many wasted crafts a run can absorb and still reach the goal. Minimum
tool calls counts only the calls that change the world (`place` and `craft`); `help`, `inventory`
and `look` are free to use and are excluded. Slack is the largest *w*, up to a fixed cap, such that any *w*
recipe applications from the starting stock still leave the goal reachable. Goals live outside the
world file, in the experiment harness, which also gives the goal to the agent (for example in its
prompt). Committed worlds keep their intended goals in a sibling goals file that only tests, the
solver and the world generator read; the engine never does. The solver is the yardstick for scoring
a run. World size is capped by limits on items, recipes, table cells and stock, and by a budget on
the solver's search, so the search stays tractable.

### 2.7 State and reset

Game state lives in the server process. Each agent session spawns a fresh server, so every run
starts from the initial stock. The agent has no reset tool; between-run reset is a harness
concern. Restarting the process is the reset, and the agent is not told, so a mid-run restart
starts a new run without any signal to the agent.

### 2.8 Run log

The server keeps an ordered log of every tool call in the run, including refused ones, with each
call's arguments and outcome. The experiment runner reads it after the run; no tool returns it.
The log is the measurement of a run's calls and failed crafts, independent of whatever software
drives the agent. It carries no timestamps, so replaying the same calls gives a byte-identical log.
The server writes it to the file named by `SIM_RUN_LOG`, and it refuses to start if that
file already holds data, so a restart cannot append to an earlier run's log and mix two runs. Each
run needs its own file.

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
- **Expose the run log through a tool.** Rejected: the agent could read it, and the log is the
  runner's independent measurement of the agent.
- **Truncate or append to an existing log file.** Rejected: truncating destroys a finished run's
  data, and appending after a silent restart restarts the call numbering and mixes two runs.
- **Report refusals as ordinary successful results.** Rejected: a recording of the call would show
  success, and the memory service tells anti-patterns from successes by recorded status.
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
- The run log protects the log from the simulation's own tools only. A player with shell access
  could read the file, so the player configuration must exclude shell tools; this belongs to the
  player and experiment-protocol decision. The first pilot also checks that a refused call is
  recorded as failed.
- With no goal in the world, an agent learns its goal only from its prompt. A recorded run
  therefore shows the goal in the conversation, not in the tool calls, and the distiller has to
  connect the two.

## 5. Related

- Related ADRs: none yet.
- Specs: `specs/001-crafting-table-sim`

## 6. Amendments

Changes made to this ADR after acceptance, while planning `001-crafting-table-sim`. The text of
Section 2 was updated to match.

- **2026-09-29, empty-cell refusal.** Added `cell_empty`, returned when `remove` targets an empty
  cell. The original list had five refusal codes. Silently accepting the call would hide an
  agent's mistake.
- **2026-09-29, refusals flagged as failures.** A refusal sets the tool result's error flag so a
  recording of the call marks it failed. The memory service uses recorded call status to separate
  successful patterns from anti-patterns. Whether the recording hook stores the flag is unverified
  and is a pilot check.
- **2026-09-29, run log.** Added the run log (Section 2.8). Section 2.6 named the solver as the
  yardstick but gave no source for a run's actual call and failure counts.
- **2026-09-29, one log per run.** The server refuses to start on a log file that already holds
  data. A process restart silently resets the world, and appending to the old file would restart
  the call numbering midway and mix two runs.
- **2026-09-29, goals file beside the world.** Goals still stay out of the world file, but
  committed worlds carry a sibling goals file for tests, the solver and the world generator. The
  original text put goals only in the experiment harness, which left nothing for the
  solvability tests to check.
- **2026-09-29, scoring made concrete.** Minimum tool calls counts only `place` and `craft`. Slack
  is defined as above. World size is capped by parameter limits and a search budget, whose values
  are in `specs/001-crafting-table-sim/research.md`.
- **2026-09-29, small interface details.** `craft` returns the item made rather than a preview.
  Coordinates are zero-based. Arguments of the wrong type are rejected by the tool's input schema
  and are not logged as game outcomes.
- **2026-09-29, one validity rule.** Sections 2.2 and 2.6 stated two different rules for recipe
  inputs (present in the stock or another recipe's output, versus reachable from the stock). Two
  recipes that each needed the other's output passed the first and failed the second. Both
  sections now say *obtainable*, the stricter rule, which the loader checks in one pass without a
  search. The spec, data model and plan were updated to match.
- **2026-10-01, three prior fits.** A world declares how far an agent's existing knowledge predicts
  its recipes: *invented* (no prior beyond the mechanic), *faithful* (the vocabulary and recipes of a
  well-known source) or *perturbed* (a faithful vocabulary with stated deviations). Faithful is
  perturbation zero, and invented is the renamer applied on top, so all three derive from one base
  world. The base is Minecraft's crafting recipes, a subset on the 3x3 grid, with the game version
  named. A faithful world is a control that marks where memory adds nothing. A perturbed world has
  two systematic deviations (a rule that applies across recipes, which a skill can abstract) and two
  idiosyncratic ones (a change to a single recipe, which memory can recall). Results name the prior
  fit. Descriptions stay category-only in every kind of world. The renamer and `--perturb` as built
  produce only invented, idiosyncratic variants (`--perturb` always renames and nudges single
  recipes); keeping names and applying a rule need generator work, which goes through a spec.
  Constitution Principle III (version 1.1.0) and `AGENTS.md` are updated to match.
- **2026-10-01, no game version pinned.** The faithful base does not name a game edition or version. It
  uses crafting that is the same across the versions commonly played, credits the game as inspiration
  in documentation beside the world (never in text the agent sees), and claims no affiliation with its
  owner. A version is named only for a recipe that differs between versions. This replaces "with the
  game version named" in the entry above. Constitution Principle III is updated to match (1.1.1).
