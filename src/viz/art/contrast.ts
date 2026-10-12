import type { Sprite } from "./world-art.js";

/**
 * How well a sprite shows against a background (ADR-005 2.7). A sprite has no black outline, so what keeps it readable is the contrast of its
 * own pixels with the two colors it is drawn on: the dark slot of the hotbar and goal socket, and the lighter wood of the table's grid cells.
 * Contrast is the WCAG ratio of relative luminance, 1 for the same color up to 21 for black on white.
 */
const channel = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** The relative luminance of a `#rrggbb` color, 0 to 1. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => channel(Number.parseInt(hex.slice(i, i + 2), 16))) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio of two `#rrggbb` colors, from 1 (the same) to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The share, 0 to 1, of a sprite's opaque pixels whose contrast with `background` is at least `minRatio`. 0 for a sprite with no opaque pixel. */
export function visibleShare(sprite: Sprite, colors: Readonly<Record<string, string>>, background: string, minRatio: number): number {
  let opaque = 0;
  let seen = 0;
  for (const row of sprite) {
    for (const name of row) {
      if (name === null) continue;
      opaque++;
      const color = colors[name];
      if (color !== undefined && contrastRatio(color, background) >= minRatio) seen++;
    }
  }
  return opaque === 0 ? 0 : seen / opaque;
}

/** The two backgrounds a sprite is drawn on, as palette names: the dark slot, and the lightened grid cell. */
export const BACKGROUNDS = { slot: "woodDeep", cell: "woodLight" } as const;

/**
 * The share, 0 to 1, of a sprite's edge pixels (opaque, with a transparent pixel beside them) whose contrast with `background` is at least
 * `minRatio`. A sprite reads when its silhouette shows, even if a pale fill is close to a pale background, so edges are what is measured.
 */
export function edgeShare(sprite: Sprite, colors: Readonly<Record<string, string>>, background: string, minRatio: number): number {
  let edges = 0;
  let seen = 0;
  sprite.forEach((row, y) =>
    row.forEach((name, x) => {
      if (name === null) return;
      const beside = [sprite[y]?.[x - 1], sprite[y]?.[x + 1], sprite[y - 1]?.[x], sprite[y + 1]?.[x]];
      if (!beside.some((n) => n === null)) return;
      edges++;
      const color = colors[name];
      if (color !== undefined && contrastRatio(color, background) >= minRatio) seen++;
    }),
  );
  return edges === 0 ? 0 : seen / edges;
}

/** A sprite must show, on each background, at this contrast ratio ... */
export const MIN_RATIO = 2;
/** ... for at least this share of its edge pixels or of all its pixels, whichever is the greater. */
export const MIN_SHARE = 0.35;

/** How well a sprite shows on a background: the greater of its edge share and its whole-sprite share at `MIN_RATIO`. */
export const showing = (sprite: Sprite, colors: Readonly<Record<string, string>>, background: string): number =>
  Math.max(edgeShare(sprite, colors, background, MIN_RATIO), visibleShare(sprite, colors, background, MIN_RATIO));
