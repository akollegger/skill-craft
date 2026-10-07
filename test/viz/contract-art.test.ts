import { describe, expect, it } from "vitest";
import { catalogSchema, manifestSchema, parseCatalog, worldArtSchema } from "../../src/viz/contract.js";

const rows = ["........", "..aabb..", ".aabbbb.", ".abbbbb.", ".abbbbb.", ".aabbbb.", "..aabb..", "........"];
const art = {
  legend: { ".": null, a: "woodFace", b: "woodShade" },
  items: {
    stick: { rows },
    zorp: { family: 2, variant: 1, palette: 5, marks: [3, 17] },
  },
};
const manifest = {
  format: 1,
  label: "a / 001",
  world: { name: "w", rows: 3, cols: 3 },
  goal: { item: "stick", qty: 1 },
  best: null,
  frames: 2,
  trace: "absent",
  model: { requested: null, resolved: [] },
};

describe("the world art shape", () => {
  it("accepts drawn and generated entries", () => {
    expect(worldArtSchema.safeParse(art).success).toBe(true);
  });

  it("accepts a legend value the page may not know, and null for transparent", () => {
    expect(worldArtSchema.safeParse({ legend: { ".": null, a: "noSuchColor" }, items: { x: { rows: Array(8).fill("a.a.a.a.") } } }).success).toBe(true);
  });

  it("rejects rows that are not eight strings of eight characters", () => {
    expect(worldArtSchema.safeParse({ ...art, items: { stick: { rows: rows.slice(1) } } }).success).toBe(false);
    expect(worldArtSchema.safeParse({ ...art, items: { stick: { rows: rows.map((r) => r.slice(1)) } } }).success).toBe(false);
  });

  it("rejects a row character that is not a key of the legend", () => {
    expect(worldArtSchema.safeParse({ ...art, items: { stick: { rows: rows.map((r) => r.replace("a", "z")) } } }).success).toBe(false);
  });

  it("rejects a glyph with family, variant or palette out of range, or marks that are not two distinct integers 0 to 31", () => {
    const glyph = { family: 2, variant: 1, palette: 5, marks: [3, 17] };
    const bad = [{ family: 99 }, { family: -1 }, { variant: 3 }, { palette: 8 }, { marks: [3] }, { marks: [3, 3] }, { marks: [3, 32] }, { marks: [1.5, 2] }];
    for (const change of bad) expect(worldArtSchema.safeParse({ legend: {}, items: { x: { ...glyph, ...change } } }).success, JSON.stringify(change)).toBe(false);
  });

  it("ignores fields it does not know", () => {
    const r = worldArtSchema.safeParse({ ...art, later: 1, items: { stick: { rows, later: 2 } } });
    expect(r.success).toBe(true);
  });
});

describe("art on the manifest and the catalog", () => {
  it("is optional on both, and a manifest or catalog without it still parses", () => {
    expect(manifestSchema.safeParse(manifest).success).toBe(true);
    expect(parseCatalog({ format: 1, runs: [] }).ok).toBe(true);
  });

  it("is carried when present", () => {
    const m = manifestSchema.parse({ ...manifest, art });
    expect(m.art).toEqual(art);
    const c = catalogSchema.parse({ format: 1, runs: [], art: { w: art } });
    expect(c.art).toEqual({ w: art });
  });

  it("makes a malformed art object a malformed manifest", () => {
    expect(manifestSchema.safeParse({ ...manifest, art: { legend: {}, items: { x: { rows: ["a"] } } } }).success).toBe(false);
  });
});
