import { hex, type PaletteName } from "../palette.ts";

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
const MIN_PIXELS = 20;

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

// Likelihood a pixel is filled by column, outermost first: a blob that is fuller toward the middle reads as a creature.
const FILL = [0.3, 0.55, 0.8, 0.9];

/**
 * The default art: each name hashes to a small creature that mirrors left to right, in one of eight palettes.
 * The same name always gives the same sprite, and an invented name needs no art.
 */
export const defaultItemArt: ItemArt = (name) => {
  const h = hashName(name);
  for (let attempt = 0; attempt < 16; attempt++) {
    const next = rng(h + Math.imul(attempt, 0x9e3779b9));
    const palette = Math.floor(next() * PALETTES.length);
    const { colors } = PALETTES[palette]!;
    const left: (number | null)[][] = [];
    for (let y = 0; y < SIZE; y++) {
      const edge = y === 0 || y === SIZE - 1 ? 0.6 : 1;
      left.push(
        FILL.map((p) => {
          const filled = next() < p * edge;
          const accent = next() < 0.25;
          return filled ? colors[accent ? 1 : 0] : null;
        }),
      );
    }
    // Eyes: a dark pixel on the third column of the fourth row, mirrored on the right, with body between them,
    // so every sprite looks back.
    left[3]![3] = colors[0];
    left[3]![2] = OUTLINE;
    const pixels: (number | null)[] = [];
    for (let y = 0; y < SIZE; y++) {
      const row = left[y]!;
      for (let x = 0; x < SIZE; x++) pixels.push(x < HALF ? row[x]! : row[SIZE - 1 - x]!);
    }
    if (pixels.filter((p) => p !== null).length >= MIN_PIXELS) return { width: SIZE, height: SIZE, palette, pixels };
  }
  // Sixteen thin draws in a row would be remarkable; a plain block keeps the function total.
  const { colors } = PALETTES[h % PALETTES.length]!;
  return { width: SIZE, height: SIZE, palette: h % PALETTES.length, pixels: Array<number | null>(SIZE * SIZE).fill(colors[0]) };
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
