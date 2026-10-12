---
name: wooden-pickaxe-crafting
description: Load when you must end up holding one wooden_pickaxe at the 3x3 workshop crafting table using only help, inventory, look, place, remove, clear and craft. Gives the verified recipe chain (log, planks, sticks, pickaxe) and layouts.
---

Wooden pickaxe layout (3x3 table, cells are (row, col), zero-based, row 0 top):

```
row 0: planks planks planks
row 1: -      stick  -
row 2: -      stick  -
```
Crafting this gives 1 wooden_pickaxe.

Prerequisite recipes (each verified):
- 1 oak_log alone on the table (any cell tried: (0,0)) -> craft gives 4 oak_planks.
- 2 oak_planks stacked vertically at (0,0) and (1,0) -> craft gives 4 sticks.

Start inventory: cobblestone 6, iron_ingot 6, oak_log 3. Cobblestone and iron_ingot are not needed. The chain uses 2 logs.

Craft consumes everything on the table, and crafted items go to your inventory, so after each craft the table is empty and you must place items again.

Steps:
1. Place oak_log (0,0); craft -> 4 planks.
2. Place planks at (0,0) and (1,0); craft -> 4 sticks (2 planks remain).
3. Place oak_log (0,0); craft -> 4 more planks (6 total).
4. Place planks at (0,0), (0,1), (0,2). The preview says "oak_slab" here; that is only an intermediate match, so do not craft.
5. Place sticks at (1,1) and (2,1). Preview becomes "wooden_pickaxe". Craft. Done.

Notes:
- The preview `craftable` is null for partial layouts (e.g. one plank alone); this is normal. Craft only when it names what you want.
- Placing one unit per call; check `craftable` after each place.
