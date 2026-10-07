/**
 * The shapes an invented item can wear, shared by the backend (which allocates them across a world) and the page (which draws them): eight
 * families of geometric glyph, each with a few variants. A variant is the left half of an 8 by 8 picture, four columns by eight rows, and
 * the right half is its mirror image, so every glyph is symmetric left to right. `b` is the body color, `a` the accent, `d` the dark outline
 * color and `.` is empty. The palette colors are the page's; only how many palettes there are lives here. Like the contract, this file
 * imports nothing from Node (a test enforces it).
 */
export interface GlyphFamily {
  name: string;
  variants: readonly (readonly string[])[];
}

export const FAMILIES: readonly GlyphFamily[] = [
  {
    name: "gem",
    variants: [
      ["...b", "..bb", ".bba", "bbaa", "bbaa", ".bba", "..bb", "...b"],
      ["...d", "..db", ".dbb", "dbba", "dbba", ".dbb", "..db", "...d"],
      ["..bb", ".bba", "bbaa", "bbab", "bbbb", ".bbb", "..bb", "...b"],
    ],
  },
  {
    name: "ring",
    variants: [
      ["..bb", ".b..", "b...", "b...", "b...", "b...", ".b..", "..bb"],
      ["..bb", ".b..", "b..a", "b.aa", "b.aa", "b..a", ".b..", "..bb"],
      [".bbb", "bb..", "b..a", "b.aa", "b.aa", "b..a", "bb..", ".bbb"],
    ],
  },
  {
    name: "cross",
    variants: [
      ["...b", "...b", "...b", "bbba", "bbba", "...b", "...b", "...b"],
      ["..bb", "..ba", "bbba", "bbaa", "bbaa", "bbba", "..ba", "..bb"],
      ["b...", ".b..", "..b.", "...a", "...a", "..b.", ".b..", "b..."],
    ],
  },
  {
    name: "pyramid",
    variants: [
      ["...a", "...a", "..ba", "..ba", ".bba", ".bba", "bbba", "bbba"],
      ["bbba", "bbba", ".bba", ".bba", "..ba", "..ba", "...a", "...a"],
      ["...b", "..ba", ".bba", "bbba", "...b", "..ba", ".bba", "bbba"],
    ],
  },
  {
    name: "block",
    variants: [
      [".bbb", "bbbb", "bbaa", "bbaa", "bbaa", "bbaa", "bbbb", ".bbb"],
      ["dddd", "dbbb", "dbba", "dbaa", "dbaa", "dbba", "dbbb", "dddd"],
      ["..bb", ".bbb", "bbaa", "bbaa", "bbaa", "bbaa", ".bbb", "..bb"],
    ],
  },
  {
    name: "bars",
    variants: [
      ["a.a.", "b.b.", "b.b.", "b.b.", "b.b.", "b.b.", "b.b.", "b.b."],
      ["...b", "..a.", ".b..", "a...", "...b", "..a.", ".b..", "a..."],
      ["bbbb", "bbbb", "....", "aaaa", "aaaa", "....", "bbbb", "bbbb"],
    ],
  },
  {
    name: "rune",
    variants: [
      ["bbbb", "b...", "b.bb", "b.b.", "b.b.", "b.bb", "b...", "bbbb"],
      ["bbbb", "bbbb", "bb..", "bb.a", "bb.a", "bb..", "bbbb", "bbbb"],
      ["dddd", "d...", "d.aa", "d.ab", "d.ab", "d.aa", "d...", "dddd"],
    ],
  },
  {
    name: "burst",
    variants: [
      ["...b", "b..b", ".b.b", "..ba", "..ba", ".b.b", "b..b", "...b"],
      ["...b", "...b", "..bb", "bbba", "bbba", "..bb", "...b", "...b"],
      ["...b", "b..b", ".bab", "..ba", "..ba", ".bab", "b..b", "...b"],
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
  /** Positions in the variant's left half, 0 to 31, of body pixels drawn in the accent color: the name's own mark on the shape. */
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
  rows.forEach((row, y) => [...row].forEach((c, x) => c === "b" && body.push(y * 4 + x)));
  const marks: number[] = [];
  for (let i = 0; i < MARKS && body.length > 0; i++) marks.push(body.splice(Math.floor(next() * body.length), 1)[0]!);
  return { family, variant, palette, marks };
}
