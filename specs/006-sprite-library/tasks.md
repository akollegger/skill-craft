# Tasks: A Sprite Library for the Visualizer

**Input**: Design documents from `/specs/006-sprite-library/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/art.md](contracts/art.md), [quickstart.md](quickstart.md)

**Tests**: Included. Principle IV and FR-011 require the tests before the library, the resolver and the allocator. Write each group's tests first and confirm they fail. Drawing is checked by eye (quickstart); tasks marked **(manual)** are those checks.

**Organization**: Grouped by user story. Shared groundwork (the moved glyph tables, the wire contract, the allocator and the sprite form) is in Phase 2. Within a story the backend (`src/viz/`) comes before the page (`viz/`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: The user story the task serves (US1 to US4)

## Path Conventions

Backend: `src/viz/`, `src/harness/`, `test/viz/`. Page: `viz/src/`, `viz/test/`. Backend imports use the `.js` extension (NodeNext); the page uses the bundler resolution of `viz/tsconfig.json` and `.ts` extensions. The faithful world's items are `oak_log`, `cobblestone`, `iron_ingot`, `oak_planks`, `stick`, `crafting_table`, `oak_slab` and a wooden, stone and iron pickaxe and sword; its `world.name` is `workshop`.

---

## Phase 1: Setup

- [X] T001 Run `pnpm typecheck` and `pnpm test` on the branch and note the passing count, so later phases can show nothing regressed
- [X] T002 Add `src/**/*.json` to `include` in `tsconfig.build.json` and check that `pnpm build` copies a JSON file placed in `src/viz/art/` into `dist/viz/art/` (research R2); remove the probe file afterwards

**Checkpoint**: baseline recorded; a build carries JSON.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: One shared definition of the glyphs, the wire shape in the contract, the allocator and the sprite form. Every story reads through these.

**⚠️ CRITICAL**: No story starts until this phase is complete.

- [X] T003 [P] Write `test/viz/glyphs.test.ts` (must fail first): `src/viz/glyphs.ts` exists and imports nothing from `node:*` (read the file, as `test/viz/contract.test.ts` does for the contract); `glyphOf` is deterministic, its `family`, `variant` and `palette` are in range, its two marks are distinct and index body pixels of the chosen variant; a constant for the palette count equals 8
- [X] T004 Create `src/viz/glyphs.ts` (depends on T003): move `FAMILIES`, `hashName`, the seeded generator and `glyphOf` out of `viz/src/art/glyphs.ts` and `viz/src/art/sprite.ts`, and export the palette count; make `viz/src/art/sprite.ts` and `viz/src/art/index.ts` import and re-export them so existing page code and `viz/test/art.test.ts` pass unchanged; add a page test that `PALETTES.length` equals the shared palette count
- [X] T005 [P] Extend `test/viz/contract.test.ts` and `test/viz/contract-types.test.ts` (must fail first): a `worldArtSchema` accepts the shapes in [contracts/art.md](contracts/art.md) and rejects rows that are not eight strings of eight characters, a row character that is not a key of `legend`, a glyph entry with `family`, `variant` or `palette` out of range or marks that are not two distinct integers 0 to 31; the manifest and the catalog accept an optional `art`, and a manifest or catalog without it still parses; `ManifestData` and `BundleManifest` stay type-compatible with `art`
- [X] T006 Add `worldArtSchema` and the optional `art` fields to `manifestSchema` and `catalogSchema` in `src/viz/contract.ts`, and `art?` to `BundleManifest` in `src/harness/bundle.ts` (depends on T004, T005)
- [X] T007 [P] Write `test/viz/art-sprite.test.ts` (must fail first): an internal sprite (eight rows of eight palette names or `null`) becomes wire rows over a legend assigned in sorted order of the names present (`a`, `b`, …, `.` for transparent); the same sprite gives the same rows whatever else is in the world art; merging two world art objects with different palettes gives rows identical to building from the union; a sprite that is not 8 by 8 is rejected
- [X] T008 [P] Write `test/viz/art-allocate.test.ts` (must fail first): an item whose own pair is free gets exactly `glyphOf(name)`; a taken pair moves to `(pair + 9) mod 64` and repeats; the walk visits all 64 pairs; 12 items get 12 distinct family-and-palette pairs; the result is the same for any order of the item list; past 64 items pairs repeat and the marks separate them; the assignment for a fixed list of names is pinned in a snapshot
- [X] T009 Create `src/viz/art/world-art.ts` (sprite form, wire conversion and merge) and `src/viz/art/allocate.ts` (depends on T004, T006), making T007 and T008 pass

**Checkpoint**: the glyph tables are one file, the wire shape compiles in both projects, allocation is pinned.

---

## Phase 3: User Story 1 - Recognise items in a faithful world (Priority: P1) 🎯 MVP

**Goal**: A run of the faithful world shows drawn pictures on the table, in the output slot, in the held items and in its goal thumbnail.

**Independent Test**: open one run of the faithful world; 13 of 13 items are drawn pictures, and the thumbnail of the goal is the same picture (spec Story 1, SC-001, SC-004, quickstart 2).

### Tests for User Story 1 (write first, confirm they fail)

- [ ] T010 [P] [US1] Write `test/viz/art-library.test.ts`: the committed `src/viz/art/library.json` has `format` 1; every `legend` value is a name exported by `viz/src/palette.ts` or `null`; `m` and `M` are not legend keys; every sprite is 8 by 8; names are unique and lowercase kebab-case; no two resolved sprites share a pixel pattern (the pickaxes differ by material); a reference resolves for a sprite name and for `shape/material`, and not for an unknown name, an unknown material or a shape without a material; a malformed or missing library is read as empty without throwing
- [ ] T011 [P] [US1] Write `test/viz/art-file.test.ts`: the art file's path is the world's path with `.art.json`; references and inline rows both resolve, the `legend` is needed only for inline rows; a malformed file is ignored whole; an item the world lacks, an unknown reference and a row of the wrong size each drop that entry only; nothing from the file's text appears in the output
- [ ] T012 [P] [US1] Write `test/viz/art-faithful.test.ts`: every item of `worlds/minecraft-inspired.json` resolves to a drawn sprite (13 of 13) and none is a generated glyph; the three pickaxes (and the three swords) share one shape and differ by color; a run's world art covers exactly the items its frames and goal use
- [ ] T013 [P] [US1] Extend `test/viz/bundle-build.test.ts`, `test/export.test.ts` and `test/privacy.test.ts`: `buildBundle` puts `art` in the manifest for exactly the items of the frames and goal, and nothing else (no library name, path, recipe or item the run did not use); `exportBundle` writes the same manifest bytes the server supplies; a bundle made before this feature still reads with `readBundle`
- [ ] T014 [P] [US1] Extend `test/viz/catalog.test.ts` and `test/viz/parity.test.ts`: the catalog's `art` is keyed by world name, holds the union of its ready runs' items, and where two runs of one world differ the run first in catalog order supplies the item; it is omitted when no ready run has art; editing the art file, the library file or the world file changes a run's cache key so the next scan rebuilds it; the catalog's sprite for a goal item equals the one in the same run's bundle; no payload names an item no run of the world used
- [ ] T015 [P] [US1] Write `viz/test/world-art.test.ts`: a drawn entry expands through the palette to eight rows of eight pixels, with a legend name the page does not know drawn transparent; a glyph entry gives the sprite the name-only art gives when its family, variant and palette are the name's own; an item missing from the art, or no art at all, falls back to the name-only sprite; the thumbnail's sprite for a goal equals the scene's for the same item

### Implementation for User Story 1

- [ ] T016 [US1] Create `src/viz/art/library.ts` (read the file at scan time, validate with zod, resolve a reference to a sprite, empty on malformed), making T010's resolution cases pass (depends on T009)
- [ ] T017 [US1] Create `src/viz/art/library.json` with the faithful world's nine original drawings: `log`, `cobblestone`, `ingot`, `planks`, `stick`, `crafting-table`, `slab`, and the shapes `pickaxe` and `sword` with materials `wooden`, `stone` and `iron`; drawings copy no game's textures (ADR-005 2.6), making T010's file checks pass
- [ ] T018 [US1] Create `src/viz/art/art-file.ts` (path, read, validate, drop bad entries), making T011 pass (depends on T016)
- [ ] T019 [US1] Create `worlds/minecraft-inspired.art.json` mapping `oak_log` to `log`, `cobblestone`, `iron_ingot` to `ingot`, `oak_planks` to `planks`, `stick`, `crafting_table` to `crafting-table`, `oak_slab` to `slab`, and each wooden, stone and iron pickaxe and sword to `pickaxe/…` and `sword/…`, making T012 pass
- [ ] T020 [US1] Extend `src/viz/art/world-art.ts` with building one run's world art from the world, its file path and the items its frames and goal use (resolve, then allocate the rest, then convert to the wire form), and with the per-world merge for the catalog; call it from `buildBundle` in `src/harness/export.ts`; make T013 pass (depends on T018, T019)
- [ ] T021 [US1] In `src/viz/catalog.ts` add the per-world `art` map (first run in catalog order wins) and extend `worldStamp` with the art file's and the library's modification times, making T014 pass (depends on T020)
- [ ] T022 [P] [US1] Extract a drawing function from a glyph in `viz/src/art/sprite.ts`, then create `viz/src/art/world-art.ts` (expand a world art object into an `ItemArt`, falling back to `defaultItemArt` for an item or a whole object that is missing) and export it from `viz/src/art/index.ts`, making T015 pass
- [ ] T023 [US1] Add `art?: ItemArt` to the scene factory's options in `viz/src/scene/handle.ts`, pass it through `viz/src/scene/pool.ts`, and use it in `viz/src/scene/TableScene.ts` in place of the factory argument when given; make `RunView.svelte` pass the art built from `bundle.manifest.art` when it makes its scene; extend `viz/test/runview.test.ts` so the stub factory is shown to receive the bundle's art (research R8)
- [ ] T024 [US1] Make `viz/src/shell/Thumbnail.svelte` take its art from the catalog's per-world map by the run's `world` attribute and goal, through `Row.svelte` and `Tile.svelte` and `viz/src/App.svelte`; extend `viz/test/picker.test.ts` and `viz/test/app.test.ts` so a thumbnail's art is the world's when the catalog has it and the name-only glyph when it does not
- [ ] T025 [US1] **(manual)** Open a faithful-world run in `pnpm dev:viz` and check quickstart step 2: every item is a drawing on the table, in the output slot, in the held items and in the goal thumbnail of the list and the grid; the three pickaxes differ by color

**Checkpoint**: Story 1 works alone. This is the MVP.

---

## Phase 4: User Story 2 - Tell items apart in any world (Priority: P2)

**Goal**: Items without drawn art get distinct generated shapes in every committed world, and the same item looks the same everywhere.

**Independent Test**: open runs of a generated world and check that its items differ at a glance and that a goal thumbnail matches the table (spec Story 2, SC-002, quickstart 3).

### Tests for User Story 2

- [ ] T026 [P] [US2] Write `test/viz/art-worlds.test.ts`: for every world file under `worlds/` and `worlds/generated/` every item resolves to a sprite; in each world of 64 items or fewer no two items share a family-and-palette pair and no two share a pixel pattern; a world with a partial art file keeps its drawn items and allocates the rest without colliding with each other; the same world scanned twice gives identical art; the assignments for the committed worlds are pinned in a snapshot so a change is deliberate
- [ ] T027 [P] [US2] Extend `viz/test/world-art.test.ts` with glyph entries that moved off their name's own pair: the expanded sprite uses the allocated family and palette with the name's variant and marks, and differs from the name-only sprite only where the allocation moved it

### Implementation for User Story 2

- [ ] T028 [US2] Make T026 and T027 pass: fix `src/viz/art/world-art.ts` and `viz/src/art/world-art.ts` where they do not (the foundation and Story 1 should already carry most of it); if a committed world has a collision the pinned order does not resolve, record it in research R5 before changing the order
- [ ] T029 [US2] **(manual)** Open a generated-world run and check quickstart step 3; note in `design/notes/pixel-visualizer.md` any pair of items that still read alike at 2x

**Checkpoint**: Stories 1 and 2 both work.

---

## Phase 5: User Story 3 - Add art to a new world by naming sprites (Priority: P3)

**Goal**: A designer maps item names, literal or placeholder, to library sprites in one file, and the library holds batch 1 of the starter set.

**Independent Test**: an art file naming two library sprites and drawing one inline shows all three, and a world with items `A`, `B` and `π` maps to letters (spec Story 3, FR-003, FR-012, SC-006, SC-007, quickstart 7 and 8).

### Tests for User Story 3

- [ ] T030 [P] [US3] Extend `test/viz/art-library.test.ts` with a hard-coded list of the batch 1 names from ADR-005 2.6 (the faithful 9, tools 16, containers and materials 20, food 23, symbols 47) and assert each resolves, so the library tasks below fail until their drawings exist
- [ ] T031 [P] [US3] Write `test/viz/art-placeholder.test.ts` with a fixture world whose items are `A`, `B` and `π`: an art file mapping them to `letter-a`, `letter-b` and `pi` shows those sprites; an item named `wrench` mapped to `letter-a` shows `letter-a` (a name is never interpreted); a mix of references, inline rows and omitted items resolves each as written; an unknown reference falls back to a generated glyph and the run still opens; an invalid art file gives generated glyphs for the whole world and no error text in the catalog

### Implementation for User Story 3 (batch 1 drawings; each group is its own file section and can be done in parallel)

- [ ] T032 [US3] Write a test and then `scripts/art-sheet.ts <dest.html>`: it writes a standalone contact sheet of `src/viz/art/library.json` (every sprite, and every shape in each of its materials, at 1x and 4x with its name, on the table's wood and on the dark backdrop) to a path outside the repository; the test checks the sheet names every library entry; the sheet is how drawings are checked by eye (research R9)
- [ ] T033 [US3] Create `src/viz/art/CREDITS.md` (research R9): a table of the sprites that started from a reference, with source, licence and the statement of modification, and the Apache 2.0 attribution for Noto Emoji; add a test that every credited name exists in the library
- [ ] T034 [P] [US3] Add the tools to `src/viz/art/library.json`, each started from a Noto emoji where one exists and redrawn by hand at 8 by 8 (record it in `CREDITS.md`): `hammer/`, `axe/`, `shovel/`, `hoe/` (shapes with materials), `saw`, `wrench`, `screwdriver`, `pliers`, `scissors`, `knife`, `paintbrush`, `ruler`, `ladder`, `toolbox`, `nut-and-bolt`, `gear`
- [ ] T035 [P] [US3] Add containers and basic materials, started from references and redrawn by hand as above: `box`, `crate`, `barrel`, `chest`, `bag`, `bottle`, `jar`, `bowl`, `cup`, `bucket`, `rope`, `cloth`, `paper`, `scroll`, `book`, `coin`, `gem`, `crystal`, `leaf`, `flame`
- [ ] T036 [P] [US3] Add food, started from references and redrawn by hand as above (no Noto emoji exists for `dough`, `flour` or `batter`; draw those from general knowledge): `wheat`, `egg`, `milk`, `butter`, `cheese`, `salt`, `sugar`, `tomato`, `bell-pepper`, `chili-pepper`, `steak`, `chicken-leg`, `bacon`, `fish`, `flour`, `dough`, `bread`, `pizza`, `omelet`, `pancake`, `cake`, `cookie`, `soup`; check `pizza`, `cake` and `cookie` at 2x so the round dishes do not read alike
- [ ] T037 [P] [US3] Generate the placeholder symbols with a throwaway script kept outside the repository (research R9) and paste the rows into `library.json`: `letter-a` to `letter-z` and `digit-0` to `digit-9` from a five-by-seven bitmap font table centered in the cell, and `pi`, `sigma`, `delta`, `lambda`, `omega`, `circle`, `square`, `triangle`, `diamond`, `star` and `cross` from simple definitions; view them on the contact sheet
- [ ] T038 [US3] Make T030 and T031 pass and review the whole library on the contact sheet from T032: resolve any collision the unique-pixel-pattern test reports by redrawing the later entry (depends on T034, T035, T036, T037)
- [ ] T039 [US3] Add the art file row to the table in `worlds/README.md` ("`<name>.art.json`: which sprite each item is drawn with; the visualizer's backend only") and a short paragraph that names are symbols a world may read literally or as placeholders
- [ ] T040 [US3] **(manual)** Check quickstart steps 7 and 8 on a copy of a world with placeholder names and with a bad art file

**Checkpoint**: Stories 1 to 3 work; batch 1 is in the library.

---

## Phase 6: User Story 4 - Open a shared bundle offline with its art (Priority: P4)

**Goal**: An exported or shared bundle draws the same sprites without the library, the world file or the art file, and an older bundle still opens.

**Independent Test**: export a run, remove the art file and the library, open the export, and the sprites are unchanged; open a pre-feature bundle and it opens with generated shapes (spec Story 4, SC-003, SC-005, quickstart 4 to 6).

### Tests for User Story 4

- [ ] T041 [P] [US4] Extend `test/viz/export-folder.test.ts`: the static export's `catalog.json` carries `art` and every bundle's `bundle.json` carries its own `art`; after the library and art files are removed or edited, reading the export gives the same sprites; the export holds no library name
- [ ] T042 [P] [US4] Extend `test/viz/catalog.test.ts` for folder bundles: a bundle with `art` in its manifest contributes its items to the catalog's `art` for its world; a bundle without `art` is listed and opens, and the catalog has no entry for it; a malformed `art` in a manifest makes that bundle `BundleInvalid`
- [ ] T043 [P] [US4] Extend `viz/test/runview.test.ts` and `viz/test/picker.test.ts`: a bundle with no `art` opens, and every item uses the name-only sprite; a catalog with no `art` lists runs with name-only thumbnails
- [ ] T044 [P] [US4] Extend `test/export.test.ts` (or `test/scripts.test.ts`): `scripts/export-run.ts` writes a bundle whose manifest carries `art`, so a bundle exported outside the visualizer opens offline too

### Implementation for User Story 4

- [ ] T045 [US4] In `src/viz/catalog.ts` merge a folder bundle's manifest `art` into the catalog's per-world map (the same first-in-order rule) and keep it out of the entry's cache key beyond the bundle's own files; make T041, T042 and T044 pass
- [ ] T046 [US4] Make T043 pass: check that the page's fallbacks in `viz/src/art/world-art.ts`, `RunView.svelte` and `Thumbnail.svelte` handle absent `art` at every level (absent catalog map, absent world, absent item); fix any that do not
- [ ] T047 [US4] **(manual)** Check quickstart steps 4, 5 and 6: export, delete the art file and the library, open the export; open a pre-feature bundle; edit a library sprite and confirm the thumbnail changes and the exported table does not

**Checkpoint**: all four stories work.

---

## Phase 7: Polish and cross-cutting

- [ ] T048 [P] Apply the ADR-005 touch-ups in `design/adr/ADR-005-per-world-item-art.md`: 2.2's last sentence (the shared glyph file replaces counts plus a pinning test), 2.1's schema location (the wire shape in `src/viz/contract.ts`; the library and art file schemas in `src/viz/art/`), and the allocation's fixed order (+9 modulo 64, research R5)
- [ ] T049 [P] Add the matching notes to `design/adr/ADR-001-crafting-table-world.md`, `design/adr/ADR-002-client-otel-trace.md` and `design/adr/ADR-004-skillcraft-visualizer.md` (the library and `art`), and use "backend" for the data side in the sentences they touch
- [ ] T050 [P] Update `AGENTS.md`: the layout row for `src/viz/` (library, art file, allocator, shared glyph tables), the visualizer rules (a sprite reveals no recipe; the library and art file are read only by the backend; `art` holds only items a run shows) and the scripts description of export
- [ ] T051 [P] Update `specs/004-skillcraft-visualizer/contracts/catalog-and-bundles.md` with a pointer to `contracts/art.md` for the `art` fields
- [ ] T052 Run `pnpm typecheck`, `pnpm test`, `pnpm build:viz` and `pnpm build`; compare the passing count with T001's; fix anything that regressed
- [ ] T053 Run the whole [quickstart.md](quickstart.md) once more on a fresh checkout of the branch and tick off each step
- [ ] T054 Mark the follow-up in ADR-005 and the spec when done: batch 2 (technology, furniture and household, medical, scientific) remains as sprite-only work; open a PR for the branch

---

## Dependencies and order

- Phase 1, then Phase 2 (T003 to T009). Phase 2 blocks everything.
- Within Phase 2: T004 follows T003; T006 follows T004 and T005; T009 follows T004, T006, T007 and T008.
- **US1** is the MVP and the others build on it: T016 to T021 are the backend chain (library, drawings, art file, world art, catalog); T022 to T024 are the page chain and need only T006 and T009 to start, so they can run beside the backend chain.
- **US2** needs US1's backend (T020, T021) and page (T022).
- **US3** needs the library mechanism of US1 (T016); the four drawing groups T034 to T037 are independent of each other and of US2.
- **US4** needs US1 (T020, T021) and is independent of US2 and US3.
- **Polish** follows the stories it documents; T048 to T051 can run as soon as their stories are done.

## Parallel opportunities

- Phase 2 tests T003, T005, T007 and T008 are four different files.
- US1 tests T010 to T015 are six different files; T022 (page lookup) runs beside T016 to T021 (backend).
- The four drawing groups T034, T035, T036 and T037 all edit `library.json`: draw each in its own branch of the file section and merge, or do them in turn if conflicts are a concern.
- US4's tests T041 to T044 are four different files.

## Implementation strategy

1. **MVP first**: Phases 1 and 2, then US1 end to end. That alone shows the faithful world with drawn items and proves the library, art file, allocator, bundle and catalog chain, and the page's lookup.
2. Add US2 (verification of every committed world), then US4 (offline and old bundles), which are mostly tests over what US1 built.
3. Add US3 last, because its bulk is the 106 new drawings (batch 1 less the nine already done): ship it in the four groups as each is ready, since the library works with any subset.
4. Batch 2 is a later, data-only change.
