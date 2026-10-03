# Where each fact comes from

Not needed to use the skill. Kept for audit. Source: three identical recorded runs (stone-001 to 003); "run 001
call N" is that call in run 001, and runs 002 and 003 match it call for call.

- Grid is 3x3, zero-based, row 0 top, col 0 left: run 001 call 1. Starting inventory cobblestone 6, iron_ingot 6,
  oak_log 3: call 2. iron_ingot was never used.
- Craft 1 (oak_log at (0,0) -> oak_planks x4): calls 3, 4.
- Craft 2 (oak_planks at (0,0), (1,0) -> stick x4): calls 5-7.
- Craft 3 (cobblestone (0,0),(0,1),(0,2); stick (1,1),(2,1) -> stone_pickaxe x1): calls 8-13.
- `craftable` is present in every place result; every craft was made only after it named its output.
- `craftable: null` appeared: one oak_planks alone (call 5); one to three cobblestone in row 0 (calls 8-10); three
  cobblestone plus one stick at (1,1) (call 11).
- "craft consumes everything on the table": the tool's description, call 1. Each craft was done on an empty table.
- Not shown by the recordings: other arrangements, exact vs minimum quantities, what is left after a craft (no
  inventory call followed a craft), what a refused place or a wrong craft looks like, what remove and clear do
  (never called). Sticks crafted at call 7 were first placed at call 11, so crafted items were available later,
  which suggests craft puts them in the inventory; not confirmed.
