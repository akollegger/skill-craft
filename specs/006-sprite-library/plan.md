# Implementation Plan: A Sprite Library for the Visualizer

**Branch**: `006-sprite-library` | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-sprite-library/spec.md`

## Summary

Give the visualizer's items drawn pictures and distinct generated shapes, per ADR-005 and its 2026-10-07 amendment. The backend
(`src/viz/`) gains a shared **library** of named 8 by 8 sprites, an optional per-world **art file** that maps item names to library
names or inline drawings, and an **allocator** that gives every other item a generated glyph so no two items of a world share a
family and palette. It resolves all of it into a small **world art** object that travels in each bundle's manifest and in the
catalog, so the page stays self-contained and a bundle opens offline. The page expands world art into the sprites its scene and
thumbnails draw, and keeps today's name-only glyph as the fallback. The engine, MCP server, harness measurement and tool surface do
not change. Batch 1 of the starter set (115 drawings) ships with this feature; batch 2 is later data-only work.

## Technical Context

**Language/Version**: TypeScript (strict, ES modules) on Node 22.13+ (CI runs 22 and 24); the page targets current evergreen browsers.

**Primary Dependencies**: no new ones. zod validates the files; the page uses Svelte 5 and PixiJS as now.

**Storage**: files only. `src/viz/art/library.json` (new, committed), `worlds/<name>.art.json` (new, committed, one for the faithful
world). Nothing is written at run time.

**Testing**: vitest. Backend tests in `test/viz/`, page tests in `viz/test/`; tests written first (constitution IV).

**Target Platform**: the local visualizer process and a static host serving its export.

**Project Type**: a library plus a built page (existing layout: `src/viz/` and `viz/`).

**Performance Goals**: a scan stays interactive: the library is read once per scan (about 20 KB) and a run's world art costs a pass
over the world's item list.

**Constraints**: the page stays offline and reads only `catalog.json` and `bundles/<id>/…`; `src/viz/contract.ts` and the new
`src/viz/glyphs.ts` import nothing from Node; deterministic, no clock or randomness at run time; sprites 8 by 8.

**Scale/Scope**: about 115 library drawings, one art file, three small backend modules, one shared module moved, two schema fields,
and the page's art lookup and wiring.

## Constitution Check

*GATE: passed before research; re-checked after design.*

| Principle | Status |
|---|---|
| I. Deterministic, replayable | Pass. The allocator and resolution are pure functions of names and files; no clock, no randomness. |
| II. Data-driven worlds | Pass. The world file is unchanged; art is a sibling file the engine never reads. |
| III. Discovery over disclosure | Pass. A sprite shows an item kind and nothing about recipes; a bundle carries sprites only for items its frames already show; library names carry no meaning (spec FR-012). |
| IV. Test first | Pass. Spec FR-011's tests are written before the library, resolver and allocator; every committed art file is checked against the library. |
| V. Simplicity | Pass with a stated cost. One new data file and three small modules; the justification is ADR-005 and its amendment. |
| VI. Secrets | Not touched. |
| VII. Decisions before specs | Pass. ADR-005 (accepted) decides this; plan-level refinements to it are listed under follow-up work. |

Re-check after design: unchanged. Nothing in the data model reaches the engine, the server or the agent.

## Project Structure

### Documentation (this feature)

```text
specs/006-sprite-library/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/art.md
└── tasks.md          # /speckit-tasks, not this command
```

### Source Code (repository root)

```text
src/viz/
├── glyphs.ts            # moved from viz/src/art/glyphs.ts + the hash, generator and glyphOf from sprite.ts; Node-free (R1)
├── contract.ts          # + worldArtSchema, optional `art` on the manifest and the catalog
├── catalog.ts           # + per-world art map; cache key gains the art file and library times
└── art/
    ├── library.json     # the starter set, batch 1
    ├── library.ts       # read, validate, resolve a reference to a sprite
    ├── art-file.ts      # read and validate a world's art file; its path from the world's
    ├── allocate.ts      # glyph allocation over a world's item list
    └── world-art.ts     # build one run's world art; merge runs' art for the catalog; canonical legend
src/harness/
├── bundle.ts            # BundleManifest gains `art?`
└── export.ts            # buildBundle fills `art` through world-art.ts
worlds/
├── minecraft-inspired.art.json   # names into the library
└── README.md            # a row for the art file
viz/src/
├── art/
│   ├── sprite.ts        # imports the shared tables; palette colors stay here
│   ├── world-art.ts     # expand a world art object into an ItemArt, with the name-only fallback
│   └── index.ts
├── scene/ (handle.ts, pool.ts, TableScene.ts)   # `art` in the factory's options, used when a scene is made
└── shell/ (Thumbnail.svelte, RunView.svelte, App.svelte)   # art from the open bundle and from the catalog
test/viz/            # library, art-file, allocate, world-art, catalog, bundle-build, contract, parity extended
viz/test/            # art.test.ts extended; world-art lookup, fallback, thumbnail-equals-table
design/adr/          # ADR-005 touch-ups; notes in ADR-001, ADR-002, ADR-004; AGENTS.md layout and rules
tsconfig.build.json  # include src/**/*.json so a build carries the library
```

**Structure Decision**: the existing split is kept (backend in `src/viz/`, page in `viz/`, one shared contract). The only new
cross-boundary file is `src/viz/glyphs.ts`, the glyph tables, so the backend can allocate and the page can draw from one definition.

## Phases

The order follows the tests-first rule and the data-before-page order of spec 004.

1. **Shared tables.** Move the glyph tables, hash, generator and `glyphOf` to `src/viz/glyphs.ts`; the page imports them; existing
   art tests pass unchanged. Extend the Node-free test to the new file.
2. **Library and art file.** Tests for the library's checks and for resolution (references, shapes with materials, bad input), then
   `library.ts` and `art-file.ts`. The library file itself comes with batch 1's drawings, authored under the tests.
3. **Allocation.** Tests that pin the walk and the order independence, then `allocate.ts`.
4. **World art and the wire form.** Tests for the canonical legend, per-run covering and catalog merge, then `world-art.ts`, the contract
   fields, `buildBundle` and the catalog (including the cache key).
5. **The faithful world's art file** and the worlds README row; the test that every committed world's items resolve.
6. **The page.** Tests for the lookup, the fallback and thumbnail-equals-table, then `world-art.ts`, the scene option, the thumbnail and the
   run view.
7. **Docs and checks.** ADR touch-ups, notes in ADR-001/002/004, AGENTS.md; `pnpm typecheck`, `pnpm test`, `pnpm build:viz`, and the
   hand checks in [quickstart.md](quickstart.md).

## Complexity Tracking

No constitution violations. One cost is stated: a second data file with its own format, which ADR-005's amendment accepts.

## Follow-up work

- ADR-005 touch-ups: 2.2's last sentence (the shared glyph file replaces counts plus a pinning test), 2.1's "schema in
  `src/viz/contract.ts`" (the wire shape only), and the allocation's fixed order (+9 mod 64, research R5).
- ADR-001, ADR-002 and ADR-004 notes on the library, replacing "data side" with "backend" where they mention this feature.
- Batch 2 of the starter set, as sprite-only changes to `library.json`.
