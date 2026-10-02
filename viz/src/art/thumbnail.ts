import type { ItemArt } from "./sprite.ts";

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

/** Pixels per cell for a grid with `size` cells on its longest side: a multiple of the 8-pixel sprite, smaller as the grid grows. */
export const cellSizeFor = (size: number): 24 | 16 | 8 => (size <= 3 ? 24 : size <= 6 ? 16 : 8);
