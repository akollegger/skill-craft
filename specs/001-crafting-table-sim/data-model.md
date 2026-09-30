# Data Model: Crafting-Table Simulation

Entities from the spec, with fields, relationships, validation rules and state transitions. Field
formats are in [contracts/world-format.md](contracts/world-format.md); this document is about
meaning and rules.

## World (definition, immutable at run time)

| Field | Meaning |
|---|---|
| `name` | Identifier for the world |
| `description` | One short paragraph returned by `help` |
| `grid` | `{ rows, cols }`, the table size |
| `stock` | Map of item id to starting quantity (the run's initial holdings) |
| `hints` | `exact` or `partial`; defaults to `exact` |
| `items` | List of items |
| `recipes` | List of recipes |

A world contains no goals.

**Validation (load time, all problems reported together)**:
- Schema: required fields present, ids well formed, quantities positive integers, `rows` and `cols`
  positive integers.
- Size: within the limits in `limits.ts`.
- References: every id used in `stock` or a recipe is a defined item.
- Shaped recipes fit inside the table after trimming empty border rows and columns.
- No two recipes can match the same table state (see Matching keys below).
- Every recipe input is obtainable: present in `stock` with a positive quantity, or the output of a
  recipe whose own inputs are all obtainable. Checked as a fixpoint over the recipes, not a search.
  Two recipes that each need the other's output, with neither item in stock, are rejected.
- Every recipe has a non-empty input set and a positive output quantity.
- Every listed goal (from the goals file) is solvable within the solver budget.

## Item

| Field | Meaning |
|---|---|
| `id` | Unique name within the world |
| `description` | Short text; in generated worlds a bare category such as "A raw material." |

An item is *raw* if it appears in `stock`, and *made* if it is a recipe output. It can be both.
The engine treats them alike.

## Recipe

Two kinds, both with an `output` (`item`, `qty`) and an `id`.

- **Shapeless**: `inputs`, a list of (`item`, `qty`). Matches when the table's item multiset equals
  the inputs exactly.
- **Shaped**: `pattern`, a rectangular grid of item ids or empty cells. Stored trimmed to its bounding
  box. Matches when the table's occupied cells, trimmed to their bounding box, equal the pattern.
  Rotations and mirror images are different patterns.

**Matching keys** (computed once at load; see research Decision 3):
- Shapeless key: sorted multiset string.
- Shaped key: dimensions plus the trimmed cells.
- Two recipes conflict when they share a shapeless key, share a shaped key, or when a shaped
  recipe's multiset equals a shapeless recipe's.

## Table

A `rows x cols` array of cells. Each cell is empty or holds one item id. No cell holds more than one
item.

**State transitions** (all on the Game):

| Action | Precondition | Effect | Refusal if not met |
|---|---|---|---|
| `place(item, row, col)` | cell in bounds and empty; item defined; inventory holds at least one | inventory[item] -= 1; cell = item | `out_of_bounds`, `cell_occupied`, `unknown_item`, `not_in_inventory` |
| `remove(row, col)` | cell in bounds and occupied | inventory[item] += 1; cell empties | `out_of_bounds`, `cell_empty` |
| `clear` | none | every occupied cell empties and its item returns to inventory | none |
| `craft` | table matches exactly one recipe | table empties; inventory[output.item] += output.qty | `nothing_to_craft` |
| `look`, `help`, `inventory` | none | none | none |

Only `craft` changes the total quantity of items held plus on the table. A refusal changes nothing.
`place` checks in the order out of bounds, unknown item, occupied cell, item not held, and reports
the first that applies.

## Inventory

A map of item id to non-negative integer quantity. Starts equal to `stock`. Items on the table are
not in the inventory, and the sum inventory + table is conserved except by `craft`.

## Preview

Returned by `look` and by `place`, `remove` and `clear`:

| Field | Meaning |
|---|---|
| `grid` | The table as rows of item id or `null` |
| `craftable` | Item id that `craft` would produce now, or `null` |
| `partial` | Only when `hints` is `partial`: `true` if adding items could yet reach a match. Otherwise absent. |

## Refusal

`{ ok: false, error, message }`. `error` is one of `out_of_bounds`, `cell_occupied`, `cell_empty`,
`not_in_inventory`, `nothing_to_craft`, `unknown_item`. The message names the violated constraint
and never a remedy.

## Run log entry

| Field | Meaning |
|---|---|
| `seq` | 1-based position in the run |
| `tool` | One of the seven tool names |
| `args` | The arguments as received (empty object if none) |
| `ok` | Whether the call succeeded |
| `error` | Refusal code, present when `ok` is false |
| `crafted` | `{ item, qty }`, present on a successful `craft` |

No timestamps. Written in call order. Refused calls are included.

## Goal (outside the world)

`{ item, qty }`. Lives in the goals file and in the harness; the engine never reads it. Optional
`note`.

## Best run (solver output)

| Field | Meaning |
|---|---|
| `reachable` | Whether the goal can be reached from the starting stock |
| `minCrafts` | Fewest recipe applications |
| `minCalls` | Fewest world-changing tool calls (`place` and `craft`) |
| `calls` | The concrete call sequence for the minimum-call path |
| `slack` | Largest *w* up to 5 such that any *w* recipe applications leave the goal reachable |
| `statesVisited` | Search effort, for diagnosing the budget |

When `reachable` is false, the other fields are absent.

## World variant

A world produced from a base world and a seed: every item and station name replaced, descriptions
reduced to a category, and (optionally) quantities and patterns perturbed. Reproducible from
(base, seed, options). Accompanied by a goals file mapped to the new names.

## Relationships

- A **World** has many **Items** and **Recipes**; recipes refer to items; `stock` refers to items.
- A **Game** (one run) is created from one World. It owns one **Table**, one **Inventory** and one
  **Run log**.
- A **Goal** refers to an item of a World but is not part of it.
- A **Best run** is derived from a World and a Goal.
