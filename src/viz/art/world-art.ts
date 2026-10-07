import type { WorldArt } from "../contract.js";
import type { Glyph } from "../glyphs.js";

/**
 * The internal form of a sprite: eight rows of eight cells, each a palette name or null for transparent. Every sprite, whether it came from the
 * library, a world's art file or a shape with a material applied, is reduced to this before it is written to the wire form, so two sources never
 * need to agree on characters.
 */
export type Sprite = readonly (readonly (string | null)[])[];

/** How one item is drawn: a finished sprite, or a generated glyph. */
export type ArtEntry = { sprite: Sprite } | { glyph: Glyph };

const SIZE = 8;

export function isSprite(x: unknown): x is Sprite {
  return (
    Array.isArray(x) &&
    x.length === SIZE &&
    x.every((row) => Array.isArray(row) && row.length === SIZE && row.every((c) => c === null || typeof c === "string"))
  );
}

/** Characters a legend can use, in the order names are given them. `.` is kept for transparent. */
const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * The wire form of a world's entries: a legend that gives each palette name present a character in sorted order of the names (and `.` for
 * transparent, when a pixel is), and each drawn sprite as eight rows over it. Items are written in name order so the same entries are the same
 * bytes. A sprite's names do not depend on what else is present, only the characters chosen for them.
 */
export function toWire(entries: Readonly<Record<string, ArtEntry>>): WorldArt {
  const names = new Set<string>();
  let transparent = false;
  for (const e of Object.values(entries)) {
    if (!("sprite" in e)) continue;
    if (!isSprite(e.sprite)) throw new Error("a sprite must be eight rows of eight cells");
    for (const row of e.sprite) for (const c of row) (c === null ? (transparent = true) : names.add(c));
  }
  const sorted = [...names].sort();
  if (sorted.length > CHARS.length) throw new Error("a world's art uses more colors than a legend can name");
  const legend: WorldArt["legend"] = {};
  const char = new Map<string | null, string>();
  if (transparent) {
    legend["."] = null;
    char.set(null, ".");
  }
  sorted.forEach((n, i) => {
    legend[CHARS[i]!] = n;
    char.set(n, CHARS[i]!);
  });
  const items: WorldArt["items"] = {};
  for (const name of Object.keys(entries).sort()) {
    const e = entries[name]!;
    items[name] = "sprite" in e
      ? { rows: e.sprite.map((row) => row.map((c) => char.get(c)!).join("")) }
      : { family: e.glyph.family, variant: e.glyph.variant, palette: e.glyph.palette, marks: [...e.glyph.marks] };
  }
  return { legend, items };
}

/** The entries a wire object draws, with each drawn sprite's characters turned back into palette names. */
export function fromWire(art: WorldArt): Record<string, ArtEntry> {
  const out: Record<string, ArtEntry> = {};
  for (const [name, e] of Object.entries(art.items)) {
    out[name] = "rows" in e
      ? { sprite: e.rows.map((row) => [...row].map((c) => art.legend[c] ?? null)) }
      : { glyph: { family: e.family, variant: e.variant, palette: e.palette, marks: e.marks } };
  }
  return out;
}

/**
 * The art of several runs of one world as one object: the union of their items, an item taken from the earliest run that has it, and the
 * legend rebuilt from the names present. Undefined for no art at all.
 */
export function mergeArt(list: readonly WorldArt[]): WorldArt | undefined {
  if (list.length === 0) return undefined;
  const entries: Record<string, ArtEntry> = {};
  for (const art of list) for (const [name, e] of Object.entries(fromWire(art))) if (!(name in entries)) entries[name] = e;
  return toWire(entries);
}
