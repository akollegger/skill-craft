import { copyFileSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadWorld } from "../../src/sim/loader.js";
import { artFilePath } from "../../src/viz/art/art-file.js";
import { worldArtFor } from "../../src/viz/art/world-art.js";
import type { WorldArt } from "../../src/viz/contract.js";
import { FAMILIES, PALETTE_COUNT } from "../../src/viz/glyphs.js";

/** Every committed world file: the base worlds and the generated ones, never their goals, notes or art files. */
const worldFiles = (): string[] =>
  ["worlds", "worlds/generated"].flatMap((dir) =>
    readdirSync(join(process.cwd(), dir))
      .filter((f) => f.endsWith(".json") && !/\.(goals|notes|art)\.json$/.test(f))
      .map((f) => join(process.cwd(), dir, f)),
  );

type Entry = WorldArt["items"][string];
const isGlyph = (e: Entry): e is Extract<Entry, { family: number }> => "family" in e;

/** What a reader sees of an entry: a drawn entry's colors, or a glyph's shape, palette and marked pixels. */
const picture = (art: WorldArt, e: Entry): string => {
  if (!isGlyph(e)) return JSON.stringify(e.rows.map((r) => [...r].map((c) => art.legend[c])));
  const rows = FAMILIES[e.family]!.variants[e.variant]!;
  const marked = new Set(e.marks);
  return `${e.palette}|${rows.map((r, y) => [...r].map((c, x) => (c === "b" && marked.has(y * 8 + x) ? "a" : c)).join("")).join("/")}`;
};

describe("the art of every committed world", () => {
  const files = worldFiles();

  it("covers a good number of worlds", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("gives every item a sprite", () => {
    for (const file of files) {
      const world = loadWorld(file);
      const ids = world.items.map((i) => i.id);
      const art = worldArtFor(world, file, ids);
      expect(Object.keys(art.items).sort(), file).toEqual([...ids].sort());
    }
  });

  it("keeps the items of a world of 64 or fewer apart: no shared family and palette, no shared picture", () => {
    for (const file of files) {
      const world = loadWorld(file);
      expect(world.items.length, file).toBeLessThanOrEqual(FAMILIES.length * PALETTE_COUNT);
      const art = worldArtFor(world, file, world.items.map((i) => i.id));
      const entries = Object.values(art.items);
      const pairs = entries.filter(isGlyph).map((e) => `${e.family}.${e.palette}`);
      expect(new Set(pairs).size, `${file} pairs`).toBe(pairs.length);
      const pictures = entries.map((e) => picture(art, e));
      expect(new Set(pictures).size, `${file} pictures`).toBe(pictures.length);
    }
  });

  it("is the same every time", () => {
    for (const file of files) {
      const world = loadWorld(file);
      const ids = world.items.map((i) => i.id);
      expect(JSON.stringify(worldArtFor(world, file, ids)), file).toBe(JSON.stringify(worldArtFor(world, file, ids)));
    }
  });

  it("keeps the drawn items of a partial art file and allocates the rest apart", () => {
    const src = join(process.cwd(), "worlds", "forge.json");
    const dir = mkdtempSync(join(tmpdir(), "skill-craft-art-world-"));
    const copy = join(dir, "forge.json");
    copyFileSync(src, copy);
    const world = loadWorld(copy);
    const ids = world.items.map((i) => i.id);
    const [first, second] = ids as [string, string];
    writeFileSync(artFilePath(copy), JSON.stringify({ format: 1, legend: { f: "woodFace" }, items: { [first]: Array(16).fill("f".repeat(16)), [second]: Array(16).fill("f".repeat(16)) } }));
    const art = worldArtFor(world, copy, ids);
    expect(isGlyph(art.items[first]!)).toBe(false);
    expect(isGlyph(art.items[second]!)).toBe(false);
    const rest = ids.slice(2).map((id) => art.items[id]!).filter(isGlyph);
    expect(rest).toHaveLength(ids.length - 2);
    expect(new Set(rest.map((e) => `${e.family}.${e.palette}`)).size).toBe(rest.length);
  });

  it("pins the assignment of every committed world, so a change is deliberate", () => {
    const pinned: Record<string, string[]> = {};
    for (const file of files) {
      const world = loadWorld(file);
      const art = worldArtFor(world, file, world.items.map((i) => i.id));
      pinned[file.slice(process.cwd().length + 1)] = Object.entries(art.items).map(([n, e]) => (isGlyph(e) ? `${n}:g${e.family}.${e.variant}.${e.palette}.${e.marks.join("+")}` : `${n}:drawn`));
    }
    expect(pinned).toMatchSnapshot();
  });
});
