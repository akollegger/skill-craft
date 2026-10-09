import { describe, expect, it } from "vitest";
import type { WorldArt } from "../../src/viz/contract.ts";
import { glyphOf, ownPair } from "../../src/viz/glyphs.ts";
import { artFromWorld, defaultItemArt, spriteOfGlyph } from "../src/art/index.ts";
import { hex } from "../src/palette.ts";

const eight = ["........", "..aaaa..", ".abbbba.", ".abbbba.", ".abbbba.", ".abbbba.", "..aaaa..", "........"];
/** Each pixel doubled both ways: sixteen rows of sixteen. */
const rows = eight.flatMap((r) => { const d = [...r].map((c) => c + c).join(""); return [d, d]; });
const art: WorldArt = {
  legend: { ".": null, a: "woodFace", b: "noSuchColor" },
  items: {
    stick: { rows },
    // An item whose own pair is free: the glyph is the one its name gives.
    own: { ...glyphOf("own"), marks: [...glyphOf("own").marks] },
    // An item moved to another pair.
    moved: { ...glyphOf("moved", (ownPair("moved") + 9) % 64), marks: [...glyphOf("moved", (ownPair("moved") + 9) % 64).marks] },
  },
};

describe("expanding a world's art", () => {
  const draw = artFromWorld(art);

  it("draws a drawn entry through the palette, sixteen by sixteen", () => {
    const s = draw("stick");
    expect(s.width).toBe(16);
    expect(s.height).toBe(16);
    expect(s.pixels).toHaveLength(256);
    expect(s.pixels[0]).toBeNull();
    expect(s.pixels[2 * 16 + 4]).toBe(hex("woodFace"));
  });

  it("draws a name the page does not know as transparent", () => {
    const s = draw("stick");
    expect(s.pixels[4 * 16 + 6]).toBeNull(); // `b` stands for a color the page lacks
  });

  it("draws a glyph entry whose pair is the name's own exactly as the name-only art does", () => {
    expect(draw("own").pixels).toEqual(defaultItemArt("own").pixels);
  });

  it("draws a glyph entry that was moved with the allocated family and palette", () => {
    const moved = art.items["moved"] as { family: number; variant: number; palette: number; marks: number[] };
    expect(draw("moved").pixels).toEqual(spriteOfGlyph(moved).pixels);
    expect(draw("moved").palette).toBe(moved.palette);
  });

  it("moves an item off its own pair without changing which glyph shape its variant draws", () => {
    const moved = art.items["moved"] as { family: number; variant: number; palette: number; marks: number[] };
    const own = glyphOf("moved");
    expect(moved.family * 8 + moved.palette).toBe((ownPair("moved") + 9) % 64);
    expect(moved.variant).toBe(Math.min(own.variant, 2)); // the name's own variant draw is kept
    expect(draw("moved").pixels).not.toEqual(defaultItemArt("moved").pixels); // it looks different from where the name alone put it
  });

  it("falls back to the name-only art for an item the art does not have", () => {
    expect(draw("never-seen").pixels).toEqual(defaultItemArt("never-seen").pixels);
  });

  it("falls back to the name-only art for every item when there is no art", () => {
    const none = artFromWorld(undefined);
    for (const name of ["a", "oak_log", "glirol"]) expect(none(name)).toEqual(defaultItemArt(name));
  });

  it("gives a thumbnail and a table the same sprite when both read the same art", () => {
    const fromCatalog = artFromWorld({ ...art });
    const fromBundle = artFromWorld(art);
    for (const name of Object.keys(art.items)) expect(fromCatalog(name)).toEqual(fromBundle(name));
  });
});
