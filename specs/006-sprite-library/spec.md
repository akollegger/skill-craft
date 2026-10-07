# Feature Specification: A Sprite Library for the Visualizer

**Feature Branch**: `006-sprite-library`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "sprite library for the visualization as described in ADR-005"

**Derived From**: ADR-005 (design/adr/ADR-005-per-world-item-art.md)

## User Scenarios & Testing *(mandatory)*

The visualizer draws every item as a small pixel picture, a *sprite*, on the crafting table, in the output slot, in the held
items and, for a run's goal, in the thumbnail of a list row or grid tile. Today a sprite is made from the item's name alone, so two
items of one world can look alike and a familiar item (a log, a pickaxe) looks like an abstract shape. This feature gives worlds
better sprites: **drawn pictures** from a shared library where a world asks for them, and **distinct generated shapes** for
everything else. It changes how items look, not what the visualizer shows or how runs are recorded.

An item's name and its picture are **symbols**. A world may read them literally (a log, a pickaxe in iron) or treat them as pure
placeholders (`A`, `B`, `π`), and the world's designer chooses which; the library holds pictures, not meanings.

The people are the same as for the visualizer: the **experimenter** who reads a table to see what an agent tried, the **reviewer**
who compares runs, and the **world author** who adds a world and wants it to look right without drawing a dozen pictures.

### User Story 1 - Recognise items in a faithful world (Priority: P1)

A person opens a run of the faithful world, whose items have familiar names. The table, the output slot, the held items and the goal
thumbnail show recognisable drawings: a log looks like a log, planks like planks, a pickaxe like a pickaxe in the colour of its
material. The reader no longer has to look a name up in the call list to know what is on the table.

**Why this priority**: it is the reason for the feature, and a drawn picture for every item of one committed world proves the whole
chain (library, art file, catalog, bundle, page) end to end.

**Independent Test**: open one run of the faithful world and check that each of its 13 items shows a drawn picture in the table, the
output slot and the held items, and that the same picture appears in the thumbnail of that run's goal in the list and the grid.

**Acceptance Scenarios**:

1. **Given** a finished run of the faithful world, **When** the person opens it, **Then** every item on the table, in the output slot
   and in the held items is a drawn picture, not a generated shape.
2. **Given** the same run in the list or grid, **When** the person looks at its thumbnail, **Then** the goal item is the same picture
   as on the table.
3. **Given** a pickaxe in each of its three materials, **When** they appear together, **Then** they share one shape and differ by
   colour, and no two look the same.

---

### User Story 2 - Tell items apart in any world (Priority: P2)

A person opens a run of a world that has no drawn pictures, such as a generated invented world. Each item that appears gets a
generated shape, and no two items of that world share a shape-and-colour combination while the world has few enough items to allow it.
The same item looks the same wherever it appears: in a thumbnail, on the table and in a comparison.

**Why this priority**: invented worlds are the main experimental material, and today they are where lookalike items are common.

**Independent Test**: open any run of a generated world and check that the items on its table are pairwise distinguishable at a glance,
then check the goal thumbnail against the table.

**Acceptance Scenarios**:

1. **Given** a world with about a dozen items and no art file, **When** its runs are shown, **Then** no two of its items share a shape
   family and colour palette.
2. **Given** a world whose art file draws only some items, **When** its runs are shown, **Then** the drawn items use their pictures and
   the rest get generated shapes that do not collide with each other.
3. **Given** the same world scanned twice, **When** the items are drawn both times, **Then** every item looks identical both times.

---

### User Story 3 - Add art to a new world by naming sprites (Priority: P3)

A world author wants a perturbed world, which keeps familiar item names, to look like the faithful one. They write a small art file
beside the world that maps item names to sprites in the shared library, and the visualizer uses it without any change to the world
file, the engine or the page. When an item has no suitable library sprite the author may draw it inline in the same file, or leave it
out and take a generated shape.

**Why this priority**: it is what makes later worlds cheap, but nothing is needed for it until a second world with art exists.

**Independent Test**: add an art file to a copy of a committed world that names two library sprites and draws one inline, and check
that all three show as intended and the rest are generated.

**Acceptance Scenarios**:

1. **Given** an art file naming a sprite that the library has, **When** the world's runs are shown, **Then** the item uses that sprite.
2. **Given** an art file naming a sprite the library lacks, **When** the world's runs are shown, **Then** the run still opens and that
   item gets a generated shape.
3. **Given** an art file that is malformed, **When** the world's runs are shown, **Then** the runs still open and every item of that
   world gets a generated shape.

---

### User Story 4 - Open a shared bundle offline with its art (Priority: P4)

A person receives a replay bundle, or views a static export on a host with no server. The bundle draws the same sprites as the local
visualizer did, without the library, the world file or the art file being present, and a bundle made before this feature still opens
with generated shapes.

**Why this priority**: a bundle that changed its look when someone edited the library, or that needed files it does not hold, would
break sharing.

**Independent Test**: export a run, delete the art file and the library, open the export, and compare the sprites with the original.
Open a bundle made before this feature and check that it opens.

**Acceptance Scenarios**:

1. **Given** a bundle exported with art, **When** the library is later edited, **Then** the bundle's sprites do not change.
2. **Given** a bundle with no art information, **When** it is opened, **Then** it opens and every item gets a generated shape.
3. **Given** an exported bundle, **When** its contents are inspected, **Then** it names only items that appear in the run's frames or
   goal, and it holds no recipe and no library names.

---

### Edge Cases

- A world has more than 64 items: shapes repeat and small accent marks keep them apart; no failure.
- Two runs of one world name carry different art (an art file edited between exports): a run's own table uses its bundle's art and
  every thumbnail of that world uses the run that sorts first in the catalog.
- An art file names an item the world does not have: that entry is ignored and the others stand.
- An inline drawing has the wrong size or an unknown colour name: the entry with the wrong size is ignored; an unknown colour name
  draws that pixel as transparent.
- A sprite name is requested with a material the shape does not support: the item falls back to a generated shape.
- The library file is missing or unreadable at run time: it is treated as empty, every item gets a generated shape and runs still open.
- A redrawn library sprite reaches old runs' thumbnails but not their tables until the run is exported again.
- An item appears in a run's frames but not in the world file (a mismatched bundle): it gets a generated shape from its name alone.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A world MAY have an optional art file beside its world file. An art file maps item names either to a sprite in the shared
  library or to an inline drawing, and it is read only by the visualizer's backend. The engine, the server and the agent never read it.
- **FR-002**: The visualizer MUST keep one shared library of named sprites. Each sprite is 8 by 8 pixels and uses only colours from the
  visualizer's palette. A library entry is either a fixed sprite or a shape drawn once and recoloured per material, and a reference
  names one or the other (for example a log, or a pickaxe in iron).
- **FR-003**: The library MUST ship a starter set in two batches, as ADR-005 section 2.6 lists them. Batch 1, delivered by this
  feature: the faithful world's 13 items (9 drawings), tools, containers and basic materials, food, and placeholder symbols (letters,
  digits, a few Greek letters and simple shapes). Batch 2 (technology, furniture and household, medical, scientific) is later,
  sprite-only work. Every drawing MUST be the project's own 8 by 8 work: it may start from a licensed reference (a source and licence recorded in a credits file) but is redrawn for the size and the palette, and none copies a game's textures, a brand or a logo. The faithful world's
  art file MUST name its library sprites.
- **FR-004**: An item with no drawn sprite MUST get a generated shape allocated across the world's whole item list, so that no two such
  items share a shape family and colour palette while the list is 64 items or fewer, and the allocation MUST be deterministic, the same
  for the same item list in any order, with no clock and no randomness.
- **FR-005**: A thumbnail of a run's goal MUST draw the same sprite as that item on the table of the same run, when the run's bundle was
  exported with the current library.
- **FR-006**: A replay bundle MUST carry the sprites of the items that appear in its frames and goal, as finished drawings, and MUST NOT
  carry library names, the world's other items or any recipe. The catalog MUST carry the same for each world's runs. A bundle or catalog
  made before this feature MUST still open, drawing generated shapes from names alone.
- **FR-007**: A malformed art file, a malformed library, an unknown library name, or an inline drawing of the wrong size MUST NOT make a
  run unreadable. The affected entries, or the whole file where it cannot be read, are ignored and the items fall back to generated
  shapes. No text from an art file or the library may appear in the catalog or in a reason for a run that cannot be opened.
- **FR-008**: Editing an art file or the library MUST show at the next scan without restarting the visualizer's process.
- **FR-009**: Sprites MUST stay 8 by 8 pixels and be drawn at the same scale as today. No new mechanics, labels, legends or badges may be
  added by this feature.
- **FR-010**: The visualizer MUST remain read-only: it MUST NOT write into a folder of runs, the world files or the art files it reads.
- **FR-011**: Tests MUST be written before the library, the resolver and the allocator. They MUST cover at least: every item of every
  committed world resolves to a sprite; every library sprite is 8 by 8, uses only palette names or transparency, has a unique
  kebab-case name and a pixel pattern no other sprite shares; every reference in every committed art file resolves, including a shape
  for each material it is used with; no two items of one world share a pixel pattern; allocation is independent of item order; a
  bundle's art covers exactly the items its frames and goal use and holds no library names; and the catalog's sprite for a goal item
  equals the one in the same run's freshly exported bundle.
- **FR-012**: A library name MUST name a picture, not an item's meaning or a recipe, and the visualizer MUST NOT interpret a name: a
  world's art file alone decides which picture an item uses, whether its names are literal or placeholders. An item named `A` MUST be
  able to use `letter-a`, `wrench` or any other library sprite.

### Key Entities

- **Sprite**: an 8 by 8 picture of one item, drawn from palette colours with transparent pixels.
- **Library**: the shared, named collection of sprites and recolourable shapes that worlds reference by name. It has no information
  about recipes or about any world.
- **Art file**: an optional per-world file mapping that world's item names to library sprites or inline drawings.
- **World art**: the finished sprites for the items of one world that a run shows, carried in the catalog and in each bundle.
- **Generated shape**: a geometric glyph chosen for an item with no drawn sprite, allocated so items of one world look distinct.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a run of the faithful world, 13 of 13 items appear as drawn pictures in the table, the output slot, the held items and
  the goal thumbnail.
- **SC-002**: In any committed world of 64 items or fewer, 0 pairs of items share a shape family and colour palette, and 0 pairs share a
  pixel pattern.
- **SC-003**: 100% of runs that opened before this feature still open, and a run with a missing, malformed or unknown art reference
  opens with generated shapes in every case tested.
- **SC-004**: A goal thumbnail and the same item on the table are pixel-identical for every run in the committed fixtures.
- **SC-005**: An exported bundle opens and draws identical sprites with the library and art files removed, and editing the library after
  export changes 0 of its sprites.
- **SC-006**: A world author can give a perturbed world its art by writing one file of item-to-name entries, with no change to the world
  file, the engine, the server or the page.
- **SC-007**: Every sprite of batch 1 resolves and passes the library checks of FR-011, and an art file may map any item name, literal or
  placeholder, to any of them.

## Assumptions

- ADR-005 and its amendment (2026-10-07) are accepted and define the design; this spec describes what a person gets, and the plan
  decides file locations and formats.
- The matching notes in ADR-001, ADR-002 and ADR-004 are updated as part of this work.
- Re-skinned (invented) worlds get generated shapes only; the renamer does not emit art files.
- Names and pictures are symbols; a placeholder world (items named `A`, `B`, `π`) is as valid as a literal one, and the library gives it
  the placeholder symbols of batch 1.
- Only the faithful world gets a library-backed art file in this feature. A perturbed world's art file is out of scope until such a
  world is built.
- Hover labels or legends, 16 by 16 sprites, and any frame or badge for raw versus crafted items stay out of scope.
- A sprite is a picture of an item kind, so showing it on a frame reveals nothing beyond the items that frames already show.
- The worlds README gains a row for the art file with the first art file.
