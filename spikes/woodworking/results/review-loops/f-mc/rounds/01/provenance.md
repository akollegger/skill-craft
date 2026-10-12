# Provenance

All three runs made identical calls 3-15 (calls 1-2 were help and inventory); outputs matched.

- Start inventory cobblestone 6, iron_ingot 6, oak_log 3: run 001 call 2 (same in runs 002, 003).
- Grid 3x3, zero-based, row 0 top: run 001 call 1.
- oak_log at (0,0) previews oak_planks; craft gives 4: run 001 calls 3-4 (and 8-9).
- Planks at (0,0) preview null; plus (1,0) previews stick; craft gives 4 sticks: run 001 calls 5-7.
- Top row of three planks previews oak_slab: run 001 call 12.
- Sticks at (1,1) (null) and (2,1) previews wooden_pickaxe; craft gives qty 1: run 001 calls 13-15.
- Same sequence in run 002 calls 3-15 and run 003 calls 3-15.

## Uncited changes
- "Slab wastes planks" and "2 planks left over / 6 in total" are inferred from quantities (4-2+4=6, minus 3), not shown directly. No run crafted the slab.
- "Do not spend logs on anything else" is advice inferred from the inventory of 3 logs.

## Not known
- Whether other layouts (e.g. different columns) make a pickaxe; only this one was tried.
- What a slab craft consumes or yields; what cobblestone and iron_ingot do.
- Whether sticks can be made from fewer planks or by another layout.
- Whether using one fewer log is possible (all runs used 2 logs).
