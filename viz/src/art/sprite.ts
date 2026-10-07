import { hex, type PaletteName } from "../palette.ts";
import { FAMILIES, glyphOf, type Glyph } from "../../../src/viz/glyphs.ts";

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

export { glyphOf, hashName } from "../../../src/viz/glyphs.ts";

const SIZE = 8;
const HALF = SIZE / 2;

/** A glyph drawn: its family's variant mirrored left to right in its palette, with the glyph's marks in the accent color. */
export function spriteOfGlyph({ family, variant, palette, marks }: Glyph): ItemSprite {
  const { colors } = PALETTES[palette]!;
  const rows = FAMILIES[family]!.variants[variant]!;
  const marked = new Set(marks);
  const pixels: (number | null)[] = [];
  for (let y = 0; y < SIZE; y++) {
    const half = [...rows[y]!].map((c, x) => (c === "." ? null : c === "d" ? OUTLINE : c === "a" || marked.has(y * 4 + x) ? colors[1] : colors[0]));
    for (let x = 0; x < SIZE; x++) pixels.push(x < HALF ? half[x]! : half[SIZE - 1 - x]!);
  }
  return { width: SIZE, height: SIZE, palette, pixels };
}

/**
 * The default art: each name gets a geometric glyph (a gem, a ring, a cross, a pyramid, a block, bars, a rune or a burst) mirrored left
 * to right, in one of eight palettes. The same name always gives the same sprite, and an invented name needs no art. Nothing here knows
 * the rest of the world, so two items can share a family and a palette; the marks keep their pixels apart. A bundle's world art is what
 * keeps them apart to the eye, and this is what a bundle without art falls back to.
 */
export const defaultItemArt: ItemArt = (name) => spriteOfGlyph(glyphOf(name));

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
