# Contract: world notes file

`<world>.notes.json`, next to `<world>.json` and `<world>.goals.json`. JSON.

```json
{
  "priorFit": "faithful",
  "inspiration": "Minecraft's crafting",
  "recipes": {
    "planks": "Planks from a log: one log makes four planks.",
    "sticks": "Sticks from two planks stacked in a column: four sticks.",
    "iron_pickaxe": "A pickaxe: three iron ingots across the top and two sticks down the centre."
  },
  "omissions": [
    "Gathering raw materials",
    "Smelting",
    "Tool durability and enchanting",
    "Recipes whose shape the game accepts mirrored",
    "Recipes that accept any of several materials: oak stands for every kind of wood"
  ]
}
```

A generated world's file:

```json
{ "priorFit": "invented", "derivedFrom": "worlds/minecraft-inspired.json" }
```

Rules are in [data-model.md](../data-model.md), World notes. Two readers:

- `loadNotes(path, world)` returns the parsed file or throws a `WorldError` listing every problem: a
  missing recipe note, a note for an unknown recipe, an unknown field, a faithful file lacking
  `inspiration` or `omissions`, an edition or version named.
- `priorFitOf(worldPath)` returns the declared prior fit, or `"undeclared"` when no notes file exists.
  A notes file that exists but is invalid is an error, not `undeclared`.

The server and the engine do not import this module.
