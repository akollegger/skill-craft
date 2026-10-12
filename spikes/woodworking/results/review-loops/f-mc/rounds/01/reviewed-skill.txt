---
name: wooden-pickaxe-crafting
description: Load when you must end up holding one wooden_pickaxe using only the craft tools (place, remove, clear, look, craft) at a 3x3 crafting table in a workshop.
---

Start inventory: cobblestone 6, iron_ingot 6, oak_log 3. Only oak_log is needed. Cells are (row, col), zero-based, row 0 at top. Craft consumes everything on the table, so craft only when the preview matches.

1. Place oak_log at (0,0). Preview: craftable "oak_planks". Craft: 4 oak_planks.
2. Place oak_planks at (0,0) (preview null), then oak_planks at (1,0). Preview: "stick". Craft: 4 sticks. (2 planks are left over.)
3. Place oak_log at (0,0). Preview: "oak_planks". Craft: 4 more oak_planks (6 in total).
4. Place oak_planks at (0,0), (0,1), (0,2). Preview after the third: "oak_slab". This is a trap: do NOT craft yet, the slab wastes planks.
5. Place stick at (1,1) (preview null), then stick at (2,1). Preview: "wooden_pickaxe".
6. Craft: 1 wooden_pickaxe. Done; stop.

Layout at the final craft:
```
row 0: planks planks planks
row 1: -      stick  -
row 2: -      stick  -
```

Hazards:
- Craft only crafts what the table matches at that moment; check `craftable` in the preview first.
- With three planks across the top row, the preview reads oak_slab until the sticks are placed; keep going.
- Only 3 logs exist and 2 are used; do not spend logs on anything else.
