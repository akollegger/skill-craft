# Quickstart: checking the sprite library by hand

Drawing is checked by eye, as the visualizer's other drawing is; the rules are tested.

1. **Tests first**: `pnpm test` and `pnpm typecheck` pass. The library, allocation, art-file, bundle and catalog tests are in `test/viz/`
   and the page's lookup is in `viz/test/art.test.ts`.
2. **Faithful world**: `pnpm dev:viz <folder with a minecraft-inspired run>`. Open the run. Every item on the table, in the output
   slot and in the held items is a drawing, not a geometric shape. A pickaxe in each material shares one shape and differs by color.
   In the list and the grid the goal thumbnail is the same drawing.
3. **Invented world**: open a run of a generated world (`worlds/generated/…`). Its items are geometric shapes and no two share a
   family and palette.
4. **Offline**: `pnpm dev scripts/viz-export.ts <folder> <dest>`, delete `worlds/<name>.art.json` and the library, open
   `<dest>` on a static host. The sprites are unchanged.
5. **Old bundle**: open a bundle exported before this feature. It opens with geometric shapes.
6. **Edit and rescan**: change one library sprite, reload. The thumbnail changes; a run's own table (from an earlier export) does
   not until it is exported again.
7. **Placeholders**: copy a world, rename its items `A`, `B`, `π`, write an art file mapping them to `letter-a`, `letter-b` and `pi`,
   and open a run: the table shows those letters.
8. **Bad files**: make the art file invalid JSON, then reference an unknown name. Runs still open; the affected items are geometric shapes.
