# Feature Specification: The Skillcraft Visualizer

**Feature Branch**: `004-skillcraft-visualizer`

**Created**: 2026-10-02

**Status**: Draft

**Input**: User description: "the skill-craft visualization app as described in @design/adr/ADR-004-skillcraft-visualizer.md and mocked in @design/notes/pixel-visualizer"

**Derived From**: ADR-004 (design/adr/ADR-004-skillcraft-visualizer.md)

## Clarifications

### Session 2026-10-02

- Q: Should one feature cover both the data side (scanner, catalog, bundle supply, manifest extension) and the page, or should the data side come first as its own feature? → A: One feature covers both; the plan and tasks do the data side first, then the page.
- Q: Should this feature include a command that exports a whole folder of runs as bundles plus a catalog file for a static host, or leave the export for later? → A: Include it, so static-host viewing can be tested end to end here.

## User Scenarios & Testing *(mandatory)*

The visualizer is **a way to see what runs did and what they cost**, for an arbitrary folder of runs. A *run* is
one model, under some conditions, playing one goal in one world: a sequence of table states with measurements
and an outcome. Runs live on disk as folders of JSON files, or as exported *replay bundles* that package a run
for sharing. The visualizer only reads them. Its people are the **experimenter**, who wants to know why one run
finished in 11 calls and another failed after 200; the **reviewer**, who compares conditions (models, prior fit,
with or without a skill); and the **audience member or later reader**, who was not there and needs to follow what
an agent did without reading JSON.

These people and their situations motivate the feature; they are not its requirements. The stories below are
the four things a person should be able to do, in layers that each stand alone: seeing runs is useful without
opening them, and opening one is useful without comparing.

### User Story 1 - See which worlds were used and which runs each has (Priority: P1)

A person points the visualizer at a folder. It may hold one run, one experiment, or many experiments across
several worlds, with finished and unfinished runs, runs from older versions of the harness, and exported
bundles. The visualizer lists every run it finds, with enough on each to tell runs apart at a glance: outcome,
number of calls, model, the world and goal, and how the run was conditioned. The person can see which worlds
appear and the runs of each.

**Why this priority**: Nothing else is reachable without it. It also carries the whole input contract: any
folder, no experiment summary needed.

**Independent Test**: Point the visualizer at a folder holding runs from at least two worlds, an unfinished run
and an older run lacking newer fields. Every run is listed, grouped by world on request, and none is silently
dropped.

**Acceptance Scenarios**:

1. **Given** a folder of runs from two worlds, **When** the person groups by world, **Then** each world appears
   once with its runs under it.
2. **Given** a folder that is a single run, a single experiment, or a collection of experiments, **When** it is
   opened, **Then** the runs inside are listed in all three cases.
3. **Given** an unfinished run, or a run whose record cannot be replayed or whose world file is missing, **When**
   the folder is listed, **Then** that run appears with the reason it cannot be opened, and the rest are
   unaffected.
4. **Given** an older run that has no prior fit or skill information, **When** it is listed, **Then** it shows
   without those attributes and nothing is guessed.
5. **Given** a folder of exported bundles with no run folders, **When** it is opened, **Then** the bundles are
   listed with the same attributes available from the bundles alone.

---

### User Story 2 - See the details of a run (Priority: P2)

A person opens a run and sees the crafting table: items placed on it over time, what is held, what a `craft`
would make right now, the call count against the best possible run, the time, and the calls in order. A finished
run opens at its start, paused, and the person plays it forward, steps, restarts or jumps. Refusals,
placements, crafts and take-backs look different from one another, so a direct run and a flailing run can be
told apart without reading anything.

**Why this priority**: It is the reason the visualizer exists beyond a list: the table over time is the
idiomatic picture of the domain. It needs only the runs from Story 1.

**Independent Test**: Open a finished run and step through it. Each step shows the table state that a replay of
the recorded calls gives at that step, and the final step shows the outcome and the cost.

**Acceptance Scenarios**:

1. **Given** a finished run, **When** it is opened, **Then** it shows its start state, paused, with the goal,
   the best possible call count, and the outcome.
2. **Given** an open run, **When** the person plays, steps, restarts or scrubs, **Then** the table, holdings,
   craftable preview and call list always agree with the same step.
3. **Given** a run containing refused calls, **When** it is stepped through, **Then** each refusal is
   distinguishable from a placement or a craft, and the refusal count is shown.
4. **Given** a run that reached its goal, **When** playback reaches the end, **Then** the goal being reached is
   unmistakable.
5. **Given** any open run, **When** it is looked at, **Then** no recipe list is shown; recipes appear only as
   far as the crafts the run actually made.
6. **Given** a person using the keyboard only, or with reduced motion requested, **When** they use the open run,
   **Then** every control is reachable, focus is visible, and decorative motion stops while state changes still
   show.

---

### User Story 3 - Group, sort and filter runs on any attribute (Priority: P3)

A person narrows and arranges the list of runs by any attribute a run has, for example: only runs that
failed, grouped by model; the shortest runs across every world; runs that had a skill installed but never
loaded it. Hierarchy (world, then goal, then run) is one grouping among others and is not built in. The
selection can be shown as a grid of tiles for appeal or a list with more detail.

**Why this priority**: This is what makes the visualizer work on a folder it has never seen and on conditions
that keep changing. It builds on Story 1 and is useful before comparison exists.

**Independent Test**: For a folder with at least three differing attributes, group, sort and filter on each in
turn without any attribute being named in the visualizer's own configuration; the list always reflects the
choice, and attributes a run lacks are handled without error.

**Acceptance Scenarios**:

1. **Given** the full set of runs, **When** the person groups, sorts or filters on any attribute shown for runs,
   **Then** the result reflects it, whether the attribute is text, a number or a flag.
2. **Given** an attribute that some runs lack, **When** it is used to group, sort or filter, **Then** the runs
   lacking it are kept together and clearly labelled and are not placed as if they had a value.
3. **Given** a selection, **When** the person switches between grid and list, **Then** the same runs are shown
   in the same order, with the list carrying more detail.
4. **Given** a grid tile or a list row, **When** it is looked at, **Then** it shows the outcome, the call count,
   the model, a strip with one mark per call, and the skill marker, without opening the run.
5. **Given** an attribute that is new to the visualizer (a field added to runs after it was built), **When**
   runs carrying it are listed, **Then** it can be used like any other attribute.

---

### User Story 4 - Compare two runs (Priority: P4)

A person chooses any two runs and sees them together: side by side as tables, or as two rows in the list.
Comparison is a way of presenting the current choice and not a separate mode: nothing about the rest of the
visualizer changes when two runs are shown. The two tables are independent, each with its own playback. The runs
need not share a goal or a world, though sharing them is a common reason to compare.

**Why this priority**: It answers "what changed between these conditions", and it only needs Stories 1 to 2.

**Independent Test**: Choose two runs of the same goal and play them independently; choose two runs of
different worlds and confirm both still show.

**Acceptance Scenarios**:

1. **Given** two chosen runs, **When** they are shown side by side, **Then** each table has its own playback
   and the person can step one without moving the other.
2. **Given** two runs of different goals or worlds, **When** they are chosen, **Then** they are shown without
   being refused or implied to compete.
3. **Given** two chosen runs in the list, **When** shown as two rows, **Then** their attributes line up for
   comparison.
4. **Given** two open tables, **When** the person tries to open a third, **Then** the visualizer keeps working,
   either replacing one or declining with a clear message, and never degrades the first two.

---

### User Story 5 - See that a run had a skill (Priority: P5)

A person sees on every tile, row and open run whether a skill was installed for the run, whether the agent
loaded it and after how many calls, and whether the prompt carried a sentence pointing at it. The skill's text
and where it came from are not shown.

**Why this priority**: Skills are the subject of the project's experiments, and the question "did the agent
use it, and when" is answerable from what is already recorded. It adds markers to views from Stories 1 to 3.

**Independent Test**: Include runs with a skill loaded early, loaded late, installed and never loaded, and no
skill. Each is distinguishable on tile, row and open view.

**Acceptance Scenarios**:

1. **Given** a run with an installed skill that was loaded after N calls, **When** it is shown, **Then** the
   marker says it was installed and loaded after N calls.
2. **Given** a run with an installed skill that was never loaded, **When** it is shown, **Then** the marker says
   so and differs from the loaded case.
3. **Given** a run with no skill, or an older run that records none, **When** it is shown, **Then** no skill
   marker appears.
4. **Given** any run with a skill, **When** it is looked at in any view, **Then** the skill's contents are not
   shown.

---

### User Story 6 - View a shared bundle on a static host (Priority: P6)

A person who was not at the experiment opens a page hosted as static files, holding exported bundles and a
catalog of them. They get the same experience as with a local folder: the same list, the same open view, the
same comparison.

**Why this priority**: Hosted viewing was decided in the earlier trace decision and the data contract serves
both routes, but the local route delivers the visualizer's value first.

**Independent Test**: Export a folder of runs with the export command, serve the built page with the output from a
plain file server, and repeat the acceptance checks for Stories 1, 2 and 4 against it.

**Acceptance Scenarios**:

1. **Given** the page, bundles and a catalog served as static files, **When** the page is opened, **Then** the
   runs are listed and open exactly as they do from a local folder.
2. **Given** a bundle exported before this feature, **When** it is listed, **Then** it appears with the
   attributes it has and without those it lacks.
3. **Given** a folder holding a run that cannot be exported, **When** the export command runs, **Then** every
   other run is exported and the skipped run is reported with its reason.

---

### Edge Cases

- A folder with no runs at all: the visualizer says so and says what it looks for.
- A folder with hundreds of runs: the list stays usable; frames for a run are loaded only when it is opened.
- A run with zero calls, or a run that ended in an error before any call: listed and openable (or listed with
  a reason), never a crash.
- Two runs with the same label and number in different folders, or a bundle and a run folder for the same run:
  each is distinct and addressable.
- A run record naming a world that has moved: listed with that reason; its bundle, if present, still opens.
- A faithful-world run: item names are familiar, and the visualizer shows them without implying they are
  invented.
- Runs whose attributes disagree in kind (a number in one run, text in another): the visualizer does not fail.
- Another process growing a run while it is listed: the run is treated as unfinished; no live view exists.
- Many items on a large table, and large grids: the table remains readable at the sizes the worlds use.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The visualizer MUST take only a folder of runs as input, and MUST NOT require an experiment summary
  or any file other than what the runs and bundles already hold.
- **FR-002**: The visualizer MUST be read-only: it MUST NOT write into the folder it reads or start, stop or
  alter runs.
- **FR-003**: The visualizer MUST find runs anywhere under the given folder (a collection of experiments, one
  experiment, or a single run), as run folders and as exported bundles.
- **FR-004**: The visualizer MUST list unfinished runs and runs that cannot be replayed or whose world file is
  missing, with the reason, and MUST NOT drop them or let them block others.
- **FR-005**: Each run MUST be described by flat attributes (text, number or flag) drawn from what the run
  holds: label and run number; world name and table size; goal item and quantity; model requested and model
  that ran; prior fit; added prompt sentence; skill name, whether loaded, and after how many calls; outcome;
  action calls, extra calls over the best run, crafts, failed crafts, refusals; duration, tokens of each kind,
  cost as a run total; and whether the trace matched the log.
- **FR-006**: An attribute a run lacks MUST be absent; the visualizer MUST NOT guess or default it.
- **FR-007**: Group, sort and filter MUST work on any attribute without the visualizer naming that attribute in
  advance, and MUST handle runs that lack it.
- **FR-008**: The world MUST be only an attribute for grouping and filtering; the visualizer MUST NOT open a
  world's own details.
- **FR-009**: The visualizer MUST offer a grid and a list presentation of the current selection. A tile or row
  MUST show outcome, call count, model, a strip with one mark per call, and the skill marker.
- **FR-010**: A person MUST be able to open a run into the crafting-table view showing the table, what is held,
  what `craft` would make, the call count against the best run, the time, and the calls in order. A finished
  run MUST open at its start state, paused, and support play, step, restart and scrub.
- **FR-011**: The table state at every step MUST equal the state obtained by replaying the run's recorded
  calls. Deriving it MUST be deterministic and involve no clock.
- **FR-012**: The visualizer MUST NOT show a recipe list. Recipes MUST appear only as far as crafts the run made.
- **FR-013**: Placements, crafts, refusals and take-backs MUST be visually distinguishable from each other, and
  the goal being reached MUST be unmistakable.
- **FR-014**: A person MUST be able to show any two runs together, side by side as tables or as two rows in the
  list, each with independent playback. Comparison MUST NOT be a mode, and MUST NOT require a shared goal or
  world.
- **FR-015**: At most two open tables MUST be live at once; tiles and rows MUST show still thumbnails.
- **FR-016**: Skill presence (installed, loaded or not, after how many calls, whether the prompt pointed at it)
  MUST be shown on tiles, rows and the open run. The skill's text and source MUST NOT be shown.
- **FR-017**: Total run cost MUST be shown as a run total only; the visualizer MUST NOT show cost per request.
- **FR-018**: The page MUST work with no network at run time: its code, sprites and fonts are bundled.
- **FR-019**: The page MUST read runs through one catalog of runs (each with its attributes and the address of
  its bundle) and one replay bundle per run, using relative addresses only, so that it runs unchanged against
  a local supplier and a static host.
- **FR-020**: A local supplier MUST build the catalog by scanning the folder, derive a run folder's frames
  when it scans (the catalog's attributes and previews come from the frames) and again only when that run's
  files change, serve its data on the loopback address only, and serve nothing outside what it derives from
  the folder.
- **FR-021**: A static host MUST be able to supply the same contract from pre-exported bundles and a catalog
  file generated from them. A command MUST export a whole folder of runs as such bundles plus the catalog
  file, read-only with respect to the source folder, and skipping with a stated reason any run that cannot be
  exported.
- **FR-022**: The bundle manifest MUST gain the prior fit, prompt sentence, skill name, loaded flag and
  loaded-after count as optional fields, so a catalog can be built from bundles alone. Readers MUST ignore
  fields they do not know, and bundles exported earlier MUST still load.
- **FR-023**: The visualizer MUST be reachable by keyboard, show visible focus, announce the score, expose the
  call list as a real list, and stop decorative motion under a reduced-motion request while still showing state
  changes.
- **FR-024**: The shell and the table scene MUST draw their colors from one shared palette based on the Neo4j
  brand colors, recorded with its source and the date it was read.
- **FR-025**: The agent playing a run MUST NOT be able to reach the visualizer's data; the visualizer MUST run in
  a process separate from the one the agent plays through.
- **FR-026**: Tests MUST be written before the catalog builder, the scanner and the page's data handling.

### Key Entities

- **Run**: one model, under some conditions, playing one goal in one world; a record of calls with a result and
  measurements. Has the attributes of FR-005.
- **Attribute**: a named text, number or flag on a run; may be absent.
- **Catalog**: the list of runs with their attributes and the address of each run's bundle, plus the reason for
  any run that cannot be opened.
- **Replay bundle**: the numbered frame list, trace and result of one run, and a manifest of attributes; carries
  no world file.
- **Frame**: the table state after one call: the table, what is held, what `craft` would make, the call, and
  counts.
- **View**: the group, sort and filter currently applied to the runs, and which presentation (grid or list) shows them. The runs selected for comparison (shift-click) and the open tables are kept apart from it.
- **Skill marker**: the recorded fact that a skill was installed for a run, with whether and when it was loaded.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Given a folder of runs the visualizer has never seen, a person sees every run listed, with every
  unreadable run named and explained, within 10 seconds for 200 runs.
- **SC-002**: A person who has never seen the project can open a run and say, within one minute and without
  reading JSON, whether the goal was reached and roughly how direct the run was.
- **SC-003**: For every run in the sample set, the table shown at every step equals a fresh replay of the
  recorded calls, with no differences.
- **SC-004**: A person can answer each of "which worlds were used", "which runs does this world have",
  "what did this run do" and "how do these two runs differ" in under a minute each, on a folder of at least 50
  runs.
- **SC-005**: A newly added attribute on runs can be grouped, sorted and filtered with no change to the
  visualizer.
- **SC-006**: Running the visualizer against the same bundles locally and from a static host produces the same
  list and the same open view.
- **SC-007**: The page works with the network disabled.
- **SC-008**: Opening a run, or switching between grid and list, takes under 1 second on a folder of 200 runs.
- **SC-009**: A tile or row shows a run's skill marker without opening it, for every run that recorded a skill,
  and shows none for every run that did not.

## Assumptions

- The first mock (`design/notes/pixel-visualizer/mock/`) is a visual reference for palette, type, sprite idea,
  table layout, call list, picker layouts and motion. It is not ported, and its live badge, thinking bubble,
  log tailing, stand-in labels and network fonts are left out.
- Out of scope for now: watching a run as it happens, aggregates over many runs, associating teacher and student
  runs, and showing where a skill came from.
- The sample set for acceptance is the runs already on disk: the pilot's invented-world runs, the faithful-world
  runs, the invented counterpart's runs, the runs with a skill installed, and the recorded teacher runs.
- The run folders and bundles follow the formats of earlier decisions (the run log, the score and trace, the
  bundle manifest format 1); this feature extends the manifest additively and changes nothing else about them.
- Runs are replayed against their world files from the repository; a run whose world has moved opens only as a
  bundle.
- The visualizer is run on one person's machine against local files, or hosted as static files for viewing; it
  has no accounts, sharing or editing.
- Left to planning and design, not decided here: how an item is drawn for a world with familiar names; the
  exact shape of group, sort and filter; how two runs are chosen for comparison; how the process is started and
  pointed at a folder; how a run's id is formed; the contract's version and the shape of a catalog entry; where
  the page's code lives; how thumbnails are produced; the page's test tools; the color roles and whether the
  backdrop is dark or light; and whether an unfinished run could open to the point it reached. The data side and the page are one
  feature, built in that order.
- Bundles of faithful-world runs carry Minecraft-inspired item names; the usage-terms check of the earlier
  experiment decision applies before any such bundle is published.
- Frames reveal every recipe a run exercised, so opening a run shows how crafts work; this is accepted for a
  viewer of recorded runs.
