import type { Frame } from "../../sim/frames.js";
import type { World } from "../../sim/schema.js";
import type { WorldArt } from "../contract.js";
import type { Glyph } from "../glyphs.js";
import { allocate } from "./allocate.js";
import { artFilePath, readArtFile } from "./art-file.js";
import { readLibrary, type Library } from "./library.js";

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

/** The items a run's frames show (the grid, the held items, the crafted outputs and the previewed craft) and its goal. */
export function usedItems(frames: readonly Frame[], goal: string): string[] {
  const used = new Set<string>([goal]);
  for (const f of frames) {
    for (const row of f.grid) for (const c of row) if (c !== null) used.add(c);
    for (const h of Object.keys(f.held)) used.add(h);
    if (f.crafted) used.add(f.crafted.item);
    if (f.craftable !== null) used.add(f.craftable);
  }
  return [...used].sort();
}

/**
 * How the given items of a world are drawn: the sprite its art file gives an item (by library name or inline rows), and for every other
 * item of the world a glyph allocated across the world's whole item list, so the items look the same wherever they appear and no two share a
 * shape and color. Only the items asked for are included (those a run shows), and an item the world does not have is left for the page's
 * name-only fallback. Deterministic: no clock, no randomness.
 */
export function worldArtFor(world: World, worldPath: string, used: Iterable<string>, library: Library = readLibrary()): WorldArt {
  const ids = world.items.map((i) => i.id);
  const drawn = readArtFile(artFilePath(worldPath), ids, library);
  const glyphs = allocate(ids.filter((id) => !drawn.has(id)));
  const entries: Record<string, ArtEntry> = {};
  for (const name of new Set(used)) {
    const sprite = drawn.get(name);
    const glyph = glyphs.get(name);
    if (sprite) entries[name] = { sprite };
    else if (glyph) entries[name] = { glyph };
  }
  return toWire(entries);
}
