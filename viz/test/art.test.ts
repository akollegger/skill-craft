import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultItemArt, FAMILIES, glyphOf, paintGoalSlot, paintTable, PALETTES, slotSize, spriteToRGBA, type ItemArt, type ItemSprite } from "../src/art/index.ts";
import { palette } from "../src/palette.ts";
import { PALETTE_COUNT } from "../../src/viz/glyphs.ts";

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
    expect(PALETTES).toHaveLength(PALETTE_COUNT); // the backend allocates across the shared count
    for (const name of ["a", "oak_log", "diamond", "stick", "glirol", "pluzhouvio"]) {
      const s = defaultItemArt(name);
      const allowed = new Set([...PALETTES[s.palette]!.colors, 0x181414]);
      for (const c of s.pixels) if (c !== null) expect(allowed.has(c), `${name} ${c}`).toBe(true);
    }
  });

  it("draws geometric glyphs, not creatures: a fixed set of families, each a few variants, in the brand palettes", () => {
    expect(FAMILIES.length).toBeGreaterThanOrEqual(8);
    for (const f of FAMILIES) {
      expect(f.variants.length, f.name).toBeGreaterThanOrEqual(3);
      for (const rows of f.variants) {
        // The left half only, four columns by eight rows; the right half is its mirror image.
        expect(rows, f.name).toHaveLength(8);
        for (const row of rows) expect(row, f.name).toMatch(/^[bad.]{4}$/);
      }
    }
    // Every family and every palette turns up across a spread of names, so a world's items differ in shape and in color.
    const seen = Array.from({ length: 300 }, (_, i) => glyphOf(`item${i}`));
    expect(new Set(seen.map((g) => g.family)).size).toBe(FAMILIES.length);
    expect(new Set(seen.map((g) => g.palette)).size).toBe(PALETTES.length);
  });

  it("has no eyes: no sprite carries the creature's dark pair of pixels in its fourth row", () => {
    // The old creatures always had a dark pixel at column 2 of row 3 and its mirror; a glyph may have dark pixels only where its family draws them.
    for (const name of ["glirol", "stick", "oak_log"]) {
      const g = glyphOf(name);
      const dark = FAMILIES[g.family]!.variants[g.variant]!.some((row) => row.includes("d"));
      const s = defaultItemArt(name);
      const hasDark = s.pixels.some((p) => p === 0x181414);
      expect(hasDark, name).toBe(dark);
    }
  });

  it("draws enough of a shape to see", () => {
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

describe("painting the goal slot", () => {
  const recorder = () => {
    const calls: { x: number; y: number; w: number; h: number; color: string }[] = [];
    let fillStyle = "";
    const ctx = {
      set fillStyle(v: string) { fillStyle = v; },
      get fillStyle() { return fillStyle; },
      fillRect(x: number, y: number, w: number, h: number) { calls.push({ x, y, w, h, color: fillStyle.toLowerCase() }); },
    };
    return { ctx, calls };
  };
  /** One red pixel at the sprite's top left, and one blue at its bottom right. */
  const two: ItemSprite = { width: 8, height: 8, palette: 0, pixels: Array.from({ length: 64 }, (_, i) => (i === 0 ? 0xff0000 : i === 63 ? 0x0000ff : null)) };
  const wood = (name: keyof typeof palette) => palette[name].toLowerCase();

  it("is twelve units square, so any whole scale stays crisp: the sprite, a unit of padding and a one-unit stroke", () => {
    expect(slotSize(1)).toBe(12);
    expect(slotSize(4)).toBe(48);
  });

  it("is a one-unit stroke round a dark socket, from the derived wood ramp, even with no sprite: two rectangles and nothing else", () => {
    const { ctx, calls } = recorder();
    paintGoalSlot(ctx, undefined, { scale: 2, reached: true });
    expect(calls).toEqual([
      { x: 0, y: 0, w: 24, h: 24, color: wood("woodShade") }, // the stroke
      { x: 2, y: 2, w: 20, h: 20, color: wood("woodDeep") }, // the socket, one unit in on every side
    ]);
  });

  it("makes the stroke exactly one art pixel wide, the same as a pixel of the sprite, at every whole scale", () => {
    for (const scale of [1, 2, 3, 4, 5]) {
      const { ctx, calls } = recorder();
      paintGoalSlot(ctx, two, { scale, reached: true });
      const stroke = calls[0]!;
      const socket = calls[1]!;
      const sprite = calls.find((c) => c.color === "#ff0000")!;
      expect(socket.x - stroke.x, `scale ${scale}`).toBe(sprite.w); // the stroke's width is a sprite pixel's width
      expect(stroke.w - (socket.x - stroke.x) * 2).toBe(socket.w); // and the same on the far side
    }
  });

  it("puts the goal's sprite in the socket, with a unit of padding, in its own colors, when the goal was reached", () => {
    const { ctx, calls } = recorder();
    paintGoalSlot(ctx, two, { scale: 4, reached: true });
    const red = calls.find((c) => c.color === "#ff0000")!;
    const blue = calls.find((c) => c.color === "#0000ff")!;
    expect(red).toMatchObject({ x: 8, y: 8, w: 4, h: 4 }); // unit 2 of 12: past the stroke and a unit of padding, scaled by 4
    expect(blue).toMatchObject({ x: 8 + 7 * 4, y: 8 + 7 * 4, w: 4, h: 4 });
  });

  it("shows the same sprite greyed out when the goal was not reached, so runs still group by goal", () => {
    const reached = recorder();
    const missed = recorder();
    paintGoalSlot(reached.ctx, two, { scale: 4, reached: true });
    paintGoalSlot(missed.ctx, two, { scale: 4, reached: false });
    const spriteDraws = (calls: ReturnType<typeof recorder>["calls"]) => calls.filter((c) => c.x >= 8 && c.x < 40 && c.y >= 8 && c.y < 40 && c.w === 4 && c.h === 4 && !Object.values(palette).map((v) => v.toLowerCase()).includes(c.color));
    const a = spriteDraws(reached.calls);
    const b = spriteDraws(missed.calls);
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2); // the same two pixels, in the same places
    expect(b.map((c) => [c.x, c.y])).toEqual(a.map((c) => [c.x, c.y]));
    expect(b.map((c) => c.color)).not.toEqual(a.map((c) => c.color)); // but not lit
    // Greyed out: the channels are nearly equal (a pure red or blue has lost its hue), and the shape's pixels are all still there.
    const rgb = (c: string) => [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));
    for (const c of b) {
      const [r, g, bl] = rgb(c.color) as [number, number, number];
      expect(Math.max(r, g, bl) - Math.min(r, g, bl), c.color).toBeLessThanOrEqual(16);
    }
  });

  it("draws the same slot for the same goal, whatever the run", () => {
    const one = recorder();
    const two2 = recorder();
    paintGoalSlot(one.ctx, defaultItemArt("iron_pickaxe"), { scale: 2, reached: false });
    paintGoalSlot(two2.ctx, defaultItemArt("iron_pickaxe"), { scale: 2, reached: false });
    expect(one.calls).toEqual(two2.calls);
  });
});

