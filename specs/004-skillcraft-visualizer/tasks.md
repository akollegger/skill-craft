# Tasks: The Skillcraft Visualizer

**Input**: Design documents from `/specs/004-skillcraft-visualizer/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. Principle IV and FR-026 require tests before the catalog builder, the scanner and the page's data handling. Write each group's tests first and confirm they fail. Drawing in a real browser is checked by hand (research R7); there are no automated pixel checks.

**Organization**: Grouped by user story. The data side (`src/viz/`) is built before the page (`viz/`) within each story, and the shared groundwork is in Phases 1 and 2. Tasks marked **(manual)** are checked by looking at the page, from [quickstart.md](quickstart.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: The user story the task serves (US1 to US6)

## Path Conventions

Data side: `src/viz/`, `scripts/`, `test/viz/`. Page: `viz/src/`, `viz/test/`. Imports of local Node files use the `.js` extension (NodeNext); the page uses the bundler resolution of `viz/tsconfig.json`.

---

## Phase 1: Setup

**Purpose**: Baseline, dependencies and the page project skeleton. Nothing user-visible yet.

- [X] T001 Set ADR-004 to `accepted` in `design/adr/ADR-004-skillcraft-visualizer.md` and `design/adr/README.md`, after the user confirms (the constitution's workflow builds features from an accepted ADR; its review findings were applied before it merged). Its "Not decided here" list stays, and the post-build task revisits it
- [X] T002 Run `pnpm typecheck` and `pnpm test` on the branch and note the passing count, so later phases can show nothing regressed
- [X] T003 Add the page's devDependencies to `package.json` per research R2 (`vite`, `svelte`, `@sveltejs/vite-plugin-svelte`, `pixi.js`, `tailwindcss`, `@tailwindcss/vite`, `@fontsource/pixelify-sans`, `@fontsource/jersey-10`, `@fontsource/fira-code`, `jsdom`, `@testing-library/svelte`); raise `engines.node` to `>=22.12` and set the CI matrix in `.github/workflows/test.yml` to `22.12` and `24`; run `pnpm install` and record in research R2 any peer pairing that had to change
- [X] T004 [P] Create `viz/tsconfig.json` (DOM lib, bundler resolution, strict like the root, `include` `viz/src` and `viz/test` and `src/viz/contract.ts`), `viz/index.html`, `viz/vite.config.ts` (Svelte and Tailwind plugins, build to `dist-viz/`, relative `base: "./"` so the build works from any path) and `viz/src/main.ts` mounting an empty `viz/src/App.svelte`
- [X] T005 [P] Add `dist-viz/` to `.gitignore`; add scripts to `package.json`: `build:viz` (`vite build -c viz/vite.config.ts`), `dev:viz` (`tsx scripts/dev-viz.ts`), and make `typecheck` also run `tsc --noEmit -p viz/tsconfig.json`
- [X] T006 Configure vitest projects in `vitest.config.ts`: the existing Node project (`test/**`) and a `viz` project (jsdom, Svelte plugin, `viz/test/**`); confirm `pnpm test` still runs everything
- [X] T007 Add `pnpm build:viz` to `.github/workflows/test.yml` after `pnpm test`

**Checkpoint**: `pnpm typecheck`, `pnpm test` and `pnpm build:viz` pass with an empty page.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The bundle builder, the manifest additions, the contract schemas, and the page's palette, fonts and item art. Every story reads through these.

**⚠️ CRITICAL**: No user story work starts until this phase is complete.

- [X] T008 [P] Write `test/viz/bundle-build.test.ts` (must fail first): `buildBundle(runDir)` returns manifest, frames, trace and result equal to what `exportBundle` writes for the same run; refusals are the same `ExportRefused` causes (unfinished, world missing, log does not replay); the manifest carries `priorFit`, `promptNote` and `skill { name, loaded, loadedAfter }` when `score.json` has them, and omits them when it does not; a bundle exported before this change still reads with `readBundle`
- [X] T009 Extend `BundleManifest` in `src/harness/bundle.ts` with the optional fields, and refactor `src/harness/export.ts` into `buildBundle(runDir): Bundle` plus `exportBundle` (build, then write with the same temporary folder and rename); make T008 and the existing `test/export.test.ts` pass
- [X] T010 [P] Extend the bundle privacy case in `test/privacy.test.ts`: the new manifest fields hold only the prior-fit word, the fixed prompt sentence and the skill's name and counts; nothing from a skill's text or the agent's text appears in a bundle
- [X] T011 [P] Write `test/viz/contract.test.ts` (must fail first): the Catalog, CatalogEntry, Attributes and Preview schemas accept the shapes in [data-model.md](data-model.md), reject an attribute whose value is an object or array, ignore unknown fields, and reject an unknown `format` with a distinct error; `src/viz/contract.ts` imports nothing from `node:*` (assert by reading the file)
- [X] T012 Create `src/viz/contract.ts` (depends on T011): zod schemas and inferred types for Catalog, CatalogEntry (`id`, `kind`, `status`, `reason`, `attributes`, `preview`, `bundle`), Attributes, Preview and the reason codes `Unfinished`, `WorldMissing`, `ReplayFailed`, `BundleInvalid`
- [X] T013 [P] Create `viz/src/palette.ts` exporting the Neo4j brand values listed in `design/notes/pixel-observer.md` with `SOURCE` and `READ_ON` (2026-10-02), `viz/src/theme.css` (Tailwind `@theme` variables with the same values) and `viz/test/palette.test.ts` asserting the two agree and every value is a six-digit hex
- [X] T014 [P] Create `viz/src/fonts.ts` importing the Pixelify Sans, Jersey 10 and Fira Code Fontsource packages (Latin subset, the weights the page uses); import it from `viz/src/main.ts`
- [X] T015 [P] Write `viz/test/art.test.ts`: the item art function is deterministic per name, symmetric, uses one of eight palettes, and returns different sprites for a set of sample item names from every committed world; the interface accepts a replacement function without touching the scene
- [X] T016 [P] Implement `viz/src/art/` (the `ItemArt` interface, the hashed 8×8 symmetric creature sprites in eight palettes drawn to textures, and the canvas thumbnail painter), making T015 pass (placed in Phase 2 so Story 3's tiles do not depend on Story 2)

**Checkpoint**: Foundation ready; the export still produces identical bundles; the contract compiles in both the Node and the page projects.

---

## Phase 3: User Story 1 - See which worlds were used and which runs each has (Priority: P1) 🎯 MVP

**Goal**: Point the process at any folder and see every run listed with its attributes, grouped by world on request, with unreadable and unfinished runs shown and explained.

**Independent Test**: Serve a folder holding runs from two worlds, an unfinished run, an older run and a bundle; every run is listed, grouping by world shows each world once, and none is dropped (spec Story 1 scenarios 1 to 5, quickstart section 2).

### Tests for User Story 1 (write first, confirm they fail)

- [X] T017 [P] [US1] Write `test/viz/attributes.test.ts`: attributes derived from a run folder and from a bundle match [data-model.md](data-model.md) (names, kinds, `outcome` rules for reached, gave up, out of turns, error and unfinished); an absent value gives an absent attribute, never a default; an older run without `priorFit` or `skill` has neither; `costUsd` and tokens come from totals only; a run with zero calls (the start frame only) still yields attributes and an `outcome`
- [X] T018 [P] [US1] Write `test/viz/preview.test.ts`: `strip` has one character per action call using `p c r t .` and ignores reads; `table` equals the last frame's grid; no description or recipe appears
- [X] T019 [P] [US1] Write `test/viz/scan.test.ts` with a temporary folder fixture: finds runs in a collection of experiments, one experiment, and a single run; finds bundle folders; reports a run with no `score.json` as unfinished; does not follow symbolic links; an empty folder gives an empty result
- [X] T020 [P] [US1] Write `test/viz/catalog.test.ts`: ids are stable across scans and distinct for the same run as a folder and as a bundle; entries are ordered by `label`, `run`, `id`; a run whose log does not replay, one whose world file is missing, and a corrupt bundle are `unreadable` with `code: fixed message` reasons that carry no wrapped error text; the catalog JSON has no timestamp and no filesystem path; the same folder gives identical bytes twice; a run whose `score.json` appears after the first scan is `unfinished` in the first catalog and `ready` in the next
- [X] T021 [P] [US1] Write `test/viz/supplier.test.ts`: `catalog.json` and `bundles/<id>/<file>` are answered for ready runs and bundles; an unknown id, a path with `..` or an encoded separator, a file name outside the four, and a non-`GET`/`HEAD` method never read outside derived data (404 or 405); a search of every payload for the world file name, item descriptions and recipe ids finds nothing
- [X] T022 [P] [US1] Write `test/viz/server.test.ts`: binds `127.0.0.1` only; a request with another `Host` gets 421; serves `dist-viz/` files with the right content types; refuses to start with a clear message when the page is not built or the folder is missing; `--port 0` reports the chosen port; exports a connect-style handler that calls `next()` for any path it does not own, so the Vite dev server can mount it

### Implementation for User Story 1 (data side)

- [X] T023 [P] [US1] Implement `src/viz/attributes.ts` (derive the flat attributes and `outcome` from a run's `score.json`, `mcp.json`, the loaded world's name and grid, and its folder path; or from a bundle's manifest and result), making T017 pass
- [X] T024 [P] [US1] Implement `src/viz/preview.ts` (frames to `strip` and `table`), making T018 pass
- [X] T025 [US1] Implement `src/viz/scan.ts` (recursive walk, run and bundle detection, no symlink following), making T019 pass
- [X] T026 [US1] Implement `src/viz/catalog.ts` (ids per research R3, `buildBundle` for readiness, attributes and preview, reason codes, in-memory cache keyed by `<id>:<score mtime>:<log size>`, deterministic order), making T020 pass (depends on T009, T012, T023, T024, T025)
- [X] T027 [US1] Implement `src/viz/supplier.ts` (a function from method, path and Host to a response description; ids looked up in the catalog, never used as paths), making T021 pass (depends on T026)
- [X] T028 [US1] Implement `src/viz/server.ts` around the supplier and `dist-viz/` (loopback bind, Host check, content types, rescan on each `catalog.json` request) and `scripts/viz.ts` per [contracts/commands.md](contracts/commands.md) (`<folder>`, `--port`, prints the URL and a count), making T022 pass (depends on T027); export the request handler so `scripts/dev-viz.ts` can reuse it
- [X] T029 [US1] Write `scripts/dev-viz.ts` (`pnpm dev:viz <folder>`): starts the Vite dev server for `viz/vite.config.ts` with the handler from `src/viz/server.ts` mounted ahead of Vite's own middleware over `<folder>`, and refuses a missing folder with the same message as `viz` (depends on T028; the middleware behavior is covered by the case added to T022; hot reload is checked by hand)

### Tests for User Story 1 (page)

- [X] T030 [P] [US1] Write `viz/test/client.test.ts`: the contract client fetches `catalog.json` and `bundles/<id>/…` by relative address only, validates with `src/viz/contract.ts`, shows an unsupported-version result for an unknown `format`, and returns a typed error (not a throw into the UI) for a failed fetch
- [X] T031 [P] [US1] Write `viz/test/attribute-kinds.test.ts`: attribute descriptors (name, kind text/number/flag, distinct values) are inferred from the catalog's values; mixed kinds become text; an attribute some runs lack records how many lack it
- [X] T032 [P] [US1] Write `viz/test/picker.test.ts` (jsdom): given a catalog fixture the list shows every entry; ready entries open, unfinished and unreadable entries show their reason and cannot be opened; grouping by `world` shows each world once with its runs; a folder with no runs shows the empty message naming what is looked for; each row shows label and run, world, goal, outcome, action calls against the best run, and model; arrow keys move between rows, Enter opens a ready one, and group headers and ticks are focusable

### Implementation for User Story 1 (page)

- [X] T033 [P] [US1] Implement `viz/src/contract/client.ts`, making T030 pass
- [X] T034 [P] [US1] Implement `viz/src/state/attributes.ts`, making T031 pass
- [X] T035 [US1] Implement the shell for listing in `viz/src/shell/` (`Sidebar.svelte` with All runs and one group by world, `Picker.svelte`, `Row.svelte`, `Empty.svelte`, `Unsupported.svelte`) and wire `viz/src/App.svelte` to load the catalog and show it grouped by world on request, making T032 pass; styling uses the Tailwind theme from T013 and the fonts from T014; a row shows label and run, world, goal, outcome, action calls against the best run, and model (the call strip and thumbnail come with Story 3)
- [X] T036 [US1] **(manual)** Build the page, serve `runs/` and check the Story 1 rows of the quickstart (group by world, single run, single experiment, folder of bundles, unfinished and unreadable runs, an older run); note anything that reads poorly in `design/notes/pixel-observer.md`

**Checkpoint**: Story 1 works alone: any folder lists. This is the MVP.

---

## Phase 4: User Story 2 - See the details of a run (Priority: P2)

**Goal**: Open a run into the crafting-table view and step through it.

**Independent Test**: Open a finished run; each step's table, holdings and craftable preview equal a fresh replay of the recorded calls, refusals are distinguishable, and the end shows the outcome and cost (spec Story 2, SC-003).

### Tests for User Story 2

- [X] T037 [P] [US2] Write `test/viz/replay-parity.test.ts`: for every committed world's fixture run and for a sample from `runs/` when present, each frame in a supplied bundle equals an independent replay of the log prefix on the world, for the whole sample set (SC-003); include a run with zero calls (the start frame only)
- [X] T038 [P] [US2] Write `viz/test/scene-model.test.ts` (Node, no WebGL): from a frame sequence the scene model yields, per step, the sprites by slot, the output-slot state (empty socket or craftable item), the hotbar counts, and the effect events (place, take-back, craft, refusal, goal reached), with no effect repeated when the same frame is shown again and none for a jump by scrubbing; the model takes its clock and random source as inputs
- [X] T039 [P] [US2] Write `viz/test/playback.test.ts`: the playhead is a frame `seq`; a finished run starts at 0, paused; play advances at the original pace with pauses capped at two seconds; step, restart and scrub clamp to the range; keyboard bindings (space, arrows, `r`, Esc) map to those actions
- [X] T040 [P] [US2] Write `viz/test/runview.test.ts` (jsdom): the score, call count against best, time, status sentence and call list (a real list) show the state at the playhead; refusals, crafts and placements have distinct classes; the goal reached state is announced; no recipe text appears; focus is visible and every control is reachable by keyboard; a reduced-motion request removes decorative classes but not state changes; a run with zero calls opens at its start state and shows its outcome

### Implementation for User Story 2

- [X] T041 [P] [US2] Implement `viz/src/scene/model.ts` (frames to scene state and effect events), making T038 pass
- [X] T042 [US2] Implement `viz/src/state/playback.ts`, making T039 pass
- [X] T043 [US2] Implement the PixiJS drawing layer in `viz/src/scene/TableScene.ts` (board at native pixel size scaled by whole numbers with nearest-neighbour sampling, items, output slot, hotbar, the drop, lift, craft flash, refusal shake and confetti effects, cleaned up on destroy) over the scene model, with the manual ticker input from T038
- [X] T044 [US2] Implement the open view in `viz/src/shell/RunView.svelte` and its panels (score numerals in Jersey 10, time, pips, status, tape as a real list, controls, scrubber, goal header, Esc to close back to the picker), loading `bundles/<id>/…` through the client and making T040 pass
- [X] T045 [US2] Open a run from a row in `viz/src/shell/Picker.svelte`; show the loading and failed-to-load states of a bundle
- [X] T046 [US2] **(manual)** Check the Story 2 rows of the quickstart on a direct run, a flailing run and a run that never reached the goal, with motion on and with reduced motion on; note in the design note how the faithful-world item names read as creatures

**Checkpoint**: Stories 1 and 2 both work: list and open.

---

## Phase 5: User Story 3 - Group, sort and filter runs on any attribute (Priority: P3)

**Goal**: Arrange and narrow the runs by any attribute, in a grid or a list.

**Independent Test**: On a folder with at least three differing attributes, group, sort and filter on each without the page naming it; runs lacking an attribute are kept together and labelled; a new attribute added to the catalog works with no code change (spec Story 3, SC-005).

### Tests for User Story 3

- [X] T047 [P] [US3] Write `viz/test/view.test.ts`: group, sort and filter as pure functions per research R8 for text, number and flag attributes (`is`, `is not`, `contains`, `=`, `≥`, `≤`); runs lacking the attribute form a labelled none group, sort last and fail every filter except is-missing; free-text search over text attributes; order is stable; an attribute added to the fixture catalog is usable with no code change
- [X] T048 [P] [US3] Write `viz/test/presentations.test.ts` (jsdom): switching grid and list keeps the same runs in the same order; a tile and a row show outcome, call count, model, the call strip (one mark per action call, distinct classes per kind) and the thumbnail; thumbnails are drawn once per run and are not live scenes; the tile size adapts to the grid so a 6×6 table and a 3×3 table are both readable (a minimum tile size is asserted); tiles are keyboard-focusable, arrows move between them and Enter opens one
- [X] T049 [P] [US3] Write `viz/test/scale.test.ts`: grouping, sorting and filtering 500 synthetic catalog entries completes in under 200 ms, and switching presentation renders without creating a WebGL context

### Implementation for User Story 3

- [X] T050 [US3] Implement `viz/src/state/view.ts` (the `View` value, group, sort, filter and search functions, a store), making T047 pass
- [X] T051 [P] [US3] Implement `viz/src/shell/Tile.svelte`, `Grid.svelte`, `CallStrip.svelte` and `Thumbnail.svelte` (canvas painter from T016), making T048 pass for the grid
- [X] T052 [US3] Implement the controls in `viz/src/shell/` (`GroupBy`, `SortBy`, `FilterBar`, `PresentationToggle`; the attribute menus built from the descriptors of T034) and extend `Row.svelte` and `Picker.svelte` to use the view store; keep all of Story 1's grouping working through it, making T048 and T049 pass
- [X] T053 [US3] **(manual)** Check the Story 3 row of the quickstart on the sample set, including a filter on `skillLoaded` and a group by `priorFit`; record in the design note which attributes made useful groups

**Checkpoint**: Stories 1 to 3 work: list, open, arrange.

---

## Phase 6: User Story 4 - Compare two runs (Priority: P4)

**Goal**: Show any two runs together, as two tables or two rows.

**Independent Test**: Choose two runs of one goal and play them independently; choose two runs of different worlds and both still show (spec Story 4).

### Tests for User Story 4

- [X] T054 [P] [US4] Write `viz/test/compare.test.ts` (jsdom): ticking two runs enables Compare; two open tables have independent playheads (stepping one does not move the other); runs of different goals or worlds are accepted; in the list, two compared runs show as adjacent rows with their attributes aligned; opening a third run while two are open replaces the second and never leaves more than two scenes alive (the scene pool's live count is asserted)

### Implementation for User Story 4

- [X] T055 [US4] Implement `viz/src/scene/pool.ts` (at most two live scenes; create, release and destroy) and use it from `RunView.svelte`
- [X] T056 [US4] Implement selection and the open-tables state in `viz/src/state/selection.ts`, tick controls on `Tile.svelte` and `Row.svelte`, the Compare action, "Open beside…" in the open view, and `viz/src/shell/CompareLayout.svelte` for side-by-side tables and aligned rows, making T054 pass
- [X] T057 [US4] **(manual)** Check the Story 4 row of the quickstart, including comparing a run with a skill against one without

**Checkpoint**: Stories 1 to 4 work.

---

## Phase 7: User Story 5 - See that a run had a skill (Priority: P5)

**Goal**: Skill presence on every tile, row and open view, without the skill's text.

**Independent Test**: Runs with a skill loaded early, loaded late, installed and never loaded, and no skill are each distinguishable on tile, row and open view; no skill text appears anywhere (spec Story 5, SC-009).

### Tests for User Story 5

- [X] T058 [P] [US5] Write `viz/test/skill-marker.test.ts` (jsdom): the marker states installed-and-loaded-after-N, installed-and-never-loaded and (with a prompt note) pointed-at differ in text and class; none is shown when the run has no `skill` attribute; the marker appears on a tile, a row and the open view; a search of the rendered output finds no skill text
- [X] T059 [P] [US5] Add a case to `test/viz/attributes.test.ts`: `skill`, `skillLoaded`, `skillLoadedAfter` and `promptNote` come through for run folders and bundles, and are absent for runs and bundles that predate them

### Implementation for User Story 5

- [X] T060 [US5] Implement `viz/src/shell/SkillMarker.svelte` and place it in `Tile.svelte`, `Row.svelte` and `RunView.svelte`, making T058 pass
- [X] T061 [US5] **(manual)** Check the Story 5 row of the quickstart on the `skill-glirol` and `skill-glirol-b` runs and a run with no skill

**Checkpoint**: Stories 1 to 5 work.

---

## Phase 8: User Story 6 - View a shared bundle on a static host (Priority: P6)

**Goal**: Export a folder as a static tree and view it from a plain file server exactly as from the local process.

**Independent Test**: Export a folder, serve the tree with a plain static server, and repeat the Story 1, 2 and 4 checks; the list and open view match the local process (spec Story 6, SC-006).

### Tests for User Story 6

- [X] T062 [P] [US6] Write `test/viz/export-folder.test.ts`: the export writes `catalog.json` and `bundles/<id>/` (four files) for every ready run; unready runs stay in the catalog with their reason and have no bundle; the source folder is unchanged afterwards; it builds in a temporary sibling and renames, leaves nothing behind on failure, and refuses an existing destination; a folder with a run that cannot be exported still exports the others and reports the skipped one
- [X] T063 [P] [US6] Write `test/viz/parity.test.ts`: for a fixture folder, `catalog.json` and every bundle file from the local supplier equal the exported files byte for byte; the built page served by the local process and by a plain static file server return the same `index.html`; the built page's files fetch nothing from an absolute network address (an allowlist covers namespace URLs inside library code); an exported bundle from before this change lists with the attributes it has
- [X] T064 [P] [US6] Write `test/viz/scripts.test.ts` cases for `scripts/viz-export.ts`: usage and refusal messages per [contracts/commands.md](contracts/commands.md), `--no-page`, a missing built page, and the exit codes

### Implementation for User Story 6

- [X] T065 [US6] Implement `src/viz/export-folder.ts` (catalog and bundles via the same builders as the supplier), making T062 pass
- [X] T066 [US6] Implement `scripts/viz-export.ts` (folder, destination, `--no-page`, copying the built page unless told not to), making T064 and T063 pass
- [X] T067 [US6] **(manual)** Follow quickstart section 3: export, serve with `python3 -m http.server`, repeat the Story 1, 2 and 4 checks, and compare with the local process

**Checkpoint**: All six stories work.

---

## Phase 9: Polish & cross-cutting concerns

**Purpose**: Accessibility, offline and privacy checks, documentation, and the close-out the plan names.

- [X] T068 [P] **(manual)** Accessibility pass on the real page: keyboard-only use of every view, visible focus, the score announced, reduced-motion respected, contrast of the palette roles (record the chosen role colors and the dark or light backdrop in the design note and in `viz/src/palette.ts`, FR-024)
- [X] T069 [P] **(manual)** Offline pass: disable the network, reload and use every view (SC-007); run quickstart section 5 for the privacy and offline greps
- [X] T070 [P] Measure SC-001 and SC-008 on a synthetic folder of 200 runs generated from existing fixtures; if the cold scan misses 10 s, apply the fallback in research R5 and record it
- [X] T071 [P] Update `AGENTS.md` and `README.md`: the new commands, the page's build, dependencies and layout (`src/viz/`, `viz/`, `dist-viz/`), the Node floor, and that the observer is now the visualizer; add the new directories to the layout table
- [X] T072 [P] Update `design/notes/pixel-observer.md` "From here" with what the build taught, and update ADR-004's "Not decided here" list with what was settled or changed; leave each choice marked held loosely unless the build confirmed it
- [X] T073 Run `pnpm typecheck`, `pnpm test`, `pnpm build:viz` and the whole of [quickstart.md](quickstart.md); confirm the passing count is at least T002's plus the new tests

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies; T004 and T005 can run together after T003.
- **Foundational (Phase 2)**: needs Phase 1. Blocks every story. T008 and T009 come first for the data side; T013 and T014 and the item art (T015, then T016) are independent of them.
- **US1 (Phase 3)**: needs Phase 2. The MVP.
- **US2 (Phase 4)**: needs Phase 2 and the page shell and client from US1 (T033 to T035).
- **US3 (Phase 5)**: needs US1's attribute descriptors and picker; independent of US2; its thumbnails use the painter built in Phase 2 (T016).
- **US4 (Phase 6)**: needs US2 (open view) and US3's rows and tiles for the tick controls.
- **US5 (Phase 7)**: needs US1 attributes; the marker is placed in US3's tile and row and US2's open view, so do it after those exist.
- **US6 (Phase 8)**: the data side (T065, T066) needs only Phases 2 and 3 and can be done earlier; its page checks need US1, US2 and US4.
- **Polish (Phase 9)**: after the stories wanted.

### Within each story

Tests are written and fail first. Contract and data-side code before the page. Pure logic before components. Components before the manual check.

### Parallel opportunities

- Phase 1: T004 and T005 together.
- Phase 2: T008, T010, T011, T013, T014 are different files and can run together.
- US1: all of T017 to T022 together; then T023 and T024 together, then T025 to T028 in order, with the dev script after T028; T030 to T032 together; T033 and T034 together.
- US2: T037, T038, T039 and T040 together; then T041.
- US3: T047 to T049 together.
- US6's T062 to T064 together; T065 and T066 can start as soon as Phase 3's catalog is done.

---

## Parallel Example: User Story 1

```bash
# Tests for the data side, together:
Task: "Write test/viz/attributes.test.ts"
Task: "Write test/viz/preview.test.ts"
Task: "Write test/viz/scan.test.ts"
Task: "Write test/viz/catalog.test.ts"
Task: "Write test/viz/supplier.test.ts"
Task: "Write test/viz/server.test.ts"

# Then the independent pieces:
Task: "Implement src/viz/attributes.ts"
Task: "Implement src/viz/preview.ts"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 and Phase 2.
2. Phase 3: any folder lists, with unreadable runs explained.
3. **Stop and validate** with quickstart section 2 on `runs/`.

### Incremental delivery

1. Add US2 (open a run): the table over time, the reason the visualizer exists.
2. Add US3 (group, sort, filter, grid) and US4 (compare).
3. Add US5 (skill markers) and US6 (static export).
4. Each story is checked on its own before the next. A demo is possible after US2.

### Notes

- Choices marked "held loosely" in [research.md](research.md) are expected to change as the build teaches us; keep them behind the seams the plan names (`ItemArt`, the view functions, the scene model, the supplier).
- Commit after each task or logical group. Do not start an agent run or write to NAMS from any task here; nothing in this feature spends usage.
