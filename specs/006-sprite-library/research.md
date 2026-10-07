# Research: A Sprite Library for the Visualizer

Decisions the ADR left to the plan. Each has a decision, a reason and what else was weighed. Items marked **(ADR touch-up)** refine a
sentence of ADR-005 and are listed in the plan's follow-up work.

## R1. Share the glyph tables, not just their counts **(ADR touch-up)**

**Decision**: Move the glyph families, the name hash, the seeded generator and `glyphOf` from `viz/src/art/` into one Node-free file,
`src/viz/glyphs.ts`, imported by both the page and the backend. The palette *colors* stay in the page; the shared file holds only
how many palettes there are.

**Rationale**: A glyph entry carries `marks`, the two body pixels recolored to the accent, and the marks are chosen from the body
pixels of the allocated family and variant. The backend therefore needs the shapes, not only their counts. ADR-005 2.2 had the
backend know the counts and a test pin the page's tables to them; with the tables in one file there is one definition and nothing to
keep in step. `src/viz/contract.ts` already sets the precedent of a file the page imports from the backend's tree, and the existing
test that forbids `node:` imports there extends to the new file.

**Alternatives**: *Backend holds counts, page computes marks from the name and the allocated family* changes the wire shape in 2.3 and
makes the page decide drawing details the backend allocated. *Duplicate the tables on both sides* is the drift 2.2 set a test against.

## R2. The library and the art file are read at scan time, not imported

**Decision**: The backend reads `src/viz/art/library.json` and each world's art file with `readFileSync` during a scan, and their
modification times are part of a run's cache key. `tsconfig.build.json` includes `src/**/*.json`, so `pnpm build` copies the library
beside the compiled code.

**Rationale**: FR-008 asks that an edit show at the next scan without restarting, which a JSON import (read once at load) cannot do.
The visualizer runs through `tsx` today, and the build copy keeps a compiled run from reading an empty library.

**Alternatives**: *`import library from "./library.json"`* reads once. *Put the library under `worlds/`* mixes viewer data with world
files that the engine reads.

## R3. Where each schema lives

**Decision**: `src/viz/contract.ts` (shared with the page) holds the *wire* shape only: the world art object, and the optional
`art` fields on the manifest and the catalog. The library and the art file are backend inputs, so their schemas and readers live in
`src/viz/art/` and the page never sees them. **(ADR touch-up: 2.1 put the art file's schema in the contract.)**

**Rationale**: The page reads neither file, and the contract should say what the page can rely on and no more.

## R4. One internal form: palette names per pixel

**Decision**: Every sprite, whether from the library (a fixed sprite, or a shape with its material applied) or drawn inline, is turned
into an internal grid of eight rows of eight palette names or `null` before anything else happens. The wire form is built from that
grid last: a legend that gives each palette name present a character, assigned in sorted order of the names (`a`, `b`, `c`…, with `.`
for transparent), and each entry as eight rows over that legend.

**Rationale**: Two sources have their own legends, and a world's art object mixes both, so they cannot share characters.
Normalising through names makes the output depend only on which colors are drawn, so the same sprite is the same bytes in every
run, and a catalog can merge the art of several runs of a world by names and then rebuild the legend.

**Alternatives**: *Ship each entry with its own legend* repeats legends per sprite. *A fixed global character per palette name* needs
the backend to know the palette's contents, which 2.1 avoids.

## R5. The allocation's fixed order **(ADR touch-up)**

**Decision**: A glyph's pair is `family * 8 + palette`, from 0 to 63. An item starts at the pair its name hashes to (the first two
draws of the seeded generator). If that pair is taken it moves to `(pair + 9) mod 64` and repeats. The variant and the two marks come
from the name's own draws, using the *allocated* family and palette, so an item whose own pair is free gets exactly the glyph
`glyphOf(name)` gives today. Items are processed in code-unit order of their names.

**Rationale**: 9 and 64 share no factor, so the walk visits all 64 pairs, and each step changes both the family and the palette, so
two items that collided do not land on neighbours of one family. An unmoved item keeping today's glyph means the page's name-only
fallback and the allocation agree wherever there is no collision, and a bundle made before this feature changes only where it must.

**Alternatives**: *Step by 1* keeps a family and changes only the palette, which clusters. *A seeded shuffle of all 64* is no easier to
pin in a test and loses the "free pair keeps its glyph" property.

## R6. Where world art is built

**Decision**: `buildBundle` in `src/harness/export.ts` calls one function from `src/viz/art/` with the world, the world's file path
and the items the frames and goal use, and puts the result in the manifest. The catalog builder takes the manifests of its ready runs
and merges them per world.

**Rationale**: Both the visualizer's server and `scripts/export-run.ts` already go through `buildBundle`, so a bundle exported by
either carries art without each caller remembering. `src/harness/` importing one function from `src/viz/art/` adds no file cycle
(`src/viz/catalog.ts` imports the harness, not the other way round), and the `AGENTS.md` layout note for `src/viz/` ("no SDK and no
`src/mcp`") still holds.

**Alternatives**: *A callback passed to `buildBundle`* makes a forgotten caller a silent regression. *Add art after the bundle is
built, in the catalog only* leaves `export-run.ts` bundles without art, which spec story 4 forbids.

## R7. A world's art file path

**Decision**: `<world>.art.json` beside the world file, derived as the notes file's path is: `worldPath.replace(/\.json$/, ".art.json")`.
A bundle read from a folder has no world file, so it keeps the art in its own manifest.

**Rationale**: It is the convention already used for `notes.json` and `goals.json`.

## R8. The page takes art per run

**Decision**: A scene's art is set when a run is opened: the scene handle gains `setArt(art)`, which clears its texture cache and
redraws. The thumbnail takes its art from the catalog's per-world map. A small page module expands a world art object into an
`ItemArt` and falls back to the name-only glyph for any name it lacks.

**Rationale**: `createTableScene(art)` fixes the art when a scene is made, but the scene pool reuses scenes across runs of different
worlds (spec 004), so the art must be settable. The fallback is what lets a bundle without art open.

**Alternatives**: *One scene per art* defeats the pool's two-scene limit. *Rebuild the scene on every open* costs a PixiJS
application per open.

## R9. Authoring the starter set

**Decision**: Library entries are authored by hand as eight-string rows in the JSON file, in the order of ADR-005 2.6. Letters and
digits are drawn as simple five-by-seven forms centered in the 8 by 8 cell. A test, not a tool, enforces the rules (size, legend,
unique names, unique pixel patterns). Batch 2 is outside this feature.

**Rationale**: A generator would add a build step for 47 small pictures that a person can read in a diff.

## R10. Library entries and the privacy rules

**Decision**: A library name is a kebab-case noun naming a picture. No library file text, art file text or item name from a world
reaches the catalog except the sprite of an item that appears in a run (the item names already appear in frames). The existing
parity and privacy tests are extended to cover `art`.

**Rationale**: AGENTS.md says the catalog and every bundle hold no world file, recipe list or item description. A sprite of an item a
frame shows adds none of those.
