import { readFileSync, statSync } from "node:fs";
import { SPRITE_SIZE } from "../glyphs.js";
import { resolveReference, type Library } from "./library.js";
import type { Sprite } from "./world-art.js";

/** `worlds/forge.json` is paired with `worlds/forge.art.json`, as the notes file is. */
export const artFilePath = (worldPath: string): string => worldPath.replace(/\.json$/, ".art.json");

/** The art file's modification time, for a run's cache key; 0 when it is missing. */
export const artFileStamp = (worldPath: string): number => statSync(artFilePath(worldPath), { throwIfNoEntry: false })?.mtimeMs ?? 0;

const SIZE = SPRITE_SIZE;
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * The sprites a world's art file draws for the items the world has. An item's value is a library reference, or sixteen rows of sixteen characters
 * over the file's own `legend`. A file that cannot be read or has the wrong format gives nothing, and an entry for an item the world lacks, an
 * unknown reference or rows that do not fit gives nothing for that item, so the rest of the run is never refused over art. Nothing from the file
 * is kept except the sprites.
 */
export function readArtFile(path: string, items: readonly string[], library: Library): Map<string, Sprite> {
  const out = new Map<string, Sprite>();
  let file: unknown;
  try {
    file = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return out;
  }
  if (!isRecord(file) || file["format"] !== 1 || !isRecord(file["items"])) return out;
  const legend = isRecord(file["legend"]) ? file["legend"] : {};
  const wanted = new Set(items);
  for (const [item, value] of Object.entries(file["items"])) {
    if (!wanted.has(item)) continue;
    const sprite = typeof value === "string" ? resolveReference(library, value) : inlineSprite(value, legend);
    if (sprite) out.set(item, sprite);
  }
  return out;
}

function inlineSprite(rows: unknown, legend: Record<string, unknown>): Sprite | undefined {
  if (!Array.isArray(rows) || rows.length !== SIZE) return undefined;
  const sprite: (string | null)[][] = [];
  for (const row of rows) {
    if (typeof row !== "string" || [...row].length !== SIZE) return undefined;
    const cells: (string | null)[] = [];
    for (const ch of row) {
      const v = Object.hasOwn(legend, ch) ? legend[ch] : undefined;
      if (v === undefined || (v !== null && typeof v !== "string")) return undefined;
      cells.push(v);
    }
    sprite.push(cells);
  }
  return sprite;
}
