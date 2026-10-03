---
name: craft-stone-pickaxe
description: Use when you need a stone_pickaxe, oak_planks or sticks at the 3x3 crafting table. Gives the three-craft chain that worked (oak_log, oak_planks, stick, stone_pickaxe) with exact cell coordinates, and how to check each arrangement with `craftable` before crafting.
---

# Holding a stone_pickaxe

In short: craft oak_log into oak_planks, two oak_planks into sticks, then three cobblestone over two sticks into the pickaxe. Exact placements below.

Recorded in 3 identical runs (same calls, same outputs). "run 001 call N" = that call in run 001; runs 002 and 003 match it call for call. These are facts about this table's world; another world's recipes may differ.

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

The oak_planks crafted at call 4 were placed at call 5. The sticks crafted at call 7 were first placed at call 11, after three cobblestone placements (calls 8-10). Crafted items were therefore available to `place` later, which suggests craft puts them in your inventory. No `inventory` call followed any craft, so this is not confirmed.

## Verify before every craft

`place` returns `craftable`: the item craft would make now, or null (run 001 call 1 `preview`; present in every place result). Only call `craft` when `craftable` names the item you want. In the recordings every craft was made only after `craftable` named its output.

`craftable: null` appeared while the table did not yet match anything: one oak_planks alone (run 001 call 5); one, two or three cobblestone in row 0 (calls 8-10); three cobblestone plus one stick at (1,1) (call 11). In every recorded case more items were added next. No null that stayed null was observed, so do not read null as "impossible".

## Not known (the recordings do not show these)

- Whether other arrangements work (mirrored, other columns or rows, planks side by side). Only the one above was tried per recipe.
- Whether fewer or more of an item would also work. The amounts that did work are shown: 1 oak_log, 2 oak_planks, 3 cobblestone with 2 sticks (calls above). What is left in your inventory after a craft was never checked; the tool says craft "consumes everything on the table" (run 001 call 1). The start of 3 oak_log and 6 cobblestone limits how many times a step can be repeated. Check `inventory` after each craft if you need the counts.
- What a wrong craft, a refused place, or an error looks like. No recorded run had one.
- What `remove` and `clear` do in practice. They were never called.

If the chain above does not give `craftable: stone_pickaxe` in your world, do not craft. `look` changes nothing, and the tool descriptions say `place`, `remove` and `clear` only move items between your inventory and the table, with `craft` the only tool described as irreversible (run 001 call 1). So use them to try a variant, and craft only when `craftable` names what you want.

Finish: when `inventory` or the craft result shows stone_pickaxe x1, say so in one line and stop.
