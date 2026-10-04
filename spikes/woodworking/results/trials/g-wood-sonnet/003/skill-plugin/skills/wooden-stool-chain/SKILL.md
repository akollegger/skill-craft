---
name: wooden-stool-chain
description: Load when you must end up holding one wooden_stool at a 3x3 crafting table (workbench) that starts you with 3 logs.
---

# Wooden stool: shortest chain (6 crafts)

You start with 3 logs. Grid cells are (row, col), zero-based, row 0 at top. Craft consumes everything on the table, so place the exact pattern, check the preview, then craft.

1. Place 1 log at (0,0). Preview: `plank`. Craft: 4 plank. (log 3 -> 2)
2. Place plank at (0,0) and (1,0), nothing else. Preview: `rod`. Craft: 2 rod. (uses 2 plank; 2 plank left)
3. Place 1 log at (0,0). Preview: `plank`. Craft: 4 plank. (6 plank, 2 rod)
4. Place plank at (0,0), (0,1), (0,2). Preview: `seat`. Craft: 1 seat. (3 plank left)
5. Place plank at (0,0) and (1,0). Preview: `rod`. Craft: 2 rod. (now 4 rod, 1 plank, 1 log, 1 seat)
6. Place seat at (0,1) and rod at (1,0), (1,1), (1,2). Preview: `wooden_stool`. Craft: 1 wooden_stool. Done.

Whole chain needs: 2 logs -> 8 plank (7 used: 3 for seat, 4 for two rod crafts), 3 rods (two crafts give 4), 1 seat.

Hazards
- Two rods are not enough for the stool; craft rods twice (steps 2 and 5).
- Previews of `null` mean the layout matches nothing. These all previewed null: 2x2 planks; plank, plank with rod beneath; seat with rods at (1,0),(1,2); seat at (1,1) with rods at (2,0),(2,2); seat at (0,1) with rods at (1,1),(2,1); seat at (0,0) with rods at (1,0),(2,0); rods at the four corners of a ring with the seat in the middle or top; seat (0,1) with rods (1,0),(1,1) only.
- Only one seat exists; you cannot place it in two cells.
- A rod craft takes both planks and gives only two rods (planks 4 -> 2).
