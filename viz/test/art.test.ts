import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultItemArt, paintTable, PALETTES, spriteToRGBA, type ItemArt, type ItemSprite } from "../src/art/index.ts";

const itemNames = (): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  for (const dir of ["worlds", "worlds/generated", "test/fixtures/valid"]) {
    for (const f of readdirSync(join(process.cwd(), dir))) {
      if (!f.endsWith(".json") || f.includes(".goals.") || f.includes(".notes.")) continue;
      const world = JSON.parse(readFileSync(join(process.cwd(), dir, f), "utf8")) as { items?: { id: string }[] };
      if (world.items) out.set(`${dir}/${f}`, world.items.map((i) => i.id));
    }
  }
  return out;
};

const key = (s: ItemSprite) => JSON.stringify(s.pixels);

describe("the default item art", () => {
  it("gives the same sprite for the same name", () => {
    expect(defaultItemArt("glirol")).toEqual(defaultItemArt("glirol"));
  });

  it("is 8 by 8 and mirrors left to right", () => {
    const s = defaultItemArt("iron_pickaxe");
    expect(s.width).toBe(8);
    expect(s.height).toBe(8);
    expect(s.pixels).toHaveLength(64);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) expect(s.pixels[y * 8 + x]).toBe(s.pixels[y * 8 + (7 - x)]);
  });

  it("uses only colors of one of eight palettes", () => {
    expect(PALETTES).toHaveLength(8);
    for (const name of ["a", "oak_log", "diamond", "stick", "glirol", "pluzhouvio"]) {
      const s = defaultItemArt(name);
      const allowed = new Set([...PALETTES[s.palette]!.colors, 0x181414]);
      for (const c of s.pixels) if (c !== null) expect(allowed.has(c), `${name} ${c}`).toBe(true);
    }
  });

  it("draws enough of a creature to see", () => {
    for (const name of ["a", "b", "c", "x", "stick"]) expect(defaultItemArt(name).pixels.filter((p) => p !== null).length, name).toBeGreaterThanOrEqual(16);
  });

  it("tells apart the items of every committed world", () => {
    const worlds = itemNames();
    expect(worlds.size).toBeGreaterThan(5);
    for (const [file, names] of worlds) {
      const keys = names.map((n) => key(defaultItemArt(n)));
      expect(new Set(keys).size, file).toBe(names.length);
    }
  });

  it("becomes RGBA bytes with a transparent background", () => {
    const rgba = spriteToRGBA(defaultItemArt("stick"));
    expect(rgba).toHaveLength(8 * 8 * 4);
    const s = defaultItemArt("stick");
    s.pixels.forEach((p, i) => expect(rgba[i * 4 + 3]).toBe(p === null ? 0 : 255));
  });
});

describe("painting a table", () => {
  const recorder = () => {
    const calls: { x: number; y: number; w: number; h: number; color: string }[] = [];
    let fillStyle = "";
    const ctx = {
      set fillStyle(v: string) { fillStyle = v; },
      get fillStyle() { return fillStyle; },
      fillRect(x: number, y: number, w: number, h: number) { calls.push({ x, y, w, h, color: fillStyle }); },
      clearRect() {},
    };
    return { ctx, calls };
  };

  it("draws nothing for empty cells and something for each item", () => {
    const empty = recorder();
    paintTable(empty.ctx, [[null, null], [null, null]], defaultItemArt, 16);
    expect(empty.calls).toHaveLength(0);
    const one = recorder();
    paintTable(one.ctx, [["stick", null], [null, null]], defaultItemArt, 16);
    expect(one.calls.length).toBeGreaterThan(0);
    expect(one.calls.every((c) => c.x >= 0 && c.x < 16 && c.y >= 0 && c.y < 16)).toBe(true); // only the first cell
  });

  it("accepts a replacement for the art without any other change", () => {
    const seen: string[] = [];
    const flat: ItemArt = (name) => {
      seen.push(name);
      return { width: 8, height: 8, palette: 0, pixels: Array<number | null>(64).fill(0xff0000) };
    };
    const { ctx, calls } = recorder();
    paintTable(ctx, [["a", "b"]], flat, 8);
    expect(seen).toEqual(["a", "b"]);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.color === "#ff0000")).toBe(true);
  });
});
