import { hex, type PaletteName } from "../palette.ts";
import { FAMILIES, glyphOf, HALF, SPRITE_SIZE, type Glyph } from "../../../src/viz/glyphs.ts";

/** A 16 by 16 picture: one color per pixel as 0xRRGGBB, or null for transparent. Row by row, top to bottom. */
export interface ItemSprite {
  width: number;
  height: number;
  /** Which of the palettes below the sprite uses, so a legend or test can group by it. */
  palette: number;
  pixels: (number | null)[];
}

/** How an item is drawn: a function of its name alone, so a world's own art can replace it without a scene change. */
export type ItemArt = (name: string) => ItemSprite;

const tri = (body: PaletteName, accent: PaletteName, edge: PaletteName) => ({ colors: [hex(body), hex(accent), hex(edge)] as const });

/**
 * Eight palettes, drawn from the brand palette: a body, a lighter accent and a darker edge of the same hue. A glyph has no black outline;
 * its edge pixels take the darker color, so it reads on the dark slot and on the lighter grid cell. Which colors mean what in the rest of
 * the page is separate.
 */
export const PALETTES = [
  tri("baltic", "lightBaltic", "darkBaltic"),
  tri("midForest", "lightForest", "forest"),
  tri("marigold", "lightMarigold", "woodShade"),
  tri("midHibiscus", "lightHibiscus", "hibiscus"),
  tri("highlightPeriwinkle", "lightBaltic", "midBaltic"),
  tri("slateFace", "slateHighlight", "slateShade"),
  tri("lightHibiscus", "cream", "hibiscus"),
  tri("cream", "lightMarigold", "woodShade"),
] as const;

export { glyphOf, hashName } from "../../../src/viz/glyphs.ts";

const SIZE = SPRITE_SIZE;

/** A glyph drawn: its family's variant mirrored left to right in its palette, the glyph's marks in the accent color, and its edge in the darker one. */
export function spriteOfGlyph({ family, variant, palette, marks }: Glyph): ItemSprite {
  const [body, accent, edge] = PALETTES[palette]!.colors;
  const rows = FAMILIES[family]!.variants[variant]!;
  const marked = new Set(marks);
  const pixels: (number | null)[] = [];
  for (let y = 0; y < SIZE; y++) {
    const half = [...rows[y]!].map((c, x) => (c === "." ? null : c === "a" || marked.has(y * HALF + x) ? accent : body));
    for (let x = 0; x < SIZE; x++) pixels.push(x < HALF ? half[x]! : half[SIZE - 1 - x]!);
  }
  // The edge: an opaque pixel with a transparent one next to it is drawn in the darker color, so the shape is outlined from within and no
  // pixel is spent on a black border.
  const at = (x: number, y: number): number | null | undefined => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? undefined : pixels[y * SIZE + x]);
  const shaded = pixels.map((p, i) => {
    if (p === null) return null;
    const x = i % SIZE, y = Math.floor(i / SIZE);
    return at(x - 1, y) === null || at(x + 1, y) === null || at(x, y - 1) === null || at(x, y + 1) === null ? edge : p;
  });
  return { width: SIZE, height: SIZE, palette, pixels: shaded };
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
