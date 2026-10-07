# Contract: art in the catalog, the bundle and the files

Additions only; no format number changes, and a reader that ignores unknown fields still works.

## `catalog.json`

```json
{
  "format": 1,
  "runs": [ ... ],
  "art": {
    "<world name>": {
      "legend": { "a": "woodFace", "b": "woodShade", ".": null },
      "items": {
        "stick": { "rows": ["......ab", ".....ab.", "....ab..", "...ab...", "..ab....", ".ab.....", "ab......", "b......."] },
        "zorp": { "family": 2, "variant": 1, "palette": 5, "marks": [3, 17] }
      }
    }
  }
}
```

- `art` is optional and omitted when no ready run has art. It is keyed by the world name inside the world file, which is the name a
  bundle's manifest records.
- A thumbnail finds its sprite by the run's `world` attribute and goal item, falling back to `glyphOf(goal)` when either is absent.
- It names only items that appear in some ready run of that world.

## `bundle.json`

`manifest.art` has the same shape as one world's entry above and covers the items of the run's frames and goal. Absent in bundles
made before this feature. It never carries a library name, a file path, a recipe, or an item the run did not use.

## Wire rules

- Rows are eight strings of eight characters; each character is a key of `legend`. `legend` values are palette names the page
  knows, or `null`. A value the page does not know is drawn transparent.
- `marks` are two distinct integers 0 to 31. `family`, `variant` and `palette` are in range for the shared glyph tables.
- Characters in `legend` are assigned in sorted order of the palette names present (`a`, `b`, …); `.` is transparent.
- An entry that fails these checks makes the bundle unreadable (`BundleInvalid`), like any other malformed manifest field.

## `worlds/<name>.art.json` and `src/viz/art/library.json`

Backend inputs; formats are in [data-model.md](../data-model.md). Neither is ever served, exported or read by the page, the
engine, the MCP server or the agent.

## Behavior

1. Resolve each item of the run's frames and goal: a reference to library rows, inline rows, or a generated glyph.
2. Allocate generated glyphs over the world's whole item list (items without drawn art, sorted by name, pair walk of +9 mod 64).
3. Emit only the items the run uses.
4. A malformed art file or library is ignored; the affected items get generated glyphs; no error text is reported.
