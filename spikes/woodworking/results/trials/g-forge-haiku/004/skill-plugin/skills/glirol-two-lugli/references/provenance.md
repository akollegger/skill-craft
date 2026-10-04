# Provenance

- Start stock doudrur 3, lugli 4, tepitil 4, thegen 4: run 001 call 2; run 002 call 2.
- 3x3 grid, zero-based, row 0 top: run 001 call 1.
- Lugli at (0,0) previews "naeviozhum": run 001 call 172 (also call 14, 54); run 002 call 98 (also call 6).
- Second lugli at (0,1) previews "glirol": run 001 call 173; run 002 call 99.
- Craft gives glirol qty 1: run 001 call 182; run 002 call 102.
- Third lugli at (0,2) previews null: run 001 call 176.
- Other items added next to the two lugli preview null: doudrur run 001 call 174; thegen call 178; tepitil call 180; run 002 call 100 (third lugli placed at (1,0), null).
- Lone doudrur previews glavruzael; craft gives qty 2: run 001 calls 3, 13; run 002 calls 3, 14, 13. Inventory afterwards doudrur 2: run 001 call 16.
- Lone lugli craft gives naeviozhum qty 3; lugli 3 afterwards: run 001 calls 14, 15, 16; run 002 calls 16, 17, 18.
- drinefoun: tepitil (0,0), thegen (0,1), tepitil (1,0) previews drinefoun (run 001 call 61); crafted qty 2 (run 001 call 64). Also row layout tepitil, thegen, tepitil previews drinefoun (run 001 call 152).
- glavruzael / naeviozhum / drinefoun combos and many other pairs preview null: run 001 calls 17-20, 22-43, 65-98, 110-169; run 002 calls 19-25, 45-60, 79-80.

## Uncited changes

- "Used those 3 items" for drinefoun is inferred from the rule that craft consumes the table (run 001 call 64 shows craft; no inventory call afterward).
- "Do NOT craft naeviozhum" and "Intermediates are not needed" are my inference: both runs reached glirol from raw lugli only, and every intermediate mix tried previewed null.
- The runs differ: run 001 also crafted drinefoun; run 002 did not. Both crafted glavruzael and naeviozhum before finding glirol.

## Not known

- Whether other cells (e.g. (0,0)+(1,0), or any non-adjacent pair) also make glirol; only (0,0)+(0,1) was observed to.
- Whether the glirol recipe cares about the order or absolute position; not tested.
- Whether anything else can be crafted; no other recipe was found.
- Whether the table must be otherwise empty (it was in both successful crafts).
