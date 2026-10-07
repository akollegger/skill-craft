import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAMILIES, glyphOf, hashName, MARKS, ownPair, PALETTE_COUNT } from "../../src/viz/glyphs.js";

describe("the shared glyph tables", () => {
  it("has no Node import, so the page can share it", () => {
    const source = readFileSync(new URL("../../src/viz/glyphs.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["']node:/);
    expect(source).not.toMatch(/require\(/);
  });

  it("counts eight palettes and at least eight families of three variants", () => {
    expect(PALETTE_COUNT).toBe(8);
    expect(FAMILIES.length).toBeGreaterThanOrEqual(8);
    for (const f of FAMILIES) expect(f.variants).toHaveLength(3);
  });

  it("hashes a name the same way every time", () => {
    expect(hashName("oak_log")).toBe(hashName("oak_log"));
    expect(hashName("a")).not.toBe(hashName("b"));
  });

  it("gives a name one glyph, in range, with two distinct marks on body pixels of its variant", () => {
    for (const name of ["a", "oak_log", "glirol", "π", "iron_pickaxe"]) {
      const g = glyphOf(name);
      expect(glyphOf(name)).toEqual(g);
      expect(g.family).toBeGreaterThanOrEqual(0);
      expect(g.family).toBeLessThan(FAMILIES.length);
      expect(g.palette).toBeLessThan(PALETTE_COUNT);
      expect(g.variant).toBeLessThan(FAMILIES[g.family]!.variants.length);
      expect(g.marks).toHaveLength(MARKS);
      expect(new Set(g.marks).size).toBe(MARKS);
      const rows = FAMILIES[g.family]!.variants[g.variant]!;
      for (const m of g.marks) expect(rows[Math.floor(m / 4)]![m % 4], `${name} mark ${m}`).toBe("b");
    }
  });

  it("reports the pair a name hashes to as family * 8 + palette", () => {
    for (const name of ["a", "oak_log", "glirol"]) {
      const g = glyphOf(name);
      expect(ownPair(name)).toBe(g.family * PALETTE_COUNT + g.palette);
    }
  });

  it("keeps the name's own variant and marks when a given pair replaces its family and palette", () => {
    const name = "oak_log";
    const own = glyphOf(name);
    const moved = glyphOf(name, (own.family + 1) % FAMILIES.length * PALETTE_COUNT + ((own.palette + 1) % PALETTE_COUNT));
    expect(moved.family).toBe((own.family + 1) % FAMILIES.length);
    expect(moved.palette).toBe((own.palette + 1) % PALETTE_COUNT);
    expect(moved.variant).toBeLessThan(FAMILIES[moved.family]!.variants.length);
    // A pair equal to the name's own changes nothing.
    expect(glyphOf(name, ownPair(name))).toEqual(own);
    // Marks sit on body pixels of the moved glyph's own variant.
    const rows = FAMILIES[moved.family]!.variants[moved.variant]!;
    for (const m of moved.marks) expect(rows[Math.floor(m / 4)]![m % 4]).toBe("b");
  });
});
