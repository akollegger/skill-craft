# Contract: world and goals files

Both are JSON. The server reads the world from the path in `SIM_WORLD`. Goals are read only by
tests, the solver command and the world generator; the engine never reads them.

## World file

```json
{
  "name": "forge",
  "description": "A small workshop with a single crafting table.",
  "grid": { "rows": 3, "cols": 3 },
  "hints": "exact",
  "stock": { "ore": 4, "wood": 3, "dust": 2 },
  "items": [
    { "id": "ore", "description": "A raw material." },
    { "id": "wood", "description": "A raw material." },
    { "id": "dust", "description": "A raw material." },
    { "id": "bar", "description": "A made item." },
    { "id": "frame", "description": "A made item." }
  ],
  "recipes": [
    {
      "id": "r-bar",
      "kind": "shapeless",
      "inputs": [{ "item": "ore", "qty": 2 }],
      "output": { "item": "bar", "qty": 1 }
    },
    {
      "id": "r-frame",
      "kind": "shaped",
      "pattern": [["bar", "bar"], ["wood", null]],
      "output": { "item": "frame", "qty": 1 }
    }
  ]
}
```

| Field | Rules |
|---|---|
| `name` | Non-empty string |
| `description` | String; returned by `help` |
| `grid` | `rows` and `cols`: positive integers; `rows * cols` within the limit |
| `hints` | `"exact"` or `"partial"`; optional, default `"exact"` |
| `stock` | Map of item id to positive integer; total within the limit; may omit made items |
| `items` | At least one; ids unique; ids match `^[a-z][a-z0-9_-]*$` |
| `recipes` | At least one; ids unique |

**Recipe** (`kind` selects the form; `output` is always `{ item, qty }` with a positive integer
`qty`):
- `shapeless`: `inputs`, a non-empty list of `{ item, qty }`. The sum of quantities must not exceed
  `rows * cols`.
- `shaped`: `pattern`, a non-empty rectangular array of rows; each cell is an item id or `null`; at
  least one cell is non-null. Empty border rows and columns are removed on load. The trimmed
  pattern must fit inside the table.

There is no `tasks`, `goals` or similar field. A file that contains one is rejected as an unknown
field.

**Load errors** are reported together as a list, each naming the recipe or item involved. Checks are
listed in [data-model.md](../data-model.md), World.

## Goals file

`<world>.goals.json`, next to the world file.

```json
{
  "goals": [
    { "item": "bar", "qty": 1, "note": "warm-up" },
    { "item": "frame", "qty": 1, "note": "needs an earlier intermediate" }
  ]
}
```

Each `item` must be defined in the paired world. `qty` is a positive integer. `note` is optional.

## Generated worlds

`scripts/make-world.ts` writes a re-skinned world and a goals file with the same base name, both
mapped to the new item names. The generated goals file has no `note` fields, because notes name
base items.
