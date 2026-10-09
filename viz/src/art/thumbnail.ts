import { palette } from "../palette.ts";
import type { ItemArt, ItemSprite } from "./sprite.ts";

/** The part of a 2D canvas context the painter uses, so tests can pass a recorder. */
export interface PaintContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
}

const css = (c: number): string => `#${c.toString(16).padStart(6, "0")}`;

/**
 * Draw a table (item names and nulls) into a canvas once: each item's art fills a square cell of `cell` pixels,
 * scaled with whole-pixel edges so it stays crisp. Empty cells draw nothing. Thumbnails on tiles and rows come
 * from this, so a list of hundreds holds no WebGL context.
 */
export function paintTable(ctx: PaintContext, table: readonly (readonly (string | null)[])[], art: ItemArt, cell: number): void {
  table.forEach((row, r) =>
    row.forEach((name, c) => {
      if (name === null) return;
      const s = art(name);
      const ps = cell / s.width;
      for (let py = 0; py < s.height; py++) {
        for (let px = 0; px < s.width; px++) {
          const color = s.pixels[py * s.width + px];
          if (color === null || color === undefined) continue;
          const x0 = Math.round(c * cell + px * ps);
          const x1 = Math.round(c * cell + (px + 1) * ps);
          const y0 = Math.round(r * cell + py * ps);
          const y1 = Math.round(r * cell + (py + 1) * ps);
          ctx.fillStyle = css(color);
          ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
        }
      }
    }),
  );
}

/** The size in pixels of a table painted at `cell` pixels per cell. */
export const tableSize = (table: readonly (readonly (string | null)[])[], cell: number): { width: number; height: number } => ({
  width: Math.max(0, ...table.map((r) => r.length)) * cell,
  height: table.length * cell,
});

/** Pixels per cell for a grid with `size` cells on its longest side: 24 up to three, then 16, the sprite's own size. A sprite is never drawn smaller. */
export const cellSizeFor = (size: number): 24 | 16 => (size <= 3 ? 24 : 16);

/**
 * The goal slot is twenty units square: the 16-unit sprite, a unit of padding all round, and a one-unit stroke. A unit is `scale`
 * pixels and is the same size as one pixel of the art, so the stroke is exactly one art pixel wide, at any whole scale.
 */
export const SLOT_UNITS = 20;
export const slotSize = (scale: number): number => SLOT_UNITS * scale;

const channels = (value: string): [number, number, number] => [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16)) as [number, number, number];
const toCss = (rgb: number): string => `#${rgb.toString(16).padStart(6, "0")}`;
/**
 * A color greyed out: its brightness as a grey, nudged a little toward the socket's so it sits in the slot. Darkening alone would lose
 * the dark sprites in the dark socket; grey keeps every shape readable, and reads at once as "not lit".
 */
function greyedOut(color: number): string {
  const grey = Math.round(0.299 * ((color >> 16) & 0xff) + 0.587 * ((color >> 8) & 0xff) + 0.114 * (color & 0xff));
  const [r, g, b] = channels(palette.woodDeep).map((d) => Math.round(grey + (d - grey) * 0.3)) as [number, number, number];
  return toCss((r << 16) | (g << 8) | b);
}

/**
 * The goal as a thumbnail: the item the run was asked to make, in a dark socket with a one-art-pixel stroke. A run that
 * reached it shows the item in its own colors; any other shows the same item greyed out. Whatever the
 * outcome, runs for the same goal look alike, so a list groups by sight. Drawn into a 2D canvas once, so a list of hundreds
 * holds no WebGL context. With no sprite (a run that does not name its goal) it is an empty socket.
 */
export function paintGoalSlot(ctx: PaintContext, sprite: ItemSprite | undefined, options: { scale: number; reached: boolean }): void {
  const k = Math.max(1, Math.floor(options.scale));
  const rect = (x: number, y: number, w: number, h: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.fillRect(x * k, y * k, w * k, h * k);
  };
  const U = SLOT_UNITS;
  rect(0, 0, U, U, palette.woodShade); // the stroke: one art pixel, all round
  rect(1, 1, U - 2, U - 2, palette.woodDeep); // the socket
  if (!sprite) return;
  const at = 2; // past the stroke and one unit of padding
  for (let py = 0; py < sprite.height; py++) {
    for (let px = 0; px < sprite.width; px++) {
      const color = sprite.pixels[py * sprite.width + px];
      if (color === null || color === undefined) continue;
      rect(at + px, at + py, 1, 1, options.reached ? toCss(color) : greyedOut(color));
    }
  }
}
