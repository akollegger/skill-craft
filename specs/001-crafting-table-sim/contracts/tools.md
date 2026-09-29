# Contract: agent-facing tools

The `craft` MCP server (stdio) exposes seven tools. Each has one purpose. None returns a recipe.
Coordinates are zero-based `(row, col)`, with row 0 at the top and column 0 at the left.

Every result is one JSON text block with a fixed key order. A refusal has `ok: false` and the MCP
result flag `isError: true`. All other results have `isError` unset.

## `help`

Inputs: none. Changes nothing.

```json
{
  "world": { "name": "…", "description": "…", "grid": { "rows": 3, "cols": 3 } },
  "coordinates": "zero-based; row 0 is the top, col 0 is the left",
  "tools": [
    { "name": "help", "purpose": "…" },
    { "name": "inventory", "purpose": "…" },
    { "name": "look", "purpose": "…" },
    { "name": "place", "purpose": "…", "inputs": { "item": "string", "row": "integer", "col": "integer" } },
    { "name": "remove", "purpose": "…", "inputs": { "row": "integer", "col": "integer" } },
    { "name": "clear", "purpose": "…" },
    { "name": "craft", "purpose": "…" }
  ],
  "preview": "grid is the table's contents; craftable is what craft would make now, or null"
}
```

A tool's entry has `inputs` only when it takes arguments. The list is built from the tools that are
actually registered, in the order shown. When the world's hint level is `partial`, the `preview`
text also mentions `partial`. It never
names a recipe, and it never lists items the world has.

## `inventory`

Inputs: none. Changes nothing. Items held and their quantities, nothing else.

```json
{ "items": { "item-a": 3, "item-b": 1 } }
```

Items with quantity zero are omitted. Keys are in ascending order.

## `look`

Inputs: none. Changes nothing. Returns a **preview**.

```json
{ "ok": true, "grid": [["a", null, null], [null, "b", null], [null, null, null]], "craftable": null }
```

`partial` appears (as `true` or `false`) only when the hint level is `partial`.

## `place`

Inputs: `item` (string), `row` (integer), `col` (integer). Moves one unit of `item` from the
inventory to the cell. Returns a preview.

Refusals: `out_of_bounds`, `unknown_item`, `cell_occupied`, `not_in_inventory`. When more than one
applies, the first in this order is reported.

## `remove`

Inputs: `row` (integer), `col` (integer). Moves the cell's item back to the inventory. Returns a
preview.

Refusals: `out_of_bounds`, `cell_empty`.

## `clear`

Inputs: none. Moves every table item back to the inventory. Returns a preview. Never refused.

## `craft`

Inputs: none. Commits the recipe the table currently matches.

```json
{ "ok": true, "crafted": { "item": "c", "qty": 1 } }
```

The table's items are consumed, the output is added to the inventory, and the table is empty. The
result does not repeat the preview.

Refusal: `nothing_to_craft` when no recipe matches. Nothing is consumed.

## Refusal shape

```json
{ "ok": false, "error": "cell_occupied", "message": "That cell already holds an item." }
```

| Code | When |
|---|---|
| `out_of_bounds` | Row or column outside the table |
| `cell_occupied` | `place` on a cell that already holds an item |
| `cell_empty` | `remove` on a cell that holds nothing |
| `not_in_inventory` | `place` of a defined item the agent holds none of |
| `nothing_to_craft` | `craft` when no recipe matches the table |
| `unknown_item` | `place` of an item id the world does not define |

Messages state the violated constraint. They never state how to fix it.

Arguments of the wrong type (a non-integer row, a missing item) are rejected by the tool's input
schema before the engine runs. The result has the error flag set and its text begins
`MCP error -32602: Input validation error`, not a JSON refusal. It is not a refusal and is not
logged.

## Guarantees

- Same world and same call sequence give identical results.
- `help`, `inventory` and `look` never change state.
- A refusal never changes state.
- No tool result contains a recipe, a solution, or a reference to the run log.
