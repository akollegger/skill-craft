# Research: The Skillcraft Visualizer

Each entry gives the decision, why, and what else was weighed. Entries marked **(held loosely)** settle a
question ADR-004 left open ("Not decided here") in a provisional form so that building can start; the first
build is expected to revise them, and the ADR's list is updated when it does.

## R1. Where the code lives

- **Decision**: data side in `src/viz/` (Node, zod, built-ins); page in `viz/` with its own `tsconfig.json`;
  one shared file, `src/viz/contract.ts`, free of Node imports. Build output in `dist-viz/` (gitignored).
- **Rationale**: the data side reuses `deriveFrames`, `loadWorld`, `readLog` and the bundle types from
  `src/`. The page needs the DOM library and bundler module resolution, which would pollute the Node
  configuration. Sharing only a schema file keeps the two reviewable apart.
- **Alternatives**: everything under `src/` (browser globals leak into the engine); a second package or
  pnpm workspace (more tooling than two folders need); the page under `design/notes/` (it is product code).

## R2. Dependencies and licenses (verified on the npm registry, 2026-10-02)

| Package | Version | License | Role |
|---|---|---|---|
| `vite` | 8.3.2 | MIT | bundler and dev server; needs Node `^20.19 or >=22.12` |
| `svelte` | 5.57.1 | MIT | application shell |
| `@sveltejs/vite-plugin-svelte` | 7.3.1 | MIT | Svelte in Vite 8 |
| `pixi.js` | 8.22.0 | MIT | table scene |
| `tailwindcss` + `@tailwindcss/vite` | 4.3.3 | MIT | styling (plugin supports Vite 8) |
| `@fontsource/pixelify-sans`, `jersey-10`, `fira-code` | 5.3.0 | OFL-1.1 | bundled fonts |
| `svelte-check` | 4.7.6 | MIT | type checking `.svelte` files |
| `jsdom`, `@testing-library/svelte` | 30.1.1, 5.4.2 | MIT | component tests |

- **Decision**: add them as devDependencies. The repository's own license is still undeclared (ADR-004); all
  of these are permissive or the SIL Open Font License, which allows bundling the fonts.
- **Check at setup**: Vite 8's Node floor (`>=22.12`) is above the repository's `>=22` engines field and CI
  uses `22`. Setup raises the `engines` field and the CI matrix to `22.12` (or pins the page build to
  Node 24 in CI). vitest 5 accepts Vite 8 as a peer. If any peer pairing fails at install, fall back to the
  newest set that resolves and record it here.
- **Alternatives**: `@neo4j-ndl/base` (GPL-3.0, ADR-004 §3); runtime font CDNs (offline requirement).

## R3. The URL space and the run id

- **Decision**: both suppliers expose
  `catalog.json` and `bundles/<id>/{bundle.json,frames.jsonl,trace.jsonl,score.json}`, plus the page's own
  static files. The page uses relative addresses only. A run's `id` is the first 16 hex characters of the
  SHA-256 of `<kind>:<path of the run or bundle relative to the scanned folder, with / separators>`. Label and
  run number remain attributes for people. The export command writes exactly this tree next to the built page.
- **Rationale**: the ids are stable across scans, URL-safe, unique across folders and across a run folder and
  a bundle of the same run, and never put a filesystem path in a URL (so nothing from a URL is ever used to
  open a file). The export tree is the URL space, so "static host" means "copy the folder".
- **Alternatives**: the relative path as the id (long, needs escaping, discloses layout); label plus number
  (collides across folders); a content hash (changes when the trace is re-exported). Per-run single-file
  bundles (a bundle is already four small files; the page can fetch them in parallel).
- **Contract version**: the catalog carries `format: 1`. Readers ignore unknown fields (as the spec requires);
  an unknown `format` makes the page show an explicit message instead of guessing.

## R4. Attributes (names, kinds, derivation)

- **Decision**: attributes are a flat record of `string | number | boolean`, camelCase, listed in
  [data-model.md](data-model.md). They come from `score.json` (outcome, calls, costs, model, prior fit,
  prompt note, skill), `mcp.json` plus the loaded world (world name, rows, cols), and the folder path
  (label, run number). For a bundle they come from `bundle.json` and its `score.json`. Outcome is derived:
  `reached` if the score reached the goal; otherwise by `ended`: `budget` becomes `out of turns`, `error`
  stays `error`, and a stop without the item becomes `gave up`. A run with no `score.json` is `unfinished`.
- **Page-side kinds**: the page infers each attribute's kind (text, number, flag) from the catalog's values,
  not from a built-in list, so a field added later groups, sorts and filters with no page change (SC-005).
  Mixed kinds are treated as text.
- **Alternatives**: a fixed attribute list in the page (fails SC-005); typed attributes declared in the
  catalog (more contract to keep stable; may be added later without breaking readers).

## R5. Scanning, replay checks and caching

- **Decision**: `scan` walks the folder recursively. A directory with `score.json` plus `run.jsonl` is a run;
  a directory with `bundle.json` is a bundle; a directory with `run.jsonl` but no `score.json` is an
  unfinished run. Symbolic links are not followed. For each run the catalog builder calls the refactored
  `buildBundle` (which replays on the world) to find out whether it opens; failures become
  `unreadable` with a fixed message (`code: fixed message`, never a wrapped error's own text, per
  `AGENTS.md`). Results are cached in memory keyed by `<id>:<score.json mtime>:<run.jsonl size>`, and the
  catalog is rebuilt on each `catalog.json` request, so finished runs appear without a restart and a run
  still being written is `unfinished`.
- **Cost check**: replay of a few hundred calls is milliseconds; 200 runs should be a few seconds. If the
  cold scan misses SC-001, fall back to a cheaper readiness check (world present, log parses, score present)
  and derive frames only on open; the catalog's `preview` would then be built on first open and the tile
  would show a placeholder until then.
- **Alternatives**: derive only on open (cannot report unreadable runs in the list, fails spec Story 1
  scenario 3); watch the folder with file-system events (live view is out of scope).

## R6. `preview`: what a tile or row needs without opening the run

- **Decision**: each ready catalog entry carries `preview = { strip, table }`. `strip` is one character per
  action call: `p` placement, `c` craft, `r` refusal, `t` take-back, `.` for a call that changed nothing or
  was a read. `table` is the grid at the end of the run (item ids and nulls), which the thumbnail painter
  draws on a canvas once. Both derive from frames, so they are deterministic and add a few hundred bytes. **(held loosely)**: the thumbnail
  shows the last table; whether it should show the goal item or the best moment is open.
- **Rationale**: tiles must show a strip and a thumbnail for hundreds of runs without fetching hundreds of
  bundles, and the static host needs the same data in its catalog.
- **Alternatives**: fetch frames for visible tiles (many requests, slow on a static host); pre-rendered PNG
  thumbnails at export (a second artifact to keep in sync; ADR-004 left the choice open, and this keeps
  drawing in one place).

## R7. Testing the page

- **Decision**: (1) pure logic in plain vitest; (2) components in a jsdom vitest project with
  `@testing-library/svelte`; (3) the PixiJS scene is split into a pure scene model (frame to sprites,
  slots and effect events), tested in Node without WebGL, and a thin drawing layer that is **checked by hand**
  from the quickstart; (4) a Node test exports a small folder, serves the built page from the local process
  and from a plain static server, and asserts identical catalog and bundle responses and that the page's
  files fetch nothing from the network.
- **Deferred**: automated drawing checks. Pixel checks in a headless browser (vitest browser mode with
  Playwright, region and tolerance based) and full screenshot snapshots were weighed and set aside on
  2026-10-02: manual checking is enough to start. **Revisit when a visual regression is found.** The scene
  takes its clock and random source as inputs, so a deterministic hook for such tests can be added without a
  redesign; a gallery route of fixed states is the first thing to add if manual checking gets slow.
- **Alternatives**: Playwright or browser mode now (a Chromium download in CI and a dependency, for
  regressions not yet seen); screenshot snapshots (ADR-004 notes WebGL output can differ across GPUs).

## R8. Group, sort and filter

- **Decision**: a `View` value: `{ group: attr | null, sort: { attr, dir }, filters: Filter[], search }`.
  One grouping level. A filter is `{ attr, op, value }` with ops by kind: text `is | is not | contains`,
  number `= | ≥ | ≤`, flag `is`. `search` matches text attributes. Runs lacking the attribute form a labelled
  "none" group, sort last, and fail every filter except an "is missing" test. All of it is pure functions
  over the catalog, so reshaping them later needs no component change. **(held loosely)**: nested grouping,
  saved views and attribute tokens in the style of Finder search are possible extensions.
- **Alternatives**: a fixed world→goal→run tree (ADR-004 §3, rejected as the only structure; it is still one
  grouping a person can pick); a query language (more to learn than the four goals need).

## R9. Comparing and the two-table limit

- **Decision**: any run can be ticked on a tile or row; with two ticked, a "Compare" action shows them side
  by side as two tables, or as two adjacent rows in the list. From an open run, "Open beside…" picks the
  second run from the picker. Tables are independent. Opening a run while two tables are open replaces the
  second one, so there are never more than two live scenes (FR-015) and no dialog is needed. **(held loosely)**.
- **Alternatives**: a persistent compare mode (the spec says comparison is a presentation); a third table
  with a thumbnail fallback (more states for little use); declining with a message (extra friction).

## R10. How an item is drawn

- **Decision**: an `ItemArt` function from an item name to a texture. The default is the hashed 8×8
  symmetric creature in one of eight palettes, for every world, and the item's name is always available as a
  label (hover, the call list, a legend). **(held loosely)**: for faithful names the creatures signal
  "unknown", which may not suit; the interface lets a pack supplied with a world, or plain labels, replace it
  without touching the scene. No decision is made here about which is better.
- **Alternatives**: recognizable icons for the faithful world (needs art and a trademark review, see ADR-003);
  plain text labels only (loses the visual idiom).

## R11. Starting the process

- **Decision**: `pnpm dev scripts/viz.ts <folder> [--port N]`, default port 4747, `--port 0` for any free
  port; it prints the URL. It serves `dist-viz/` and refuses with an explicit message if the page is not
  built. For development, `pnpm dev:viz <folder>` runs `scripts/dev-viz.ts`, which starts Vite's dev server through its
  API and mounts the local process's request handler ahead of Vite's own middleware, so the page and the data
  side are exercised together with hot reload. The process
  checks the `Host` header (`127.0.0.1` or `localhost` with its port) to blunt DNS rebinding, and accepts
  GET and HEAD only. **(held loosely)**: a `pnpm viz` alias and opening the browser automatically are left
  out.
- **Alternatives**: a desktop shell or an installable binary (rejected in the ADR).

## R12. Palette and theme

- **Decision**: `viz/src/palette.ts` exports the brand values listed in the design note (Baltic, highlight,
  neutral and secondary groups) with `SOURCE` (the Needle page's address) and `READ_ON` (2026-10-02). Tailwind
  reads them through `theme.css` (`@theme` variables); the scene imports the module directly. A test checks
  that `theme.css` and `palette.ts` agree. Which color plays which role, and dark or light backdrop, are set
  during the page work and recorded in the design note; the first mock's palette stays as a reference for
  roles only.
- **Alternatives**: generating `theme.css` from the module in a build step (another moving part; a test is
  enough).

## R13. Refactoring the bundle export

- **Decision**: extract `buildBundle(runDir): Bundle` from `exportBundle`, returning the manifest, frames,
  trace lines and result in memory; `exportBundle` becomes "build then write", with identical output files and
  refusals. The server and the folder export call `buildBundle`. The manifest gains optional `priorFit`,
  `promptNote` and `skill: { name, loaded, loadedAfter }`, copied from `score.json`. The bundle privacy test
  is extended: the new fields hold only the prior-fit word, the fixed prompt sentence and the skill's name
  and counts, and nothing from the skill's text.
- **Alternatives**: duplicate the logic in the server (two copies of the privacy-sensitive code).

## R14. Fonts and offline

- **Decision**: import the three Fontsource packages' CSS and `woff2` files in `fonts.ts` so Vite emits them
  into the build; limit to the weights and the Latin subset the page uses. A test scans the built output for
  `http://` or `https://` URLs that the page would fetch.
- **Alternatives**: Google Fonts links (the mock does this; fails offline).
