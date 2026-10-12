# Data Model: A Sprite Library for the Visualizer

## Sprite (internal form)

Sixteen rows of sixteen cells, each a palette name or `null` (transparent). Every sprite, from any source, is reduced to this before
output (research R4). A sprite is valid when it is exactly 16 by 16 and every name is a palette name or `null`.

## Library (`src/viz/art/library.json`)

| Field | Meaning |
|---|---|
| `format` | `1` |
| `legend` | character → palette name or `null`; `m` and `M` are reserved and not keys |
| `sprites` | name → sixteen strings of sixteen characters, each a key of `legend` |
| `shapes` | name → sixteen strings that also use `m` (material body) and `M` (material shade) |
| `materials` | name → `[body, shade]`, two palette names |

Names are lowercase kebab-case and unique across `sprites` and `shapes`. A **reference** is a sprite name, or `shape/material` for a
shape and one of its materials. No two sprites share a pixel pattern once resolved (the pickaxes differ by material).

## Art file (`<world>.art.json`)

| Field | Meaning |
|---|---|
| `format` | `1` |
| `legend` | optional; character → palette name or `null`, for inline rows |
| `items` | item name → a reference (string) or inline rows (sixteen strings of sixteen characters) |

Read only by the backend. An item the world lacks, an unknown reference, or a row of the wrong size drops that entry. An unreadable
or malformed file is ignored whole.

## World art (the wire form, in a manifest and in the catalog)

| Field | Meaning |
|---|---|
| `legend` | character → palette name or `null`, built from the names present, in sorted order |
| `items` | item name → `{ rows }` (drawn: sixteen strings over `legend`) or `{ family, variant, palette, marks }` (a generated glyph) |

A manifest's `art` covers the items of that run's frames and goal. The catalog's `art` is a map from world name to world art, the
union of its ready runs' items; where two runs of one world disagree about an item, the run first in catalog order supplies it.
A reader that lacks the field draws every item as `glyphOf(name)`.

## Generated glyph

`family` 0 to 7, `variant` 0 to 2, `palette` 0 to 7, and two `marks`, positions 0 to 127 in the variant's left half (eight columns by sixteen rows). A glyph whose own
pair is free equals `glyphOf(name)`; a moved glyph keeps its name's variant draw and marks.

## State changes

None: nothing is written. A scan recomputes world art when a world file, art file, library file or run changes (cache key).
