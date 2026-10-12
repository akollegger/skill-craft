import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadWorld } from "../../src/sim/loader.js";
import { readLibrary } from "../../src/viz/art/library.js";
import { worldArtFor } from "../../src/viz/art/world-art.js";

const WORLD = join(process.cwd(), "worlds", "minecraft-inspired.json");
const world = loadWorld(WORLD);
const ids = world.items.map((i) => i.id);

describe("the faithful world's art", () => {
  const art = worldArtFor(world, WORLD, ids)!;

  it("draws all 13 items, none as a generated glyph", () => {
    expect(ids).toHaveLength(13);
    expect(Object.keys(art.items).sort()).toEqual([...ids].sort());
    for (const id of ids) expect("rows" in art.items[id]!, id).toBe(true);
  });

  it("gives no two items the same picture", () => {
    const rows = ids.map((id) => JSON.stringify((art.items[id] as { rows: string[] }).rows.map((r) => [...r].map((c) => art.legend[c]))));
    expect(new Set(rows).size).toBe(ids.length);
  });

  const cells = (id: string) => (art.items[id] as { rows: string[] }).rows.map((r) => [...r].map((c) => art.legend[c]));
  const mask = (id: string) => cells(id).map((r) => r.map((c) => (c === null ? "." : "#")).join(""));

  it("draws the three pickaxes, and the three swords, with one shape in three colors", () => {
    for (const kind of ["pickaxe", "sword"]) {
      const three = ["wooden", "stone", "iron"].map((m) => `${m}_${kind}`);
      expect(new Set(three.map((id) => mask(id).join("/"))).size, kind).toBe(1);
      expect(new Set(three.map((id) => JSON.stringify(cells(id)))).size, kind).toBe(3);
    }
  });

  it("reaches only what is asked for: the items a run shows", () => {
    const some = worldArtFor(world, WORLD, ["oak_log", "stick"])!;
    expect(Object.keys(some.items).sort()).toEqual(["oak_log", "stick"]);
  });

  it("is the same every time", () => {
    expect(JSON.stringify(worldArtFor(world, WORLD, ids))).toBe(JSON.stringify(art));
  });

  it("reads its art file, which names library sprites and holds no drawings of its own", () => {
    const file = JSON.parse(readFileSync(join(process.cwd(), "worlds", "minecraft-inspired.art.json"), "utf8")) as { items: Record<string, unknown> };
    expect(Object.keys(file.items).sort()).toEqual([...ids].sort());
    for (const v of Object.values(file.items)) expect(typeof v).toBe("string");
    const lib = readLibrary();
    expect(Object.keys(lib.sprites).length + Object.keys(lib.shapes).length).toBeGreaterThanOrEqual(9);
  });
});
