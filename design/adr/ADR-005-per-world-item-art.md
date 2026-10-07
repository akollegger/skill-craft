---
id: ADR-005
title: Per-world item art: drawn icons where a world has them, allocated glyphs where it does not
status: accepted
created: 2026-10-06
specs: []
---

# ADR-005: Per-world item art: drawn icons where a world has them, allocated glyphs where it does not

## 1. Context

The visualizer, a read-only page that replays recorded runs, draws every item as an 8 by 8 pixel sprite: on the crafting table (the
grid where the agent places items), in the output slot, in the hotbar (the row of held items) and, for a run's goal, in the thumbnail of a list row or grid tile. Today a sprite is a pure function of the item's
name: the name hashes to a geometric glyph (one of 8 shape families with 3 variants each, in one of 8 palettes, plus two
name-chosen accent pixels). That works for any name and needs no data, and it has two limits.

- **Items in one world can look alike.** A world has about a dozen items and a glyph has 64 distinct looks that the eye separates
  (family times palette). Hashing each name on its own gives two items of one world the same family and palette more often than
  not (for 12 items, roughly two times in three). The page cannot repair this, because it never sees a world's other items: a
  thumbnail knows only its goal item, and a bundle carries frames, not the world file.
- **A glyph says nothing about what an item is.** In the faithful world (item names from familiar crafting: a log, planks, a
  pickaxe in three materials) the glyphs hide the identity that the names make plain, and a reader of the table has to look the name
  up in the call list. In an invented world there is no identity to show, so a glyph is the right drawing; in a faithful one it
  wastes what the vocabulary offers.

Three constraints shape the answer. The page has no network and a replay bundle must open on its own, so whatever decides how an
item looks has to arrive with the data. A thumbnail in a list and the table of the same run must draw the same sprite. And frames
show only the items that appear in them (the grid, the held items, the crafted outputs), while a world file lists every item,
including ones the run never used, so art shipped with a run must not name items that do not appear in it.

## 2. Decision

### 2.1 An optional art file per world

A world may have a sibling file `worlds/<name>.art.json`, next to `<name>.goals.json` and `<name>.notes.json`:

```json
{
  "format": 1,
  "legend": { "w": "woodFace", "s": "woodShade", ".": null },
  "items": { "stick": ["......ws", ".....ws.", "....ws..", "...ws...", "..ws....", ".ws.....", "ws......", "s......."] }
}
```

Each item is eight strings of eight characters; a character is a key of `legend`, whose values are names from the page's palette
module (`viz/src/palette.ts`) or `null` for a transparent pixel. Sprites therefore use only palette colors, and the palette stays
defined in one place. The file lists the items that have drawn art and may leave others out. Only the visualizer's backend reads it.
The engine, the server and the agent never do, as with the notes file (the file that records a world's prior fit and notes on its
recipes), and the worlds README gains a row for it.

The art file has a schema in `src/viz/contract.ts`, and the backend checks the file against it. A malformed art file does not make a
run unreadable: the whole file is ignored for that world and every item of the world is drawn as an allocated glyph. A valid file with
an item the world does not have, or a row of the wrong size, drops that entry only. A legend value that is not a palette name is
passed through, and the page draws that pixel as transparent, so the backend needs no copy of the palette. No text from the file
reaches the catalog.

The faithful world, `minecraft-inspired`, gets drawn art for its 13 items: a log, cobblestone, an ingot, planks, a stick, a crafting
table and a slab, and one shape per tool kind (pickaxe, sword) in three materials. The drawings are original and do not copy any
game's textures; the README's credit that the world is inspired by a game whose name is a trademark stays as it is.

### 2.2 Allocated glyphs for everything else

An item with no drawn art gets a glyph. A pure function of the world's full item list assigns one:

1. take the items without drawn art, sorted by name in code-unit order;
2. each starts from the family and palette its own name hashes to;
3. if that family-and-palette pair is taken by an earlier item, step to the next pair in a fixed order until a free one is found;
4. past 64 items, pairs repeat and the variant and the accent pixels are all that separate them.

The assignment is deterministic and has no clock or randomness. It is computed on the backend, where the world file is loaded
for replay (the world file is already loaded to derive frames), so the page needs the family, variant, palette and accent pixels of
each item and nothing else. A glyph recolors two of its body pixels to the accent color, which two being chosen by the name's hash,
and ships them as `marks`; they keep two glyphs of the same family, variant and palette apart. Step 3 picks its order and the spec
fixes it, since a test pins the assignments. The glyph shapes, the palettes and the drawing stay in `viz/src/art/`. The counts the allocator needs
(families, variants, palettes) are constants in `src/viz/contract.ts`, the one file the two sides share, and a test fails if the
page's tables stop matching them.

### 2.3 What travels with the data

A *world art* object has the shape `{ legend, items }`, where `items` maps an item name to either a drawn entry (`{ rows }`, using
the world's legend) or a glyph entry (`{ family, variant, palette, marks }`).

- **A bundle's manifest** gains an optional `art` field holding the world art for the items that appear in the run's frames (grid,
  held items, crafted outputs) and its goal. A bundle without the field still opens: the page falls back to the name-only glyph drawn
  today.
- **The catalog** (the list of runs the page loads first) gains an optional top-level `art` map from world name to world art, covering
  the items that appear in any ready run of that world. A list row or tile finds its goal sprite by the run's world attribute and goal
  item. The map is keyed by the name inside the world file, which is the name a bundle's manifest records, and runs of one world name
  are expected to agree. When their art differs, the run that sorts first in the catalog (label, run, id) supplies it for every
  thumbnail of that world, and a run's own table always uses its bundle's art.

Both are filled from one assignment computed over the full item list, so an item gets the same sprite in a thumbnail and on the
table, and neither names an item the runs did not touch. Existing readers ignore the new fields, and the bundle and catalog format
numbers do not change. A run's cache key includes the modification time of its world's art file, so an edit shows at the next scan
and a person drawing icons sees each change without restarting the process.

### 2.4 In the page

`viz/src/art/` gains a lookup from world art to sprite: given a world art object it returns an `ItemArt` (the existing function type), expanding a
drawn entry through the palette and a glyph entry through the glyph tables. The table scene and the thumbnails take their `ItemArt`
from the open bundle's art or the run's world in the catalog, and draw the name-only glyph when there is none. Sprites stay
8 by 8 and the table draws them at 2x.

## 3. Alternatives Considered

- **Ship each world's item list and allocate in the page.** Rejected: a bundle would name every item of the world, including ones the
  run never used, and the allocation logic and the page's palette knowledge would be needed in two places once a catalog is built
  from bundles.
- **Ship finished pixels for every item, glyphs included.** Rejected: 64 pixel values per item per world in the catalog, where four
  small integers say the same thing, and the glyph tables would exist on both sides.
- **A table in the page from item name to icon, with no per-world file.** Rejected: the page would hold a vocabulary, so a world with
  the same names and different recipes inherits art by accident, and a new faithful world needs a page change.
- **Art inside `<name>.json`.** Rejected: the world file is read by the engine and the server, and viewer-only data would sit in a file
  whose consumers never use it.
- **Generate art files for invented worlds with a script and commit them.** Rejected: the renamer produces a new world per
  experiment, and a committed art file per generated world is a second file to keep in step with the world it describes. Allocation
  from the item list is cheap enough to recompute at scan time.
- **Carry the faithful world's drawings through the renamer to invented and perturbed worlds.** Rejected for invented worlds, whose
  point is that a name carries no prior knowledge; a log icon on an invented item would put that prior back in front of the observer.
  A perturbed world, which keeps the familiar vocabulary, declares its own art file or takes allocated glyphs.
- **16 by 16 sprites.** Deferred: it needs new cell sizes in the scene and a redrawn glyph set, and nothing in this decision depends on it.

## 4. Consequences

- A world's items look distinct from one another up to 64 items, and the faithful world's items are recognisable on the table, in the
  hotbar and in a goal thumbnail.
- An item's allocated glyph depends on the other items of its world. Adding or renaming an item can change the glyphs of items that
  sort after it. A committed world is not edited in place, so this costs nothing today, and a test pins the current worlds'
  assignments so a change is deliberate.
- The backend learns the shape of the art (the legend and the entry kinds) and the glyph-space constants, and the catalog and
  bundle manifest each grow an optional field. ADR-002's manifest description needs the matching amendment, as ADR-004's did.
- Drawn art is hand work: 13 items for the faithful world now, and each future faithful or perturbed world pays the same.
- Tests, written first: every item of every committed world resolves to a sprite; drawn sprites are 8 by 8, and in every committed art file each legend
  value is a palette name or null (the page tolerates an unknown name by drawing it transparent, and the tests for committed files do
  not); no two items of one world share a pixel pattern, and the allocator keeps family-and-palette pairs
  distinct for up to 64 items; the allocation is the same however the item list is ordered; a bundle's art covers exactly the items its
  frames and goal use; and the catalog's sprite for a goal item equals the one in the same run's bundle.
- Follow-up work before the spec is accepted: the matching amendments to ADR-004, ADR-002 and ADR-001 are recorded (2026-10-07), and the
  page's name-only glyphs are already the fallback. The worlds README table gains a row for the art file with the first art file.
- Out of scope, and unchanged: a hover label or legend naming the item under the cursor, 16 by 16 sprites, and any frame or badge
  that shows whether an item is raw or crafted.

## 5. Related

- Related ADRs: [ADR-004](ADR-004-skillcraft-visualizer.md) (the visualizer; this replaces its "Sprites: generated" decision in 2.6),
  [ADR-002](ADR-002-client-otel-trace.md) (the replay bundle and its manifest), [ADR-001](ADR-001-crafting-table-world.md) (the world
  file and its sibling files), [ADR-003](ADR-003-experiment-protocol.md) (the faithful, perturbed and invented worlds).
- Specs: _(populated automatically by the speckit ADR-link hook once `/speckit-specify` references this ADR)_

## 6. Amendments

- **2026-10-07, a shared sprite library that worlds reference by name.** Decided in discussion before any implementation, so 2.1 and 2.2
  stand except where this entry says otherwise. In this entry the backend is `src/viz/` and the frontend is the page in `viz/`.
  - *The library.* The backend owns one file of named 8 by 8 sprites, `src/viz/art/library.json`: `{ format, legend, sprites, shapes,
    materials }`. `legend` maps a character to a palette name or `null`, as in 2.1. A `sprites` entry is eight rows of eight characters.
    A `shapes` entry is eight rows that use two extra characters, `m` and `M`, for a material's body and shade, and `materials` maps a
    material name to its two palette names. A reference is a sprite name (`log`) or a shape and material (`pickaxe/iron`). Names are
    lowercase kebab-case and name a kind of item, never a recipe or a world.
  - *A world's art file.* An `items` value is now either a library reference (a string) or inline rows (as in 2.1). The world's `legend`
    is needed only when it has inline rows. The faithful world's art file shrinks to a name map; its drawings move into the library, which
    starts with exactly the faithful world's 13 items. The library grows when a second world needs a concept, not before.
  - *Resolution.* The backend resolves a reference to rows when it builds the world art of 2.3, so the catalog and the bundle manifest
    still carry finished drawn entries and never library names. The frontend, the wire format and the allocation in 2.2 are unchanged;
    a referenced item counts as drawn and is left out of the allocation. A reference the library does not know drops that entry, as an
    entry of the wrong size does in 2.1, and the item falls back to an allocated glyph. A malformed library is a test failure, and at run
    time it is treated as empty.
  - *Why pixels, not names, travel.* A bundle must open offline and keep its look. If it carried names, redrawing a library sprite would
    change every exported bundle. The run's cache key gains the library file's modification time, so an edit shows at the next scan.
  - *The renamer stays out.* Re-skinned worlds still get allocated glyphs and no mapping. Giving an invented item the icon of its base
    item would put back the prior knowledge that the invented vocabulary exists to remove (3, the rejected carry-through). A perturbed
    world, which keeps familiar names, writes an art file of references.
  - *Alternatives, revisited.* The rejected "table in the page from item name to icon" stays rejected as a frontend table that every
    world inherits by accident. A backend library that a world opts into by writing a reference has neither problem.
  - *Consequences.* One more artifact with its own format and tests, and a naming vocabulary to keep tidy: names are added, and an
    existing name is redrawn only on purpose. A redraw reaches old runs' thumbnails (the catalog is rebuilt at scan) but not their tables
    (a bundle keeps its own drawings), so a thumbnail and a table can differ until the run is exported again; the test that the two
    match applies to freshly exported bundles. Authoring a later world costs a name map instead of drawings.
  - *Tests, written first.* Every library sprite is 8 by 8 and uses only legend characters whose values are palette names or `null`;
    names are unique and kebab-case; no two sprites share a pixel pattern;
    every reference in every committed art file resolves; a shape resolves for each material it is used with; a bundle's manifest holds
    rows and no library names.
