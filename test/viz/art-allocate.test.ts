import { describe, expect, it } from "vitest";
import { FAMILIES, glyphOf, ownPair, PALETTE_COUNT } from "../../src/viz/glyphs.js";
import { allocate } from "../../src/viz/art/allocate.js";

const PAIRS = FAMILIES.length * PALETTE_COUNT;
const pairOf = (g: { family: number; palette: number }) => g.family * PALETTE_COUNT + g.palette;
const names = (n: number, prefix = "item") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe("allocating glyphs across a world", () => {
  it("gives an item whose own pair is free exactly the glyph its name gives", () => {
    const got = allocate(["only"]);
    expect(got.get("only")).toEqual(glyphOf("only"));
  });

  it("moves an item off a taken pair by nine, modulo 64, and again until one is free", () => {
    // Find two names that hash to the same pair, so the second must move.
    const seen = new Map<number, string>();
    let pair: [string, string] | undefined;
    for (let i = 0; !pair; i++) {
      const n = `n${i}`;
      const p = ownPair(n);
      const earlier = seen.get(p);
      if (earlier) pair = [earlier, n].sort() as [string, string];
      else seen.set(p, n);
    }
    const [first, second] = pair;
    const got = allocate([second, first]);
    expect(pairOf(got.get(first)!)).toBe(ownPair(first)); // the earlier in name order keeps its pair
    expect(pairOf(got.get(second)!)).toBe((ownPair(second) + 9) % PAIRS);
    expect(got.get(second)).toEqual(glyphOf(second, (ownPair(second) + 9) % PAIRS)); // and keeps its own variant and marks
  });

  it("walks all 64 pairs, since nine and 64 share no factor", () => {
    const seen = new Set<number>();
    let p = 0;
    for (let i = 0; i < PAIRS; i++) {
      seen.add(p);
      p = (p + 9) % PAIRS;
    }
    expect(seen.size).toBe(PAIRS);
  });

  it("gives twelve items twelve distinct family-and-palette pairs, however the names hash", () => {
    for (const prefix of ["item", "glir", "oak_", "zz", "a"]) {
      const got = allocate(names(12, prefix));
      expect(new Set([...got.values()].map(pairOf)).size, prefix).toBe(12);
    }
  });

  it("gives a world of 64 items every pair once", () => {
    const got = allocate(names(64));
    expect(new Set([...got.values()].map(pairOf)).size).toBe(PAIRS);
  });

  it("repeats pairs past 64 items without failing, and each glyph stays in range", () => {
    const got = allocate(names(70));
    expect(got.size).toBe(70);
    for (const g of got.values()) {
      expect(g.family).toBeLessThan(FAMILIES.length);
      expect(g.palette).toBeLessThan(PALETTE_COUNT);
      expect(g.variant).toBeLessThan(FAMILIES[g.family]!.variants.length);
    }
  });

  it("is the same for any order of the item list", () => {
    const list = names(20, "thing");
    const forward = allocate(list);
    const backward = allocate([...list].reverse());
    const shuffled = allocate([...list].sort((a, b) => (a.length === b.length ? (a < b ? 1 : -1) : a.length - b.length)));
    for (const n of list) {
      expect(backward.get(n), n).toEqual(forward.get(n));
      expect(shuffled.get(n), n).toEqual(forward.get(n));
    }
  });

  it("ignores a name given twice", () => {
    expect(allocate(["x", "x", "y"]).size).toBe(2);
  });

  it("gives no glyphs for no items", () => {
    expect(allocate([]).size).toBe(0);
  });

  it("pins the assignment for a fixed list, so a change is deliberate", () => {
    const got = allocate(["a", "b", "c", "d", "e", "f", "glirol", "pluzhouvio", "oak_log", "stick"]);
    const rows = [...got.entries()].map(([n, g]) => `${n}:${g.family}.${g.variant}.${g.palette}.${g.marks.join("+")}`);
    expect(rows).toMatchInlineSnapshot(`
      [
        "a:4.1.2.81+116",
        "b:2.0.2.69+31",
        "c:1.0.2.124+81",
        "d:6.1.0.112+106",
        "e:3.0.3.115+107",
        "f:4.1.0.43+114",
        "glirol:3.0.1.123+117",
        "oak_log:3.2.2.114+109",
        "pluzhouvio:4.1.3.96+9",
        "stick:4.1.7.31+113",
      ]
    `);
  });
});
