---
name: mcp-craft-tool-use
description: Load when you must end up holding a wooden_pickaxe using the workshop's 3x3 crafting table (help/inventory/look/place/remove/clear/craft tools) starting from oak_log. Gives the exact log -> planks -> sticks -> pickaxe recipe and grid layouts.
---

# wooden_pickaxe on the 3x3 workshop table

Recipes are shaped by position, and one oak_log is enough for two intermediate crafts. A proven 15-call path starts with inventory of 6 cobblestone, 6 iron_ingot, 3 oak_log. It uses only 2 logs; the third is spare.

## Use
When the goal is wooden_pickaxe (or its planks/sticks intermediates) on this table.

## Steps
Coordinates are (row, col), zero-based, with row 0 at the top. Before each craft, check that the `craftable` field in the place/look output names what you want.

1. Place 1 oak_log at (0,0). `craftable` shows oak_planks. Craft: you get 4 oak_planks.
2. Place oak_planks at (0,0) and (1,0), stacked vertically. `craftable` shows stick. Craft: you get 4 sticks. A single plank previews null.
3. The table is empty after each craft. Place the second oak_log at (0,0) and craft: you get 4 more oak_planks. You now hold 2 planks (left over from step 2) and 4 new ones.
4. Place oak_planks at (0,0), (0,1) and (0,2). `craftable` shows oak_slab. This is the wrong item, so do not craft; keep building.
5. Place a stick at (1,1) and a stick at (2,1). `craftable` shows wooden_pickaxe. Craft: you get 1 wooden_pickaxe, and the task is done.

## Notes
- `craftable` is null for partial layouts (for example 1 or 2 planks in a row). That does not mean you are on the wrong path.
- If a layout previews the wrong item, use remove or clear. Both are free; only craft consumes items.
