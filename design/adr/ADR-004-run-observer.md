---
id: ADR-004
title: The observer: a read-only view of a folder of runs
status: proposed
created: 2026-10-02
specs: []
---

# ADR-004: The observer: a read-only view of a folder of runs

## 1. Context

A run of the crafting-table task leaves a folder of JSON files: a log of every call (`run.jsonl`), a score, a
trace of model requests and tool calls with times and tokens, the prompt, and the configuration that started the
server. Reading what such a run did means replaying its calls by hand, and comparing two runs means doing that
twice. The state of the table after each call can be derived from the log, but nothing shows it. The runs on disk
differ enough that the difference matters: a model finishing a goal in 11 calls, another failing the same goal in
166 to 223, a run with a skill installed that loaded it after 47 calls, a run that gave up. JSON hides that, and it
is not pleasant to look at.

The input is also unconstrained. A folder may hold runs from several experiments and several worlds, finished and
unfinished runs, runs from older versions of the harness that lack fields newer ones have, and replay bundles
exported for sharing. The conditions that distinguish runs keep changing as experiments change: the world's prior
fit (invented, perturbed or faithful), whether a skill was installed and loaded, an added prompt sentence, the
model. A viewer that hard-codes one experiment's vocabulary is out of date after the next experiment.

Several pieces exist. `deriveFrames` replays a log on its world into one frame per call (the table, what is held,
what `craft` would make). A replay bundle packages frames, trace and result for sharing, without the world file. The
score records the world's prior fit, any prompt sentence, and a skill's name, fingerprint, whether the agent loaded
it and after how many calls. Two gaps follow. A bundle's manifest does not yet carry the prior fit, the prompt
sentence or the skill, so a viewer fed only bundles cannot show them. And a first mock exists: a single HTML page
with six runs inlined, drawn in a pixel style, with live-tailing features and fonts fetched from the network. It
shows what the table view and the picker could look like. It cannot read a folder.

Other constraints apply. Frames reveal every recipe a run exercised, since crafted outputs appear in them, so what
a viewer shows of a run is a disclosure decision. Faithful-world runs carry Minecraft-inspired item names. The
agent must not be able to reach the viewer's data, which rules out serving it from the process the agent plays
through. Frame derivation must stay deterministic and free of clocks.

## 2. Decision

### 2.1 Role and scope

The observer is a read-only viewer: **a way to see what runs did and what they cost**, for an arbitrary folder of
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
| Result | outcome (reached, gave up, out of turns, error, unfinished); action calls, extra calls over the best run, crafts, failed crafts, refusals |
| Cost | duration, tokens of each kind, and cost as a run total; whether the trace matched the log |

An attribute a run lacks is absent, not guessed. Older runs without a prior fit or skill are shown without those
attributes.

### 2.3 How the page gets its data: a catalog and replay bundles

The page reads two things over a stable, read-only contract:

- a **catalog**: a list of runs, each with its attributes and the address of its bundle;
- a **replay bundle** per run: the numbered frame list, the trace and the result, as ADR-002 defines them.

The page uses relative addresses and no other source, so it runs unchanged against either supplier:

- **A local process** pointed at a folder of runs. It finds run folders (a label folder holding numbered run
  folders with a `score.json`) and bundle folders (holding a `bundle.json`), builds the catalog, derives frames for
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
- The page is self-contained: no framework, no build step if achievable, fonts and sprites bundled, no network.
- Tests are written before the catalog builder, the scanner and the page's data handling.

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
- **A fixed hierarchy (world, goal, run) as the navigation.** Rejected as the only structure: it fits the common case
  and blocks questions across worlds. It remains available as a grouping.

## 4. Consequences

- **The first mock is the visual baseline and not the architecture.** Its palette, type, sprite generator, table
  drawing, tape, picker layouts and motion carry over. Its inlined data, hard-coded sorts and groups, live
  badge, thinking bubble, log tailing and network fonts do not. Keeping it unpolished leaves rework in the data
  plumbing and the group, sort and filter model, which the mock does not have.
- **Two suppliers share one contract**, which has to be kept stable. The bundle manifest extension is additive. It
  changes the export code and the privacy test that pins what a bundle holds, and bundles exported earlier lack the
  new attributes.
- **A raw run needs its world file**, as a bundle needs none. A folder whose run records name worlds that have moved
  opens only as bundles.
- **Scale.** The catalog is small per run and frames load on demand, so hundreds of runs are listable. Whether
  group, sort and filter stay usable at that size is untested.
- **Disclosure.** Frames reveal every recipe a run exercised, so opening runs shows how crafts work. Bundles of
  faithful-world runs carry Minecraft-inspired item names, and ADR-003's check of usage terms applies before any
  such bundle is published. The local process binds to `127.0.0.1` and serves only data derived from the chosen
  folder.
- **Follow-up specs:**
  - the data contract and the folder scanner: catalog builder, on-demand bundle supply, the manifest extension,
    unfinished and unreadable runs, with tests;
  - the page: the picker (grid and list), group, sort and filter, the open view, comparison, skill markers and
    offline assets;
  - exporting a whole folder as bundles plus a catalog for a static host, if it is wanted.

**Not decided here:**

- how an item is drawn for a world with familiar names (the first mock hashes each name to a small creature, which
  signals "unknown" and may or may not suit a faithful world);
- the exact shape of group, sort and filter, and how much of it to expose;
- how two runs are chosen for comparison;
- how the process is started and pointed at a folder;
- whether bundle consumption and folder scanning ship together or in sequence;
- whether an unfinished run could be opened to the point it reached.

## 5. Related

- ADRs: [ADR-001](ADR-001-crafting-table-world.md) (the world, the run log), [ADR-002](ADR-002-client-otel-trace.md) (frames, trace, replay bundles, hosted viewing), [ADR-003](ADR-003-experiment-protocol.md) (the prior fit and the other conditions a run records).
- Design note: `design/notes/pixel-observer.md` (the scenarios, the settled scope and the first mock's visual language), with the mock in `design/notes/pixel-observer/mock/`.
- Specs: _(populated automatically by the speckit ADR-link hook once `/speckit-specify` references this ADR)_
