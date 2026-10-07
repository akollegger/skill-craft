import { describe, expect, it } from "vitest";
import { worldArtSchema } from "../../src/viz/contract.js";
import { glyphOf } from "../../src/viz/glyphs.js";
import { fromWire, isSprite, mergeArt, toWire, type ArtEntry, type Sprite } from "../../src/viz/art/world-art.js";

/** An 8 by 8 sprite from rows of letters: `.` is transparent, `f` woodFace, `s` woodShade, `b` baltic. */
const NAMES: Record<string, string | null> = { ".": null, f: "woodFace", s: "woodShade", b: "baltic" };
const sprite = (...rows: string[]): Sprite => rows.map((r) => [...r].map((c) => NAMES[c] ?? null));
const full = (ch: string): Sprite => sprite(...Array<string>(8).fill(ch.repeat(8)));
const stick = sprite("......fs", ".....fs.", "....fs..", "...fs...", "..fs....", ".fs.....", "fs......", "s.......");

/** The names a wire entry draws, row by row: what a reader sees whatever characters were chosen. */
const namesOf = (art: ReturnType<typeof toWire>, item: string): (string | null)[][] => {
  const e = art.items[item]!;
  if (!("rows" in e)) throw new Error("not drawn");
  return e.rows.map((r) => [...r].map((c) => art.legend[c]!));
};

describe("the sprite form", () => {
  it("is exactly eight rows of eight cells", () => {
    expect(isSprite(stick)).toBe(true);
    expect(isSprite(stick.slice(1))).toBe(false);
    expect(isSprite(stick.map((r) => r.slice(1)))).toBe(false);
    expect(isSprite("no")).toBe(false);
    expect(isSprite(stick.map((r) => r.map((c) => (c === null ? 1 : c))))).toBe(false);
  });
});

describe("the wire form", () => {
  it("gives each palette name present a character in sorted order, with `.` for transparent only when a pixel is transparent", () => {
    const art = toWire({ stick: { sprite: stick }, wall: { sprite: full("b") } });
    expect(art.legend).toEqual({ ".": null, a: "baltic", b: "woodFace", c: "woodShade" });
    expect(toWire({ wall: { sprite: full("b") } }).legend).toEqual({ a: "baltic" });
    expect(worldArtSchema.safeParse(art).success).toBe(true);
  });

  it("draws the same names for a sprite whatever else is in the world art", () => {
    const alone = toWire({ stick: { sprite: stick } });
    const beside = toWire({ stick: { sprite: stick }, wall: { sprite: full("b") } });
    expect(namesOf(alone, "stick")).toEqual(stick);
    expect(namesOf(beside, "stick")).toEqual(stick);
  });

  it("is the same bytes for the same entries in any order", () => {
    const a = toWire({ x: { sprite: stick }, y: { glyph: glyphOf("y") } });
    const b = toWire({ y: { glyph: glyphOf("y") }, x: { sprite: stick } });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("carries a glyph as its four numbers", () => {
    const g = glyphOf("zorp");
    expect(toWire({ zorp: { glyph: g } }).items["zorp"]).toEqual({ family: g.family, variant: g.variant, palette: g.palette, marks: [...g.marks] });
  });

  it("reads back what it wrote", () => {
    const entries: Record<string, ArtEntry> = { stick: { sprite: stick }, zorp: { glyph: glyphOf("zorp") } };
    expect(fromWire(toWire(entries))).toEqual(entries);
  });

  it("rejects a sprite that is not 8 by 8", () => {
    expect(() => toWire({ bad: { sprite: stick.slice(1) } })).toThrow();
  });
});

describe("merging the art of several runs", () => {
  const wood = toWire({ stick: { sprite: stick } });
  const blue = toWire({ stick: { sprite: full("b") }, wall: { sprite: full("b") } });

  it("holds the union of the items, and the earlier run's entry where two disagree", () => {
    const merged = mergeArt([wood, blue])!;
    expect(Object.keys(merged.items).sort()).toEqual(["stick", "wall"]);
    expect(namesOf(merged, "stick")).toEqual(stick);
    expect(namesOf(merged, "wall")).toEqual(full("b"));
  });

  it("rebuilds the legend from the names present, so it equals building from the union", () => {
    expect(mergeArt([wood, blue])).toEqual(toWire({ stick: { sprite: stick }, wall: { sprite: full("b") } }));
  });

  it("is the art itself for one run, and nothing for none", () => {
    expect(mergeArt([wood])).toEqual(wood);
    expect(mergeArt([])).toBeUndefined();
  });
});
