/**
 * The shapes an invented item can wear, shared by the backend (which allocates them across a world) and the page (which draws them): eight
 * families of geometric glyph, each with a few variants. A variant is the left half of a 16 by 16 picture, eight columns by sixteen rows, and
 * the right half is its mirror image, so every glyph is symmetric left to right. `b` is the body color, `a` the accent and `.` is empty;
 * the page shades the glyph's edge in a darker color of its palette, so there is no outline in the table. The palette colors are the page's;
 * only how many palettes there are lives here. Like the contract, this file imports nothing from Node (a test enforces it).
 */

/** Every sprite is this many pixels wide and tall: the smallest size drawn, and the only one read (ADR-005 2.7). */
export const SPRITE_SIZE = 16;
/** A glyph's variant is its left half, this many columns wide. */
export const HALF = SPRITE_SIZE / 2;

export interface GlyphFamily {
  name: string;
  variants: readonly (readonly string[])[];
}

export const FAMILIES: readonly GlyphFamily[] = [
  {
    name: "gem",
    variants: [
      [
        "......bb",
        "......bb",
        "....bbbb",
        "....bbbb",
        "..bbbbaa",
        "..bbbbaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "..bbbbaa",
        "..bbbbaa",
        "....bbbb",
        "....bbbb",
        "......bb",
        "......bb",
      ],
      [
        "......bb",
        "......bb",
        "....bbbb",
        "....bbbb",
        "..bbbbbb",
        "..bbbbbb",
        "bbbbbbaa",
        "bbbbbbaa",
        "bbbbbbaa",
        "bbbbbbaa",
        "..bbbbbb",
        "..bbbbbb",
        "....bbbb",
        "....bbbb",
        "......bb",
        "......bb",
      ],
      [
        "....bbbb",
        "....bbbb",
        "..bbbbaa",
        "..bbbbaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaabb",
        "bbbbaabb",
        "bbbbbbbb",
        "bbbbbbbb",
        "..bbbbbb",
        "..bbbbbb",
        "....bbbb",
        "....bbbb",
        "......bb",
        "......bb",
      ],
    ],
  },
  {
    name: "ring",
    variants: [
      [
        "....bbbb",
        "....bbbb",
        "..bb....",
        "..bb....",
        "bb......",
        "bb......",
        "bb......",
        "bb......",
        "bb......",
        "bb......",
        "bb......",
        "bb......",
        "..bb....",
        "..bb....",
        "....bbbb",
        "....bbbb",
      ],
      [
        "....bbbb",
        "....bbbb",
        "..bb....",
        "..bb....",
        "bb....aa",
        "bb....aa",
        "bb..aaaa",
        "bb..aaaa",
        "bb..aaaa",
        "bb..aaaa",
        "bb....aa",
        "bb....aa",
        "..bb....",
        "..bb....",
        "....bbbb",
        "....bbbb",
      ],
      [
        "..bbbbbb",
        "..bbbbbb",
        "bbbb....",
        "bbbb....",
        "bb....aa",
        "bb....aa",
        "bb..aaaa",
        "bb..aaaa",
        "bb..aaaa",
        "bb..aaaa",
        "bb....aa",
        "bb....aa",
        "bbbb....",
        "bbbb....",
        "..bbbbbb",
        "..bbbbbb",
      ],
    ],
  },
  {
    name: "cross",
    variants: [
      [
        "......bb",
        "......bb",
        "......bb",
        "......bb",
        "......bb",
        "......bb",
        "bbbbbbaa",
        "bbbbbbaa",
        "bbbbbbaa",
        "bbbbbbaa",
        "......bb",
        "......bb",
        "......bb",
        "......bb",
        "......bb",
        "......bb",
      ],
      [
        "....bbbb",
        "....bbbb",
        "....bbaa",
        "....bbaa",
        "bbbbbbaa",
        "bbbbbbaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbbbaa",
        "bbbbbbaa",
        "....bbaa",
        "....bbaa",
        "....bbbb",
        "....bbbb",
      ],
      [
        "bb......",
        "bb......",
        "..bb....",
        "..bb....",
        "....bb..",
        "....bb..",
        "......aa",
        "......aa",
        "......aa",
        "......aa",
        "....bb..",
        "....bb..",
        "..bb....",
        "..bb....",
        "bb......",
        "bb......",
      ],
    ],
  },
  {
    name: "pyramid",
    variants: [
      [
        "......aa",
        "......aa",
        "......aa",
        "......aa",
        "....bbaa",
        "....bbaa",
        "....bbaa",
        "....bbaa",
        "..bbbbaa",
        "..bbbbaa",
        "..bbbbaa",
        "..bbbbaa",
        "bbbbbbaa",
        "bbbbbbaa",
        "bbbbbbaa",
        "bbbbbbaa",
      ],
      [
        "bbbbbbaa",
        "bbbbbbaa",
        "bbbbbbaa",
        "bbbbbbaa",
        "..bbbbaa",
        "..bbbbaa",
        "..bbbbaa",
        "..bbbbaa",
        "....bbaa",
        "....bbaa",
        "....bbaa",
        "....bbaa",
        "......aa",
        "......aa",
        "......aa",
        "......aa",
      ],
      [
        "......bb",
        "......bb",
        "....bbaa",
        "....bbaa",
        "..bbbbaa",
        "..bbbbaa",
        "bbbbbbaa",
        "bbbbbbaa",
        "......bb",
        "......bb",
        "....bbaa",
        "....bbaa",
        "..bbbbaa",
        "..bbbbaa",
        "bbbbbbaa",
        "bbbbbbaa",
      ],
    ],
  },
  {
    name: "block",
    variants: [
      [
        "..bbbbbb",
        "..bbbbbb",
        "bbbbbbbb",
        "bbbbbbbb",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbbbbb",
        "bbbbbbbb",
        "..bbbbbb",
        "..bbbbbb",
      ],
      [
        "bbbbbbbb",
        "bbbbbbbb",
        "bbbbbbbb",
        "bbbbbbbb",
        "bbbbbbaa",
        "bbbbbbaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbbbaa",
        "bbbbbbaa",
        "bbbbbbbb",
        "bbbbbbbb",
        "bbbbbbbb",
        "bbbbbbbb",
      ],
      [
        "....bbbb",
        "....bbbb",
        "..bbbbbb",
        "..bbbbbb",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "bbbbaaaa",
        "..bbbbbb",
        "..bbbbbb",
        "....bbbb",
        "....bbbb",
      ],
    ],
  },
  {
    name: "bars",
    variants: [
      [
        "aa..aa..",
        "aa..aa..",
        "bb..bb..",
        "bb..bb..",
        "bb..bb..",
        "bb..bb..",
        "bb..bb..",
        "bb..bb..",
        "bb..bb..",
        "bb..bb..",
        "bb..bb..",
        "bb..bb..",
        "bb..bb..",
        "bb..bb..",
        "bb..bb..",
        "bb..bb..",
      ],
      [
        "......bb",
        "......bb",
        "....aa..",
        "....aa..",
        "..bb....",
        "..bb....",
        "aa......",
        "aa......",
        "......bb",
        "......bb",
        "....aa..",
        "....aa..",
        "..bb....",
        "..bb....",
        "aa......",
        "aa......",
      ],
      [
        "bbbbbbbb",
        "bbbbbbbb",
        "bbbbbbbb",
        "bbbbbbbb",
        "........",
        "........",
        "aaaaaaaa",
        "aaaaaaaa",
        "aaaaaaaa",
        "aaaaaaaa",
        "........",
        "........",
        "bbbbbbbb",
        "bbbbbbbb",
        "bbbbbbbb",
        "bbbbbbbb",
      ],
    ],
  },
  {
    name: "rune",
    variants: [
      [
        "bbbbbbbb",
        "bbbbbbbb",
        "bb......",
        "bb......",
        "bb..bbbb",
        "bb..bbbb",
        "bb..bb..",
        "bb..bb..",
        "bb..bb..",
        "bb..bb..",
        "bb..bbbb",
        "bb..bbbb",
        "bb......",
        "bb......",
        "bbbbbbbb",
        "bbbbbbbb",
      ],
      [
        "bbbbbbbb",
        "bbbbbbbb",
        "bbbbbbbb",
        "bbbbbbbb",
        "bbbb....",
        "bbbb....",
        "bbbb..aa",
        "bbbb..aa",
        "bbbb..aa",
        "bbbb..aa",
        "bbbb....",
        "bbbb....",
        "bbbbbbbb",
        "bbbbbbbb",
        "bbbbbbbb",
        "bbbbbbbb",
      ],
      [
        "bbbbbbbb",
        "bbbbbbbb",
        "bb......",
        "bb......",
        "bb..aaaa",
        "bb..aaaa",
        "bb..aabb",
        "bb..aabb",
        "bb..aabb",
        "bb..aabb",
        "bb..aaaa",
        "bb..aaaa",
        "bb......",
        "bb......",
        "bbbbbbbb",
        "bbbbbbbb",
      ],
    ],
  },
  {
    name: "burst",
    variants: [
      [
        "......bb",
        "......bb",
        "bb....bb",
        "bb....bb",
        "..bb..bb",
        "..bb..bb",
        "....bbaa",
        "....bbaa",
        "....bbaa",
        "....bbaa",
        "..bb..bb",
        "..bb..bb",
        "bb....bb",
        "bb....bb",
        "......bb",
        "......bb",
      ],
      [
        "......bb",
        "......bb",
        "......bb",
        "......bb",
        "....bbbb",
        "....bbbb",
        "bbbbbbaa",
        "bbbbbbaa",
        "bbbbbbaa",
        "bbbbbbaa",
        "....bbbb",
        "....bbbb",
        "......bb",
        "......bb",
        "......bb",
        "......bb",
      ],
      [
        "......bb",
        "......bb",
        "bb....bb",
        "bb....bb",
        "..bbaabb",
        "..bbaabb",
        "....bbaa",
        "....bbaa",
        "....bbaa",
        "....bbaa",
        "..bbaabb",
        "..bbaabb",
        "bb....bb",
        "bb....bb",
        "......bb",
        "......bb",
      ],
    ],
  },
];

/** How many palettes the page draws glyphs in. A test in the page fails if its palette table stops matching. */
export const PALETTE_COUNT = 8;

/** FNV-1a over the name's UTF-16 units: small, stable and good enough to spread short item names. */
export function hashName(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a few lines, and deterministic from a seed. Used only to draw sprites. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Which glyph a name wears: its family, which variant of the family, which palette, and the pixels the name moves to the accent color. */
export interface Glyph {
  family: number;
  variant: number;
  palette: number;
  /** Positions in the variant's left half, 0 to 127 (`row * 8 + column`), of body pixels drawn in the accent color: the name's own mark on the shape. */
  marks: readonly number[];
}

/** How many body pixels a glyph recolors to the accent color. */
export const MARKS = 2;

/** The family-and-palette pair a name hashes to, as `family * PALETTE_COUNT + palette`, 0 to 63 (the first two draws of the name's generator). */
export function ownPair(name: string): number {
  const next = rng(hashName(name));
  const family = Math.floor(next() * FAMILIES.length);
  const palette = Math.floor(next() * PALETTE_COUNT);
  return family * PALETTE_COUNT + palette;
}

/**
 * A name's glyph: a pure function of the name. The first three choices are the ones the eye sees; the marks tell apart what they leave alike.
 * `pair` replaces the family and palette the name hashes to (a world's allocation moves an item off a pair another item has); the name's own
 * draws still decide the variant and the marks, so an item that was not moved wears exactly the glyph it always did.
 */
export function glyphOf(name: string, pair?: number): Glyph {
  const next = rng(hashName(name));
  let family = Math.floor(next() * FAMILIES.length);
  let palette = Math.floor(next() * PALETTE_COUNT);
  if (pair !== undefined) {
    family = Math.floor(pair / PALETTE_COUNT);
    palette = pair % PALETTE_COUNT;
  }
  const variant = Math.floor(next() * FAMILIES[family]!.variants.length);
  const rows = FAMILIES[family]!.variants[variant]!;
  const body: number[] = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => c === "b" && body.push(y * HALF + x)));
  const marks: number[] = [];
  for (let i = 0; i < MARKS && body.length > 0; i++) marks.push(body.splice(Math.floor(next() * body.length), 1)[0]!);
  return { family, variant, palette, marks };
}
