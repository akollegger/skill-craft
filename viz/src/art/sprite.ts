import { hex, type PaletteName } from "../palette.ts";
import { FAMILIES } from "./glyphs.ts";

/** An 8 by 8 picture: one color per pixel as 0xRRGGBB, or null for transparent. Row by row, top to bottom. */
export interface ItemSprite {
  width: number;
  height: number;
  /** Which of the palettes below the sprite uses, so a legend or test can group by it. */
  palette: number;
  pixels: (number | null)[];
}

/** How an item is drawn: a function of its name alone, so a world's own art can replace it without a scene change. */
export type ItemArt = (name: string) => ItemSprite;

const OUTLINE = hex("black");
const pair = (body: PaletteName, accent: PaletteName) => ({ colors: [hex(body), hex(accent)] as const });

/** Eight palettes, drawn from the brand palette. Which colors mean what in the rest of the page is separate. */
export const PALETTES = [
  pair("midBaltic", "lightBaltic"),
  pair("forest", "lightForest"),
  pair("marigold", "lightMarigold"),
  pair("hibiscus", "lightHibiscus"),
  pair("highlightPeriwinkle", "lightBaltic"),
  pair("midForest", "midMarigold"),
  pair("midHibiscus", "cream"),
  pair("baltic", "highlightYellow"),
] as const;

const SIZE = 8;
const HALF = SIZE / 2;

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

const MARKS = 2;

/** A name's glyph: a pure function of the name. The first three choices are the ones the eye sees; the marks tell apart what they leave alike. */
export function glyphOf(name: string): Glyph {
  const next = rng(hashName(name));
  const family = Math.floor(next() * FAMILIES.length);
  const palette = Math.floor(next() * PALETTES.length);
  const variant = Math.floor(next() * FAMILIES[family]!.variants.length);
  const rows = FAMILIES[family]!.variants[variant]!;
  const body: number[] = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => c === "b" && body.push(y * 4 + x)));
  const marks: number[] = [];
  for (let i = 0; i < MARKS && body.length > 0; i++) marks.push(body.splice(Math.floor(next() * body.length), 1)[0]!);
  return { family, variant, palette, marks };
}

/**
 * The default art: each name gets a geometric glyph (a gem, a ring, a cross, a pyramid, a block, bars, a rune or a burst) mirrored left
 * to right, in one of eight palettes. The same name always gives the same sprite, and an invented name needs no art. Nothing here knows
 * the rest of the world, so two items can share a family and a palette; the marks keep their pixels apart, and a world's own art
 * file (when it has one) is what keeps them apart to the eye.
 */
export const defaultItemArt: ItemArt = (name) => {
  const { family, variant, palette, marks } = glyphOf(name);
  const { colors } = PALETTES[palette]!;
  const rows = FAMILIES[family]!.variants[variant]!;
  const marked = new Set(marks);
  const pixels: (number | null)[] = [];
  for (let y = 0; y < SIZE; y++) {
    const half = [...rows[y]!].map((c, x) => (c === "." ? null : c === "d" ? OUTLINE : c === "a" || marked.has(y * 4 + x) ? colors[1] : colors[0]));
    for (let x = 0; x < SIZE; x++) pixels.push(x < HALF ? half[x]! : half[SIZE - 1 - x]!);
  }
  return { width: SIZE, height: SIZE, palette, pixels };
};

/** The sprite as RGBA bytes, for making a texture. */
export function spriteToRGBA(s: ItemSprite): Uint8ClampedArray {
  const out = new Uint8ClampedArray(s.width * s.height * 4);
  s.pixels.forEach((c, i) => {
    if (c === null) return;
    out[i * 4] = (c >> 16) & 0xff;
    out[i * 4 + 1] = (c >> 8) & 0xff;
    out[i * 4 + 2] = c & 0xff;
    out[i * 4 + 3] = 255;
  });
  return out;
}
