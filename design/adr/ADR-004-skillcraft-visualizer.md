---
id: ADR-004
title: The skillcraft visualizer: a read-only view of a folder of runs
status: accepted
created: 2026-10-02
specs: [specs/004-skillcraft-visualizer]
---

# ADR-004: The skillcraft visualizer: a read-only view of a folder of runs

## 1. Context

A run of the crafting-table task leaves a folder of JSON files: a log of every call (`run.jsonl`), a score, a
trace of model requests and tool calls with times and tokens, the prompt, and the configuration that started the
server. Reading what such a run did means replaying its calls by hand, and comparing two runs means doing that
twice. The state of the table after each call can be derived from the log, but nothing shows it. The runs on disk
differ enough that the difference matters: a model finishing a goal in 11 calls, another failing the same goal in
166 to 223, a run with a skill (a folder of instructions an agent can load) installed that loaded it after 47 calls, a run that gave up. JSON hides that, and it
is not pleasant to look at.

The input is also unconstrained. A folder may hold runs from several experiments and several worlds, finished and
unfinished runs, runs from older versions of the harness that lack fields newer ones have, and replay bundles
exported for sharing. The conditions that distinguish runs keep changing as experiments change: the world's prior
fit (how far a model's existing knowledge predicts the world's recipes: invented, perturbed or faithful), whether a skill was installed and loaded, an added prompt sentence, the
model. A viewer that hard-codes one experiment's vocabulary is out of date after the next experiment.

Several pieces exist. `deriveFrames` replays a log on its world into one frame per call (the table, what is held,
what `craft` would make). A replay bundle packages frames, trace and result for sharing, without the world file. The
score records the world's prior fit, any prompt sentence, and a skill's name, fingerprint, whether the agent loaded
it and after how many calls. Two gaps remain. A bundle's manifest does not yet carry the prior fit, the prompt
sentence or the skill, so a viewer fed only bundles cannot show them. And a first mock exists: a single 60 KB HTML
file with six runs inlined, drawn in a pixel style, with live-tailing features and fonts fetched from the network.
It shows what the table view and the picker could look like. It cannot read a folder, and its data, state, layout,
drawing, effects and assets are interleaved in one file, which makes it hard to review in pieces and will not
scale to several views and a growing set of assets.

Other constraints apply. Frames reveal every recipe a run exercised, since crafted outputs appear in them, so what
a viewer shows of a run is a disclosure decision. Faithful-world runs carry Minecraft-inspired item names. The
agent must not be able to reach the viewer's data, which rules out serving it from the process the agent plays
through. Frame derivation must stay deterministic and free of clocks.

## 2. Decision

### 2.1 Role and scope

The skillcraft visualizer is a read-only viewer: **a way to see what runs did and what they cost**, for an arbitrary folder of
runs. Its only input is that folder; it needs no experiment summary and writes nothing into it. A person can:

- see which worlds were used;
- see the runs of each world;
- see the details of a run;
- compare two runs.

Out of scope for now: watching a run as it happens, aggregates over many runs, associating teacher and student
runs, and showing where a skill came from.

### 2.2 The unit of data: a run and its attributes

The viewer's unit is a **run**, described by flat attributes, each a text, a number or a flag, so that the page can
group, sort and filter on any of them without knowing what it means. A world is one of those attributes (its name,
and its grid size for drawing); the viewer does not open a world's own details. The attributes come from what a
run folder or a bundle already holds:

| Group | Attributes |
|---|---|
| Identity | label (the experiment folder) and run number; world name and table size; goal item and quantity |
| Conditions | model requested and model that ran; the world's prior fit; the added prompt sentence, if any; the installed skill's name, whether the agent loaded it, and after how many calls |
| Result | outcome (reached, gave up, out of turns, error, unfinished); action calls, extra calls over the best run (the fewest calls that reach the goal), crafts, failed crafts, refusals |
| Cost | duration, tokens of each kind, and cost as a run total; whether the trace matched the log |

An attribute a run lacks is absent, not guessed. Older runs without a prior fit or skill are shown without those
attributes.

### 2.3 How the page gets its data: a catalog and replay bundles

The page reads two things over a stable, read-only contract:

- a **catalog**: a list of runs, each with its attributes and the address of its bundle;
- a **replay bundle** per run: the numbered frame list, the trace and the result, as ADR-002 defines them.

The page uses relative addresses and no other source, so it runs unchanged against either supplier:

- **A local process** pointed at a folder of runs. It scans that folder recursively for run folders (a label folder
  holding numbered run folders with a `score.json`) and bundle folders (holding a `bundle.json`), so the folder may be
  a collection of experiments, one label folder or a single run. It builds the catalog, derives frames for
  run folders with `deriveFrames` on demand, and serves the page, the catalog and the bundles on `127.0.0.1`. It
  serves nothing outside what it derives from the folder.
- **A static host** holding the page, pre-exported bundles and a catalog file generated from them. This is the
  hosted viewing ADR-002 describes.

A bundle's manifest gains the attributes it lacks (prior fit, prompt sentence, skill name, loaded and loaded-after
count) as optional fields, so a catalog can be built from bundles alone. Readers ignore fields they do not know.

A run folder that is unfinished (no `score.json`) is listed as unfinished and cannot be opened. A run whose log does
not replay on its world, or whose world file is missing, is listed with that reason and cannot be opened.

### 2.4 The interface

- **Navigation** is by group, sort and filter on any attribute. A hierarchy (worlds, then goals, then runs) is one
  grouping among others and is not built in; comparing the shortest runs across every world is another.
- **Presentations** of the current selection are a grid of tiles and a list with more detail. A tile or row shows the
  outcome, the call count, the model, a strip with one mark per call, and the skill marker.
- **Opening a run** shows the crafting-table view: the table, what is held, what `craft` would make, the call count
  against the best run, the time, and the calls in order. A finished run opens at its start state, paused.
- **Comparing** is a presentation and not a mode: two selected runs appear side by side as tables, or as two rows
  in the list. Any two runs may be shown together; sharing a goal in the same world is one reason to, not a
  requirement.
- **Skills** are surfaced from what is recorded: a marker on a tile, a row and the open view saying a skill was
  installed, whether it was loaded and after how many calls, and whether the prompt carried a pointing sentence.
  The skill's text and source are not shown.

### 2.5 Constraints

- Frame derivation is the existing pure function of a world and a log, with no clock. There is no live view, so no
  arrival time exists.
- The viewer shows table states, not a recipe list. Recipes appear only as far as frames show a craft.
- The built page is self-contained: its code, generated sprites and fonts are bundled, and it needs no network at
  run time.
- Tests are written before the catalog builder, the scanner and the page's data handling.

### 2.6 The page's stack

The page is written in TypeScript and built to static files. A build step is accepted; its output is what the local
process serves and what a static host holds.

- **Bundler: Vite** with the Svelte plugin. It builds the TypeScript, Svelte and PixiJS code and the bundled fonts
  into the static files, and provides a dev server with hot reload for iterating on the page.
- **Application shell: Svelte**, without SvelteKit, as a single-page app. The picker, group, sort and filter, the open view's panels, keyboard handling and
  the layout of two runs side by side are Svelte components.
- **Table scene: PixiJS.** The crafting-table view (the board, items, output slot, hotbar, and the effects for
  placing, crafting, refusing and finishing) is a PixiJS scene, drawn at the native pixel size and scaled by whole
  numbers with nearest-neighbour sampling.
- **Styling: Tailwind CSS** for the Svelte shell, with a theme defined in the repository and not taken from the
  Neo4j design-system package.
- **Palette: a local palette based on the Neo4j brand colors.** One TypeScript module holds the palette, with the
  values transcribed from the brand colors page of the Needle design system (neo4j.design) and that page's address and
  the date read. The Tailwind theme and the PixiJS scene both read this module, so the shell and the scene share
  one set of colors. Which color plays which role (outcome, refusal, craft, take-back, goal reached), whether the
  backdrop is dark or light, and the contrast checks are set when the page is specified.
- **Fonts: bundled.** Pixelify Sans for large text, Jersey 10 for the score numerals, and Fira Code for small text.
  The font files are bundled with the build.
- **Sprites: generated.** Each item name hashes to a small symmetric sprite, generated into a texture at run time, so
  no art is shipped per item. No asset is fetched from the network.
- **Separation.** The code divides by concern, so each part can be read and reviewed alone: the contract client (the
  catalog and bundles), the view state (selection, grouping, sorting, filtering), the shell components, the scene,
  the sprite generator, and the assets. The first mock is a visual reference and is not ported.
- **Scenes are few.** Each PixiJS application holds a WebGL context and browsers cap how many can be live. Only
  open tables hold a live scene, and at most two tables are open at once; tiles and rows show thumbnails drawn once
  into images.
- **The server stays plain.** The local process uses Node's built-ins and has no framework.

## 3. Alternatives Considered

- **Static page with pre-exported bundles only.** Rejected as the only route: opening an arbitrary folder would need
  an export step first, and the exported copies go stale as runs finish. It remains the route for hosted viewing.
- **A local process with its own private interface and no bundle contract.** Rejected: hosted viewing would need
  a second viewer, and the page could not be tested without a process.
- **Replaying raw run folders in the browser.** Rejected: replay needs the simulation engine and the world file in the
  page, which duplicates the engine and makes a folder without its worlds unreadable.
- **A desktop application.** Rejected: packaging and a large dependency for a read-only viewer that a local process
  and a browser already serve.
- **A terminal interface.** Rejected: it can list worlds and runs, but the goal is a representation of the crafting
  table over time, which needs drawing.
- **The experiment summary as the primary input.** Rejected: a folder must be readable without one, and arms and
  roles are one experiment's vocabulary.
- **A hand-built page with no framework or build step**, as the mock is. Rejected for the implementation: it kept
  every concern in one file, and several views plus assets would multiply that.
- **The Neo4j design-system package and its Tailwind preset** (`@neo4j-ndl/base`). Rejected: it is licensed
  GPL-3.0 and this repository declares no license, it ties the build to a version of someone else's tokens, and it
  brings fonts and themes the viewer does not use. The brand palette is transcribed into a local module instead.
- **esbuild alone as the bundler.** Rejected: it bundles the TypeScript but has no dev server or hot reload, and the
  Svelte and Tailwind integrations would need wiring by hand; Vite provides them.
- **Svelte's scoped styles or plain CSS for the shell.** Rejected: Tailwind is portable, since its utilities and
  theme carry to any component without a style architecture to maintain, and easier to customize, since the theme
  is one local palette module.
- **A heavier shell framework (React or Vue).** Rejected: more runtime and ecosystem than a read-only viewer needs;
  Svelte compiles to small output and has transitions built in. A no-build shell (Preact with htm, Lit) was also
  weighed, and a build step was accepted instead.
- **Canvas 2D, DOM and CSS, or SVG for the table scene.** Rejected for the scene: each is workable at this size, but
  the effects (drops, flashes, sparkles, confetti, and any later filters) are what a scene graph, a ticker and a
  particle system exist for, and they grow with the views. DOM's built-in accessibility is replaced by DOM mirrors of the
  score and the tape.
- **A game framework (Phaser, Kaplay).** Rejected: tweens, input and audio the viewer does not use, in a heavier
  runtime than a renderer alone.
- **A fixed hierarchy (world, goal, run) as the navigation.** Rejected as the only structure: it fits the common case
  and blocks questions across worlds. It remains available as a grouping.

## 4. Consequences

- **The first mock is the visual reference and not code to port.** Its palette, type, sprite idea, table layout,
  tape, picker layouts and motion carry over as design, and are rewritten as separate parts (the contract client, view state, shell, scene, sprite
  generator and assets). Its
  inlined data, hard-coded sorts and groups, live badge, thinking bubble, log tailing and network fonts do not.
  Left unpolished, it leaves the data plumbing and the group, sort and filter model to be built.
- **A build step and new dependencies.** Svelte, PixiJS and Vite join the repository's dependencies, with a
  second TypeScript configuration for the browser, and CI builds the page. The server and the engine gain none.
  Pixel snapshots of the scene are likely practical with nearest-neighbour sampling and no filters, since frames are
  deterministic; that is to be confirmed on CI's renderer, because WebGL output can differ across GPUs.
  Running the visualizer needs a built page or the Vite dev server, and the local process finds the build output.
- **Tailwind and a local palette.** Tailwind and its Vite integration join the dependencies. The palette is copied
  from a page the repository does not control, so it can drift from the brand's; the module records where and when
  it was read. Three fonts are bundled, and the licenses of the fonts and of Svelte, PixiJS, Vite and Tailwind are
  checked when they are added.
- **WebGL contexts are scarce**, so the thumbnails for tiles and rows must be images and not live scenes.
- **Two suppliers share one contract**, which has to be kept stable. The bundle manifest extension is additive. It
  changes the export code and the privacy test that pins what a bundle holds, and bundles exported earlier lack the
  new attributes.
- **A raw run needs its world file**, as a bundle needs none. A folder whose run records name worlds that have moved
  opens only as bundles.
- **Scale.** The catalog is small per run and frames load on demand, so hundreds of runs should be listable.
  Whether group, sort and filter stay usable at that size is untested.
- **Disclosure.** Frames reveal every recipe a run exercised, so opening runs shows how crafts work. Bundles of
  faithful-world runs carry Minecraft-inspired item names, and ADR-003's check of usage terms applies before any
  such bundle is published. The local process binds to `127.0.0.1` and serves only data derived from the chosen
  folder.
- **Follow-up specs:**
  - the data contract and the folder scanner: catalog builder, on-demand bundle supply, the manifest extension,
    unfinished and unreadable runs, with tests;
  - the page: the picker (grid and list), group, sort and filter, the open view, comparison, skill markers and
    offline assets;
  - exporting a whole folder as bundles plus a catalog for a static host, if it is wanted;
  - updating `AGENTS.md` for the page's build, commands and dependencies, and an amendment to ADR-002 for the
    bundle manifest's new attributes.

**Left open when this was written, and what building it settled (2026-10-02).** Each choice below was made in a
provisional form so building could start (spec 004, `research.md`), and stays open to change unless it says otherwise.

- *How an item is drawn for a world with familiar names.* Every world uses the hashed creature, behind an `ItemArt`
  function of the item's name that a world's own art could replace. In the faithful world the creatures hide which
  item is which on the table and the hotbar (names appear only in the call list), so a legend or hover label is
  still open.
- *Where the page's code lives.* The data side is `src/viz/` and the page is `viz/`, with its own TypeScript
  configuration and one shared file (`src/viz/contract.ts`). Settled.
- *How thumbnails are produced.* A tile or row paints a small 2D canvas, once, from a preview in the catalog entry
  (the call strip, the last table and, for a run that reached its goal, the goal item). No WebGL context is used.
- *The tools for testing the page.* vitest with jsdom for components, a scene model tested without WebGL, and a Node
  test that serves the built page and compares it with a static host. Drawing is checked by hand; automated pixel
  checks wait for the first visual regression.
- *The shape of group, sort and filter.* One grouping level, one sort, and filters whose operators suit the attribute's
  kind, over attributes discovered from the data. Nested grouping and saved views are open.
- *How two runs are chosen for comparison.* Tick two runs, or open one and choose another beside it. A third replaces
  the second.
- *How the process is started.* `scripts/viz.ts <folder>`, with `viz-export.ts` for the static copy and `dev:viz` for
  work on the page.
- *Run ids, attribute names and kinds, the catalog entry, reasons and the contract version.* Fixed in the spec's data
  model and contracts (`format: 1`). Settled.
- *Whether bundle consumption and folder scanning ship together.* They did, data side first.

Still open: the repository's own license, which the rejection of a GPL-3.0 package depends on; whether an unfinished
run could be opened to the point it reached; and how a view could be saved or shared.

## 5. Related

- ADRs: [ADR-001](ADR-001-crafting-table-world.md) (the world, the run log), [ADR-002](ADR-002-client-otel-trace.md) (frames, trace, replay bundles, hosted viewing), [ADR-003](ADR-003-experiment-protocol.md) (the prior fit and the other conditions a run records).
- Extends ADR-002 §2.6: the bundle manifest gains optional attributes (2.3). ADR-002 carries the matching amendment.
- Design note: `design/notes/pixel-visualizer.md` (the scenarios, the settled scope and the first mock's visual language), with the mock in `design/notes/pixel-visualizer/mock/`.
- Specs: [specs/004-skillcraft-visualizer](../../specs/004-skillcraft-visualizer/spec.md)

## 6. Amendments

- **2026-10-04, the table is wood, a thumbnail is the goal, and runs are selected by shift-click.** Three decisions made while closing
  the gap with the mock's pixel style (spec 004, "Table rendering and selection" in the tasks):
  - *Color.* The brand colors are an anchor, not a constraint. The page adds a wood ramp derived from Marigold (`woodHighlight`, `woodFace`,
    `woodShade`, `woodFrame`, `woodDeep`, marked `DERIVED` in `viz/src/palette.ts`) and the table, its output slot and the hotbar use it.
    Items cast a one-pixel shadow so every sprite palette reads on the wood.
  - *Thumbnails.* A tile or row shows the run's goal, not where the run ended: the goal item in a wooden output slot, in full color when the
    run reached it and greyed out when it did not. Runs for one goal then look alike, so a list groups by sight, failures included. This
    supersedes the earlier behavior (the table left at the end, or the item made). The catalog entry's `preview.table` is no longer used by
    tiles or rows; the frame size and the 2D-canvas, drawn-once rule in 2.x are unchanged.
  - *Choosing runs to compare.* The tick boxes are gone. Shift-click on a tile or a row selects it (a highlighted border and background mark
    it, with "Selected for comparison" for a screen reader), and a plain click opens it. Shift+Enter and Shift+Space do the same from the
    keyboard, since a keyboard click carries the shift key. At most two are selected; a third drops the oldest. The compare bar says how many
    are selected, with "Open both tables" and "Clear selection". Touch screens have no shift key and open runs only, which a later
    amendment may address.
- **2026-10-04, the list has column headers, the score is a numeral, and groups do not collapse.**
  - *Headers.* The list shows one row of column headings (Run, World, Goal, Outcome, Calls, Tape, Model) above everything, and the
    comparison panel repeats it. Every row, the header and the panel share one column definition (`LIST_GRID` in
    `viz/src/shell/columns.ts`, in rem so it scales with the frame), so cells line up. A cell now holds a value, not a label: the goal is
    the item ("plaevrataei", with a count only when it is more than one), not "make 1 plaevrataei".
  - *Always a grid.* The list no longer wraps below a viewport width of about 1280 pixels. The frame scales as a whole, so its columns do
    too. This supersedes the design note's remark that rows wrap on a narrow screen.
  - *The score.* Calls are a large pixel numeral (Jersey 10) in the color of how the run ended, with "best N" beside it, in rows and on tiles.
  - *Groups.* Nothing collapses, and the disclosure triangle is gone (the group heading itself is removed in the next entry).
  - *Names.* A run's name truncates from its start, so the part that tells neighbours apart (the condition and the run number) stays visible.
- **2026-10-04, decluttering: pips instead of headings, no compare panel, color for the call count, help in the footer.** The aim is a quieter
  interface, so this removes things and adds no text that is not high value.
  - *No group heading.* Runs of a group sit together, and the column the list is grouped by carries a square beside its name; the group's
    value is read from the rows. The column the list is sorted by carries a triangle (up for ascending, down for descending). An attribute
    with no column shows no pip, and the grid has no headings to carry one, so the Group by and Sort by controls remain the place to read it.
  - *No comparison panel.* The "Comparing" panel that repeated two selected runs above the list is removed (this drops "two adjacent rows
    in the list" from the comparison decision in spec 004, research R9). Selected runs stay where they are, highlighted, and "Open both
    tables" shows them side by side.
  - *The compare bar is buttons only.* "Open both tables" appears when exactly two runs are selected and "Clear selection" when any is. There
    is no instruction and no count ("2 runs selected" is gone).
  - *Help lives in the footer.* How to open and select runs, and what the square and the triangle mean, are in the footer with the run count,
    and nowhere else.
  - *Color for the call count.* A run that reached its goal is green when its calls are no more than the best known run and red when they are
    more (the playback pips' green and red). A run that gave up is yellow. A run that ran out of turns or failed is red. A run that did not
    reach its goal is never green, whatever its count. The outcome word takes the same colors, except that a goal reached in more than the
    best number of calls reads green in the word and red in the number.
  - *Tile layout.* A tile follows the mock: the goal thumbnail on the left and a large score on the right, then the name, the outcome, the
    model and the tape. The best run is shown in a list row and left off a tile, where the color carries it.


- **2026-10-04, a row is a block, a run has no name column, and the skill is an icon.** Further decluttering. A list row has no
  separator line: each is a flat block with a chunky bevel, like the mock's, with a gap between blocks, and a tile is the same block.
  The "Run" and "Outcome" columns are gone: each row is a different run, so its name (an experiment label and a trial number) only
  restated where its files live, and the call count's color already says how it ended. The name stays as the row's tooltip and
  first words for a screen reader, and in the opened table's title. The skill is a column of its own holding an eight-pixel icon
  (solid when loaded, an outline when never loaded, a second color when the prompt pointed at it) or a dash for no skill; the words
  are its label. The sort triangle is drawn in art pixels, and the "best N" text is gone. The tape is cut to three rows of thirty-two,
  so a tile and a row are one size, with the last cells saying how many calls the cut hides. All help sits under the frame, on the
  page's dark; only the run count stays inside it.
  Colors have one meaning: green is within the ideal (the best known run's count), yellow is past it, and red is a failed run, for
  whatever reason. They color the score, the playback pips and the tape of a row or tile, which is a miniature of the pips: green
  to the ideal, yellow after, and a failed run's last call red. A failed run's score is red whatever its count. Call kind is no
  longer a color: it is in the tape's label and in the open view's call list, in neutral text styles, so no traffic-light color
  ever says what a call was. This replaces the earlier rule that giving up was yellow and only running out of turns was red.

- **2026-10-04, the view controls are a short fixed set, with no filters.** This narrows the "group, sort and filter on any attribute"
  navigation of section 3 and the spec's FR-007 and SC-005, which no longer hold for the page. The page has one slim bar, full width
  in the list and in the grid, that stays at the top of the frame with the list's column header below it, and no native selects:
  List or Grid; Sort by Calls or Time (the lit one carries the sorted triangle, and choosing it again turns the order round; fewest
  calls first by default); Group by World or Goal (the lit one carries the square, and choosing it again ungroups); and one search box
  over every text attribute (name, world, goal, outcome, model, skill). There are no filter controls, so the filter code, the
  attribute menus and the attribute-kind discovery are removed. The view functions still take any attribute, so a later control (a skill
  or model group, say) is one more button. The cost is that a run cannot be narrowed by a number or a flag; search by outcome ("gave up")
  stands in for the most useful filter.
  The list has a Time column beside Calls (the run's measured clock, `4.2s` or `1:05`, blank when not measured), which carries the sort
  triangle when the sort is Time. A tile shows the time, small, under its score: the score sits at the top of the thumbnail's height
  and the time at its bottom, and the score is a step smaller than before to make room.

- **2026-10-07, the retro look, a detail view built around the table, and item art that points to ADR-005.** Made over several rounds of
  using the page. Where it conflicts with an earlier amendment, this one holds.
  - *Look.* The blues of the page are derived, softer and dustier than the brand's (`retroDeep`, `retroPanel`, `retroRaised`, `retroLine`,
    `retroDim`, `retroMuted`, listed in `RETRO` in `viz/src/palette.ts`), and the playback controls use a nearly gray blue (`SLATE`). The
    highlight colors are unchanged. The frame is a chunky pixel window (a thick rim, a hard offset shadow and a title strip), and the table
    sits in a bevelled frame on the deepest blue. Items on the table are flat: the one-pixel shadow described on 2026-10-04 is gone. They are
    drawn at twice the sprite's size in a 24-pixel cell, centred with a margin, and the hotbar always shows eight slots with counts in a pixel
    face drawn from rectangles (scaled text blurred).
  - *Item art.* The hashed creature is replaced by a geometric glyph (eight shape families, three variants, eight palettes, and two
    name-chosen accent pixels). This supersedes "Sprites: generated" in 2.6 in its detail; the sprite is still a pure function of the name and
    nothing is fetched. Per-world art, with drawn icons for the faithful world and glyphs allocated so a world's items differ, is decided in
    [ADR-005](ADR-005-per-world-item-art.md) and not built yet.
  - *Tiles.* A tile's score and time are larger, and the thumbnail is as tall as the two together. The tape is gone from tiles: a word in
    the score's color says how the run ended (master craft for a goal reached within the best known count, eventual craft past it,
    abandoned craft for a run that gave up, expired craft for one that ran out of turns). A list row keeps its tape and a smaller score, with
    the time in the small type.
  - *The title strip.* It names the page: "Runs" in the list and the grid; for one open table the goal, the world, the model and the
    skill icon; for two, that they are compared. Its one lamp is dim in the list and red in the detail view, where it closes the table.
    This replaces the close button and the heading of the detail view, and the "prior fit" line and the skill box are gone from it. Two
    tables side by side keep their own headings and close buttons. "Open beside" is gone: a comparison always starts from the list.
  - *The detail view.* Three columns, the two at the sides of equal width and the table in the middle. At the left are the playback
    controls as chunky icon buttons (jump to start, step back, play or pause, step forward, jump to end, with Home and End as keys). At the
    right are the score, the clock and the run's cost, time and token counts as small stats with no label words on screen. Above the table,
    as wide as it, is one pip for every action call with none cut off: calls made wear the playback colors, calls to come are gray, and a click
    on a pip shows the table after that call. Dragging the score scrubs through the run. Under the table is the call list in a box of the table's
    width and a fixed height that scrolls inside itself. The slider, the status phrase over the pips, the "of N" count and the footer of
    totals are gone. The score and the clock reserve the same room for every run, so nothing shifts as digits change or between runs.
    A scrolling filmstrip was tried for the pips and dropped: with a pip a call, a long run was a row of near-identical squares and the
    motion could not be seen.
  - *Open.* The call list and the pips may share the band under the table; that is being tried by use before it is decided.
  - *No help text.* The help under the frame (how to open and select runs, what the square and the triangle mean, and how many runs cannot
    be opened) is removed, which supersedes "help lives in the footer" and the help under the frame on 2026-10-04. A run that cannot be
    opened still says why on its own tile or row. Where the rest returns, if it does, is open.
