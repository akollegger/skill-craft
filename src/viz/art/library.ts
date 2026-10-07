import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SPRITE_SIZE } from "../glyphs.js";
import type { Sprite } from "./world-art.js";

/**
 * The shared library of named 16 by 16 sprites that worlds reference by name (ADR-005 2.5). A name says what is drawn, never what an item is or
 * how it is made. A *sprite* is eight rows of eight characters over `legend`; a *shape* is a sprite whose `m` and `M` stand for the body and
 * the shade of a material, so one drawing serves a pickaxe in every material. A reference is a sprite name (`log`) or `shape/material`
 * (`pickaxe/iron`). Read only by this backend, at scan time, so an edit shows at the next scan.
 */
export interface Library {
  legend: Record<string, string | null>;
  sprites: Record<string, readonly string[]>;
  shapes: Record<string, readonly string[]>;
  materials: Record<string, readonly [string, string]>;
}

export const EMPTY_LIBRARY: Library = { legend: {}, sprites: {}, shapes: {}, materials: {} };

/** Where the committed library is, beside this file (and beside the compiled file in a build). */
export const libraryPath = (): string => fileURLToPath(new URL("./library.json", import.meta.url));

/** The library file's modification time, for a run's cache key; 0 when it is missing. */
export const libraryStamp = (path: string = libraryPath()): number => statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? 0;

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SIZE = SPRITE_SIZE;
/** The characters a shape uses for its material's body and shade; a legend may not use them. */
const BODY = "m";
const SHADE = "M";

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const own = <T>(o: Readonly<Record<string, T>>, key: string): T | undefined => (Object.hasOwn(o, key) ? o[key] : undefined);

/** Checks a library read from JSON and returns it, or everything that is wrong with it. */
export function parseLibrary(json: unknown): { library: Library } | { problems: string[] } {
  const problems: string[] = [];
  if (!isRecord(json)) return { problems: ["the library is not an object"] };
  if (json["format"] !== 1) problems.push("the library's format is not 1");

  const legend: Library["legend"] = {};
  if (!isRecord(json["legend"])) problems.push("legend is not an object");
  else {
    for (const [ch, v] of Object.entries(json["legend"])) {
      if ([...ch].length !== 1) problems.push(`legend key ${JSON.stringify(ch)} is not one character`);
      else if (ch === BODY || ch === SHADE) problems.push(`legend key ${ch} is reserved for materials`);
      else if (v !== null && typeof v !== "string") problems.push(`legend ${ch} is not a palette name or null`);
      else legend[ch] = v;
    }
  }

  const rowsOf = (kind: "sprites" | "shapes"): Record<string, readonly string[]> => {
    const out: Record<string, readonly string[]> = {};
    const table = json[kind];
    if (!isRecord(table)) {
      problems.push(`${kind} is not an object`);
      return out;
    }
    for (const [name, rows] of Object.entries(table)) {
      if (!NAME.test(name)) problems.push(`${kind} ${JSON.stringify(name)} is not a lowercase kebab-case name`);
      if (!Array.isArray(rows) || rows.length !== SIZE || !rows.every((r) => typeof r === "string" && [...r].length === SIZE)) {
        problems.push(`${kind} ${name} is not sixteen rows of sixteen characters`);
        continue;
      }
      for (const ch of (rows as string[]).join("")) {
        const fine = Object.hasOwn(legend, ch) || (kind === "shapes" && (ch === BODY || ch === SHADE));
        if (!fine) {
          problems.push(`${kind} ${name} uses ${JSON.stringify(ch)}, which is not in the legend`);
          break;
        }
      }
      out[name] = rows as string[];
    }
    return out;
  };
  const sprites = rowsOf("sprites");
  const shapes = rowsOf("shapes");
  for (const name of Object.keys(sprites)) if (Object.hasOwn(shapes, name)) problems.push(`${name} is both a sprite and a shape`);

  const materials: Library["materials"] = {};
  if (!isRecord(json["materials"])) problems.push("materials is not an object");
  else {
    for (const [name, pair] of Object.entries(json["materials"])) {
      if (!NAME.test(name)) problems.push(`material ${JSON.stringify(name)} is not a lowercase kebab-case name`);
      else if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((p) => typeof p === "string")) problems.push(`material ${name} is not two palette names`);
      else materials[name] = [pair[0] as string, pair[1] as string];
    }
  }

  return problems.length > 0 ? { problems } : { library: { legend, sprites, shapes, materials } };
}

/** Reads the library file. A missing, unreadable or invalid file is an empty library, so a run still opens and its items fall back to glyphs. */
export function readLibrary(path: string = libraryPath()): Library {
  try {
    const parsed = parseLibrary(JSON.parse(readFileSync(path, "utf8")));
    return "library" in parsed ? parsed.library : EMPTY_LIBRARY;
  } catch {
    return EMPTY_LIBRARY;
  }
}

/** The sprite a reference names, as rows of palette names, or undefined for a name, a material or a form the library does not have. */
export function resolveReference(lib: Library, ref: string): Sprite | undefined {
  const slash = ref.indexOf("/");
  if (slash === -1) {
    const rows = own(lib.sprites, ref);
    return rows && spriteOf(rows, (ch) => own(lib.legend, ch) ?? null);
  }
  const rows = own(lib.shapes, ref.slice(0, slash));
  const material = own(lib.materials, ref.slice(slash + 1));
  if (!rows || !material) return undefined;
  return spriteOf(rows, (ch) => (ch === BODY ? material[0] : ch === SHADE ? material[1] : (own(lib.legend, ch) ?? null)));
}

const spriteOf = (rows: readonly string[], colorOf: (ch: string) => string | null): Sprite => rows.map((r) => [...r].map(colorOf));

/** Every reference the library can resolve: each sprite, and each shape in each material. */
export function allReferences(lib: Library): string[] {
  return [...Object.keys(lib.sprites), ...Object.keys(lib.shapes).flatMap((s) => Object.keys(lib.materials).map((m) => `${s}/${m}`))];
}
