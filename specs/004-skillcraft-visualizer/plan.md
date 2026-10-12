# Implementation Plan: The Skillcraft Visualizer

**Branch**: `004-skillcraft-visualizer` | **Date**: 2026-10-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-skillcraft-visualizer/spec.md`

## Summary

Build a read-only viewer for a folder of runs in two layers that share one contract. The **data side**
(Node, built-ins only) scans a folder for run folders and exported bundles, builds a catalog of runs with
flat attributes, supplies each run's replay bundle on demand (deriving frames with the existing
`deriveFrames`), serves the built page on `127.0.0.1`, and exports a whole folder as a static tree of the
same shape. The **page** (a Vite-built single-page app: Svelte shell, a PixiJS table scene, Tailwind
styling over a local brand palette, bundled fonts, generated sprites) reads only `catalog.json` and
`bundles/<id>/…` by relative address, so it runs unchanged against the local process and a static host.
The existing bundle export is refactored so one function builds a bundle in memory for both the server and
the export, and the bundle manifest gains optional prior-fit, prompt-note and skill fields. The data side is
built and tested first, then the page. The harness, engine, MCP server and tool surface do not change.

Choices the ADR left open are made here in a provisional form, labelled **(held loosely)** in
[research.md](research.md), so the first build teaches us what to keep. None is a commitment of the ADR.

## Technical Context

**Language/Version**: TypeScript (strict, ES modules) on Node 22+ (CI runs 22 and 24). The page targets
current evergreen browsers with WebGL.

**Primary Dependencies**: existing: zod. New, page only (devDependencies, since the page is built to static
files): `vite` 8, `svelte` 5, `@sveltejs/vite-plugin-svelte` 7, `pixi.js` 8, `tailwindcss` 4 and
`@tailwindcss/vite`, `@fontsource/pixelify-sans`, `@fontsource/jersey-10`, `@fontsource/fira-code`,
and for component tests `jsdom` and `@testing-library/svelte`. The local process uses
`node:http`, `node:fs` and `node:path` only. Versions and licenses are in research R2.

**Storage**: none. Reads run folders (`run.jsonl`, `score.json`, `trace.jsonl`, `mcp.json`) and bundle
folders (`bundle.json`, `frames.jsonl`, `trace.jsonl`, `score.json`); writes only an export destination.

**Testing**: vitest. Data side: unit and integration tests in `test/viz/`. Page logic (contract client, view
state, sprite generator, preview drawing model, the scene model that turns a frame into sprites and effect
events): plain vitest in Node. Components: vitest with jsdom. The built page is checked by a Node test that
serves it from the local process and from a plain static file server and compares the two. Drawing in a real
browser is checked by hand from [quickstart.md](quickstart.md); automated pixel checks are deferred until a
visual regression appears (research R7).

**Target Platform**: macOS and Linux developer machines for the local process; any static file host for the
exported tree; CI builds the page on ubuntu.

**Project Type**: single repository with a web front end: Node library and scripts (`src/viz/`,
`scripts/`) and a browser app (`viz/`).

**Performance Goals**: 200 runs listed in 10 s from a cold scan (SC-001); opening a run or switching
presentation in under 1 s at 200 runs (SC-008); two live table scenes at 60 fps on a laptop.

**Constraints**: offline at run time (FR-018); no recipe list in any payload (FR-012); no clock in frame
derivation (FR-011); the local process binds `127.0.0.1` and serves nothing it did not derive from the
folder (FR-020); the agent cannot reach it (FR-025); at most two live WebGL scenes (FR-015); the server and
engine gain no dependency.

**Scale/Scope**: hundreds of runs per folder, tens to a few hundred frames per run, grids up to 6×6 (the
world limit is 36 cells); about 15 Svelte components, one PixiJS scene, one sprite generator.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Basis |
|---|---|---|
| I. Deterministic, replayable environments | Pass | Frames come from the existing pure `deriveFrames`; the catalog carries no timestamp, so the same folder gives byte-identical output. Sprites are a pure function of the item name. The page's clock-like effects are presentation only and never feed back into data |
| II. Data-driven worlds | Pass | The viewer reads worlds only through frames; it holds no knowledge of any world. Grid size comes from the manifest. Item art is a swappable function of the name |
| III. Discovery over disclosure (v1.1.1) | Pass | No recipe, description or world file is in the catalog or any bundle; the existing bundle privacy test is extended to the catalog and the new manifest fields. Results shown carry their prior fit as an attribute. Frames reveal exercised crafts, which the spec and ADR accept |
| IV. Test first | Pass | Tasks order tests before the scanner, catalog builder, export, server and the page's data handling (FR-026). Components get tests with the component |
| V. Simplicity | Pass with note | Build tooling and a framework are added, which the constitution's wording on mechanics does not cover; the ADR (§3, §4) records why the page needs them and ADR-004 is the required justification. The Node side stays built-ins only |
| VI. Secrets hygiene | Pass | No key is read or served. The server serves only derived run data, never `.env` or any path taken from a URL |
| VII. Decisions before specs | Pass | ADR-004 is the decision; it is `proposed`. It should move to `accepted` before the implementation merges (see Risks) |

The check holds after Phase 1 design.

## Project Structure

### Documentation (this feature)

```text
specs/004-skillcraft-visualizer/
├── plan.md              # This file
├── research.md          # Phase 0: decisions with alternatives
├── data-model.md        # Phase 1: attributes, catalog entry, preview, bundle manifest additions
├── quickstart.md        # Phase 1: how to run and check it
├── contracts/
│   ├── catalog-and-bundles.md   # the URL space and file shapes both suppliers provide
│   └── commands.md              # the viz and viz-export commands and the local process's rules
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
src/viz/                      # data side, Node, built-ins + zod; no SDK, no src/mcp
├── contract.ts               # zod schemas and types for catalog, entry, attributes, preview; no node imports (the page imports it)
├── attributes.ts             # run folder or bundle -> flat attributes and outcome
├── preview.ts                # frames -> strip + final table for tiles and rows
├── scan.ts                   # recursive scan -> found runs and bundles, with reasons for those not ready
├── catalog.ts                # scan + attributes + preview -> Catalog; ids; in-memory bundle cache
├── supplier.ts               # (request path) -> catalog / bundle file / not found; pure of http
├── server.ts                 # node:http around the supplier and the built page; loopback only; Host check
└── export-folder.ts          # whole folder -> static tree (catalog.json + bundles/<id>/...)
src/harness/bundle.ts         # BundleManifest gains optional priorFit, promptNote, skill (additive)
src/harness/export.ts         # buildBundle(runDir) in memory; exportBundle writes it (refactor, same output)
scripts/viz.ts                # pnpm dev scripts/viz.ts <folder> [--port N]
scripts/viz-export.ts         # pnpm dev scripts/viz-export.ts <folder> <dest>
scripts/dev-viz.ts            # pnpm dev:viz <folder>: Vite dev server with the same handler mounted over the folder

viz/                          # the page; own tsconfig (DOM lib, bundler resolution); built by Vite to dist-viz/
├── index.html
├── vite.config.ts            # svelte + tailwind plugins; build to dist-viz/ (the dev data middleware is mounted by scripts/dev-viz.ts)
├── tsconfig.json
└── src/
    ├── main.ts
    ├── App.svelte
    ├── palette.ts            # the one local palette module (value, source URL, date read)
    ├── theme.css             # Tailwind theme reading the palette's values
    ├── contract/client.ts    # fetch catalog and bundles by relative address; validate with src/viz/contract.ts
    ├── state/                # attributes (kinds from data), view (group/sort/filter pure functions), selection, open tables
    ├── shell/                # Sidebar, Picker, Tile, Row, CallStrip, SkillMarker, RunView panels, Compare layout, Empty/Error states
    ├── scene/                # TableScene (PixiJS), effects, tape and score DOM mirrors, scene pool (max two)
    ├── art/                  # item art interface, hashed-creature sprites, palettes, thumbnail painter (canvas 2D)
    └── fonts.ts              # imports the three font families

test/viz/                     # vitest: data side + page logic + a served-page parity test
viz/test/                     # component tests (jsdom project)
dist-viz/                     # build output (gitignored)
```

**Structure Decision**: the data side lives with the code that already knows runs (`src/`), because it
reuses `deriveFrames`, `loadWorld`, `readLog` and the bundle types, and it stays dependency-free. The page
lives in its own `viz/` folder with its own TypeScript configuration, because it needs the DOM library and a
bundler resolution that the Node code must not inherit, and so the browser code can be reviewed apart. The
only file both import is `src/viz/contract.ts`, which has no Node imports (a test enforces this).

## Phases

### Phase A — data side (built and tested first)

1. Extend `BundleManifest` additively; refactor `exportBundle` into `buildBundle` + write, with the existing
   export tests unchanged and new ones for the added fields.
2. Contract schemas (`contract.ts`), then attribute derivation, preview, scan, catalog, supplier, server and
   folder export, each test first.
3. Commands `viz` and `viz-export`.
4. Amend ADR-002 (done in the ADR-004 branch) and update `AGENTS.md` and `README.md` for the new commands,
   dependencies and layout.

### Phase B — page

1. Project setup: Vite, Svelte, Tailwind, fonts, palette module, typecheck and CI build.
2. Contract client and view state (pure, tested), then shell components: picker with sidebar, grid, list.
3. Open view: PixiJS table scene, panels, playback; scene pool and thumbnails.
4. Comparison, skill markers, empty/error states, accessibility, reduced motion.
5. Parity test: the same exported tree served by the local process and by a static server.

### Phase C — close-out

Run the sample set from the spec's assumptions, record what the build taught in the design note, and update
ADR-004's "Not decided" list with what was settled.

## Risks

- **ADR-004 is `proposed`.** The constitution's workflow builds features from an accepted ADR. The first task
  accepts it, with the user's confirmation, before any implementation; its review findings were applied before
  it merged.
- **Drawing is checked by hand.** Scenes cannot run in jsdom and automated pixel checks are deferred. Scene
  logic is kept separate from drawing (a pure "scene model" from frames) and tested without WebGL; a visual
  regression is the trigger to add browser-based checks (research R7).
- **Tailwind v4 and the palette module.** The palette must feed both Tailwind's theme and PixiJS. Plan:
  `palette.ts` exports plain values; `theme.css` is generated from or mirrors it, with a test that the two
  agree.
- **Palette drift.** Transcribed from a page the repository does not control; the module records source and
  date (spec FR-024).
- **Scale.** Scanning derives frames for every run to detect unreadable ones; 200 runs must stay under 10 s.
  Research R5 sets a cache key and a fallback (a cheaper replay check) if it does not.
- **Group/sort/filter usability** is untested beyond a few hundred runs.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| A bundler, a UI framework, a renderer and a CSS framework (Principle V) | ADR-004 §2.6: the page has several views, an animated scene and a growing asset set | A single hand-built file kept every concern interleaved and could not be reviewed in pieces (ADR-004 §3) |
| Two TypeScript configurations | The page needs the DOM library and bundler resolution; the Node code must keep NodeNext and no DOM | One configuration would let browser globals leak into the engine and server |
