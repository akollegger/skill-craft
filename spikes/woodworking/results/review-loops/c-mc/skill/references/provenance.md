# Provenance

Sources: runs 001, 002 and 003. All three followed the identical 15-call path and ended with crafted wooden_pickaxe qty 1.

- Starting inventory (6 cobblestone, 6 iron_ingot, 3 oak_log): run 001 call 2.
- 1 oak_log gives 4 oak_planks: run 001 calls 3-4.
- 2 planks stacked at (0,0) and (1,0) give 4 sticks: run 001 calls 5-7. One plank alone previews null (call 5).
- A second log gives 4 more planks: run 001 calls 8-9.
- Planks at row 0 preview oak_slab: run 001 call 12.
- Sticks at (1,1) and (2,1) below the planks preview wooden_pickaxe, and craft gives 1: run 001 calls 13-15.
- Runs 002 and 003 repeat the same calls and results.

Not known (cheap ways to find out):
- Whether other cells work for the log or other layouts for planks and sticks: use place and read `craftable` (free).
- Whether the pickaxe layout can be mirrored or shifted: try it with place and look.
- Whether cobblestone or iron_ingot craft anything useful here: they were never used. Place them and read `craftable`.
- Whether the final inventory shows the pickaxe: the runs never called inventory after crafting. Call inventory to check.
- What happens when a layout is wrong and you craft anyway: never tried, so it is not known.

## Change record

Every change, with the sources the harness checked against the recordings.

- Replaced the generic boilerplate with the full recipe chain: log -> 4 planks, 2 stacked planks -> 4 sticks, second log -> 4 planks, and the pickaxe layout (planks on row 0, sticks at (1,1) and (2,1)).: run 001 call 3, run 001 call 4, run 001 call 6, run 001 call 7, run 001 call 9, run 001 call 14, run 001 call 15
- Added the starting inventory and the log budget (2 of 3 logs used).: run 001 call 2
- Added a note that the craftable preview can show the wrong item (oak_slab for 3 planks in a row) or null for partial layouts.: run 001 call 5, run 001 call 12
- Removed the unshown claim that inventory is checked at the end, the reference-file pointers and the generic advice. Rewrote the description to name wooden_pickaxe, the 3x3 table and the recipe chain.: no source
- Replaced the provenance file with run citations and an explicit list of what is not known.: no source

## Uncited changes

These changes have no recorded source.

- Removed the unshown claim that inventory is checked at the end, the reference-file pointers and the generic advice. Rewrote the description to name wooden_pickaxe, the 3x3 table and the recipe chain. (Those claims were unsupported or generic, and the old description was vague.)
- Replaced the provenance file with run citations and an explicit list of what is not known. (Rule 4 puts sources and unknowns in the provenance file.)
