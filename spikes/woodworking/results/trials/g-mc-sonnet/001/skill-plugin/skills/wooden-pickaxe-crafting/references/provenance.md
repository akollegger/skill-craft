# Provenance

All three runs made identical calls 3-15 (calls 1-2 were help and inventory); outputs matched.

- Start inventory cobblestone 6, iron_ingot 6, oak_log 3: run 001 call 2 (same in runs 002, 003).
- Grid 3x3, zero-based, row 0 top: run 001 call 1.
- oak_log at (0,0) previews oak_planks; craft gives 4: run 001 calls 3-4 and 8-9.
- Planks at (0,0) preview null; plus (1,0) previews stick; craft gives 4 sticks: run 001 calls 5-7.
- Top row of three planks previews oak_slab: run 001 call 12.
- Sticks at (1,1) (null) and (2,1) previews wooden_pickaxe; craft gives qty 1: run 001 calls 13-15.
- Same sequence in run 002 calls 3-15 and run 003 calls 3-15.
- Table is empty after craft (re-placing is needed): run 001 calls 4-5, 9-10.

## Inferred, not directly shown
- 2 planks remain after sticks, 6 total after second log: arithmetic (4-2+4).
- Cobblestone and iron_ingot unused: no run used them.

## Not known
- Whether other layouts or other cells make a pickaxe or planks/sticks; only this one was tried. Cheap check: place and read `craftable` without crafting.
- What an oak_slab craft consumes or yields (never crafted); whether it wastes planks.
- What cobblestone and iron_ingot craft into.
- Whether fewer logs suffice (all runs used 2).

## Change record

Every change, with the sources the harness checked against the recordings.

- Led SKILL.md with the final pickaxe layout and the two prerequisite recipes, then the steps: run 001 call 14, run 001 call 15, run 001 call 4, run 001 call 7
- Removed the claim that the slab wastes planks; now says slab preview is only an intermediate match, do not craft: run 001 call 12
- Removed 'do not spend logs' advice; noted cobblestone and iron_ingot unused (inferred, listed in provenance): run 001 call 2
- Added note that preview null at partial layouts is normal and table is empty after craft so items must be re-placed: run 001 call 5, run 001 call 10, run 001 call 11
- Provenance: added not-known items with cheap checks and the re-place citation: no source

## Uncited changes

These changes have no recorded source.

- Provenance: added not-known items with cheap checks and the re-place citation (Rules 2 and 4)
