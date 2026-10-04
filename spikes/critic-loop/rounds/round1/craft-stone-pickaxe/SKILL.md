---
name: craft-stone-pickaxe
description: Use when your goal is to hold a stone_pickaxe at the 3x3 crafting table. Gives the three-craft chain (oak_log, oak_planks, stick, stone_pickaxe) with exact items and cell coordinates that worked, and how to check each arrangement with the `craftable` field before crafting.
---

# Holding a stone_pickaxe

Recorded in 3 identical runs (same calls, same outputs). "run 001 call N" = that call in run 001; runs 002 and 003 match it call for call.

Grid is 3x3, zero-based, row 0 is the top, col 0 is the left (run 001 call 1). Starting inventory: cobblestone 6, iron_ingot 6, oak_log 3 (run 001 call 2). iron_ingot was never used.

## The chain that worked (three crafts, in this order)

Each craft was done with the table otherwise empty.

| # | Place (item at row,col) | `craftable` showed | craft gave | Source |
|---|---|---|---|---|
| 1 | oak_log at (0,0) | oak_planks | oak_planks x4 | run 001 calls 3, 4 |
| 2 | oak_planks at (0,0) and (1,0) | stick | stick x4 | run 001 calls 5-7 |
| 3 | cobblestone at (0,0), (0,1), (0,2); stick at (1,1) and (2,1) | stone_pickaxe | stone_pickaxe x1 | run 001 calls 8-13 |

Shape of craft 3:

```
cobblestone cobblestone cobblestone
.           stick       .
.           stick       .
```

Crafted items (oak_planks, stick) were placed straight after crafting, so they land in your inventory (run 001 calls 4-5, 7, 11).

## Verify before every craft

`place` returns `craftable`: the item craft would make now, or null (run 001 call 1 `preview`; seen in every place result). Only call `craft` when `craftable` names the item you want. In the recordings every craft was made only after `craftable` named its output.

Seen to give `craftable: null` (nothing matches yet): one oak_planks alone (run 001 call 5); one, two, or three cobblestone in row 0 (calls 8-10); three cobblestone plus one stick at (1,1) (call 11). So null just means "not yet"; keep adding.

## Not known (the recordings do not show these)

- Whether other arrangements work (mirrored, other columns or rows, planks side by side). Only the one above was tried per recipe.
- Whether quantities are exact or minimums (more logs, planks, cobblestone).
- What craft consumes beyond the tool's own wording "consumes everything on the table" (run 001 call 1). No inventory check followed any craft, so leftovers are unobserved. Check `inventory` after each craft if you need to know.
- What a wrong craft, a refused place, or an error looks like. No recorded run had one. `look`, `remove` and `clear` were never called.

If the chain above does not give `craftable: stone_pickaxe` in your world, do not craft. Use `look`, `place`, `remove` and `clear`, which the tool descriptions say change nothing permanent (run 001 call 1; `craft` is the only irreversible one), to try a variant, and craft only when `craftable` names what you want.

Finish: when `inventory` or the craft result shows stone_pickaxe x1, say so in one line and stop.
