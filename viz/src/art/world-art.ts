import type { WorldArt } from "../../../src/viz/contract.ts";
import { SPRITE_SIZE } from "../../../src/viz/glyphs.ts";
import { hex, palette, type PaletteName } from "../palette.ts";
import { defaultItemArt, spriteOfGlyph, type ItemArt, type ItemSprite } from "./sprite.ts";

/** A sprite that is drawn, not generated, belongs to none of the glyph palettes. */
const DRAWN = -1;

const isPaletteName = (name: string): name is PaletteName => Object.hasOwn(palette, name);

/**
 * How a world's items are drawn, from the art a bundle's manifest or the catalog carries: a drawn entry through the palette (a color name this
 * page does not know is a transparent pixel), a generated entry through the glyph tables. An item the art does not have, or no art at all,
 * is drawn from its name alone, so a bundle made before item art opens as it always did. The same art always gives the same sprite, so a
 * thumbnail and a table that read the same art draw the same item.
 */
export function artFromWorld(art: WorldArt | undefined): ItemArt {
  if (art === undefined) return defaultItemArt;
  const made = new Map<string, ItemSprite>();
  return (name) => {
    const hit = made.get(name);
    if (hit) return hit;
    const entry = Object.hasOwn(art.items, name) ? art.items[name] : undefined;
    let sprite: ItemSprite;
    if (entry === undefined) sprite = defaultItemArt(name);
    else if ("rows" in entry) {
      const pixels = entry.rows.flatMap((row) =>
        [...row].map((ch) => {
          const color = Object.hasOwn(art.legend, ch) ? art.legend[ch] : null;
          return color !== null && color !== undefined && isPaletteName(color) ? hex(color) : null;
        }),
      );
      sprite = { width: SPRITE_SIZE, height: SPRITE_SIZE, palette: DRAWN, pixels };
    } else sprite = spriteOfGlyph(entry);
    made.set(name, sprite);
    return sprite;
  };
}
