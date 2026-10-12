# Provenance

- Start inventory 3 log: run 001 call 2 (also 002 call 2, 003 call 2).
- Log at (0,0) previews plank; craft gives 4 plank, log 3->2: run 001 calls 3-5.
- Two planks at (0,0),(1,0) preview rod; craft gives 2 rod: run 001 calls 11-13 (also 42-43); run 002 calls 11-14 shows plank 4->2.
- Second log craft gives 4 plank: run 001 calls 14-15.
- Three planks in row 0 preview seat; craft gives 1 seat: run 001 calls 16-18, 21-23. Inventory after: log 1, plank 3, rod 2, seat 1: run 001 call 24.
- Second rod craft from 2 planks: run 001 calls 41-43 (after seat). Inventory after: run 003 call 68 shows log 1, plank 1, rod 4, seat 1.
- Stool: seat (0,1), rods (1,0),(1,1),(1,2) previews wooden_stool: run 001 calls 55-59; run 002 calls 65-69; run 003 calls 69-73.
- Hazard null previews: 2x2 planks run 001 call 9; seat+rods layouts run 001 calls 25-39, 44-53; run 002 calls 32-47, 59-64; run 003 calls 63-66. Seat with rod/plank mix: run 001 call 19-20 (preview null).
- Seat cannot be placed twice: run 001 call 45 (not_in_inventory after one seat placed).
- Planks used 7 of 8: derived from the counts above.

## Uncited changes
- The ordering of step 5 (second rod craft after seat) follows run 001; runs 002/003 craft the rods earlier/later but all end with 4 rods. Craft count of 6 is the minimum those runs show; fewer was not shown to be impossible.
- Hazard bullet 1 (need 3 rods) is inferred from the stool layout using three rods from inventories, not an observed failure.

## Not known
- Whether other layouts (e.g. seat at other cells, other rod positions) also make a stool.
- Whether more or less than 3 rods, or a different rod craft layout (e.g. horizontal), works.
- Whether leftover items on the table are lost in a craft with extras (never tried).
- What a wrong craft does; no run crafted a non-matching layout.
