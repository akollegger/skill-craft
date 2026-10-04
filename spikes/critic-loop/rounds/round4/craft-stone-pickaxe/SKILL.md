---
name: craft-stone-pickaxe
description: Use when your goal is to hold a stone_pickaxe at the 3x3 crafting table. Gives the three-craft chain that worked (oak_log, oak_planks, stick, stone_pickaxe) with exact cell coordinates, and how to check each arrangement with `craftable` before crafting.
---

# Holding a stone_pickaxe

**Capability.** The recipe chain for a stone_pickaxe at the 3x3 table: three crafts, in order.

**When to use it.** Your goal is to hold a stone_pickaxe.

## How to use it

Cells are (row, col), zero-based, row 0 at the top. Start each craft with an empty table (`clear` if needed): craft uses up everything on it.

1. Place `oak_log` at (0,0). `craftable` shows `oak_planks`. `craft` gives 4 oak_planks.
2. Place `oak_planks` at (0,0) and (1,0). `craftable` shows `stick`. `craft` gives 4 sticks.
3. Place `cobblestone` at (0,0), (0,1), (0,2) and `stick` at (1,1), (2,1). `craftable` shows `stone_pickaxe`. `craft` gives 1 stone_pickaxe.

```
cobblestone cobblestone cobblestone
.           stick       .
.           stick       .
```

Only call `craft` when `craftable` names the item you want. `craftable: null` means nothing matches yet; keep placing.

If `craftable` does not show the expected item, do not craft. Use `look`, `place`, `remove` and `clear` to try a variant, and craft only when `craftable` names what you want. Other arrangements and quantities were not tested; only the one above is known to work.

Done when you hold 1 stone_pickaxe: say so in one line and stop.
