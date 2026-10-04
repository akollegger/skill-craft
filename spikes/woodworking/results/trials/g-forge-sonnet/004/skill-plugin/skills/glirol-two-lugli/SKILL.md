---
name: glirol-two-lugli
description: Load when you must end up holding one glirol at the 3x3 crafting table (tools help, inventory, look, place, remove, clear, craft) in the braevin-7 workshop.
---

Start stock: doudrur 3, lugli 4, tepitil 4, thegen 4. Grid is 3x3, zero-based, row 0 at top.

## Shortest path (4 tool calls after help)

1. Make sure the table is empty (`clear` if needed).
2. `place` lugli at row 0, col 0. Preview shows craftable "naeviozhum". Do NOT craft it.
3. `place` lugli at row 0, col 1. Preview should now show craftable "glirol".
4. `craft`. Result: glirol, qty 1. You hold it; stop.

If the preview at step 3 is not "glirol", `clear` and redo steps 2-3 exactly.

## Do not add anything else

- A third lugli at (0,2) turns the preview to null.
- doudrur, thegen or tepitil added beside the two lugli turns the preview to null.

## Crafts that did not help (they use up stock)

- One doudrur alone (e.g. at 0,0): preview "glavruzael". Crafting gave 2 glavruzael and used 1 doudrur.
- One lugli alone: preview "naeviozhum". Crafting gave 3 naeviozhum and used 1 lugli.
- tepitil at (0,0), thegen at (0,1), tepitil at (1,0): preview "drinefoun". Crafting gave 2 drinefoun and used those 3 items.

None of glavruzael, naeviozhum or drinefoun combined into anything on the table (every mix tried previewed null). Intermediates are not needed for glirol.

## Reading the preview

`craftable` after each place/remove is what `craft` would make now. Only craft when it says "glirol". craft is irreversible and consumes everything on the table.
