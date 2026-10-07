import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BACKGROUNDS, contrastRatio, edgeShare, luminance, MIN_SHARE, showing, visibleShare } from "../../src/viz/art/contrast.js";
import { allReferences, readLibrary, resolveReference } from "../../src/viz/art/library.js";
import type { Sprite } from "../../src/viz/art/world-art.js";

const colors = ((): Record<string, string> => {
  const source = readFileSync(new URL("../../viz/src/palette.ts", import.meta.url), "utf8");
  const block = source.slice(source.indexOf("export const palette = {"), source.indexOf("} as const;"));
  return Object.fromEntries([...block.matchAll(/^\s+(\w+): "(#[0-9A-Fa-f]{6})"/gm)].map((m) => [m[1]!, m[2]!]));
})();

const solid = (name: string | null): Sprite => Array.from({ length: 16 }, () => Array<string | null>(16).fill(name));
/** A sprite of one color in a block with a transparent surround, so it has edges. */
const block = (name: string): Sprite => Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => (x >= 4 && x < 12 && y >= 4 && y < 12 ? name : null)));

describe("contrast", () => {
  it("is the WCAG ratio: 21 for black on white, 1 for a color with itself", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#336699", "#336699")).toBe(1);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
    expect(luminance("#000000")).toBe(0);
  });

  it("counts the share of a sprite's opaque pixels that show", () => {
    expect(visibleShare(solid("lightGray"), colors, colors["woodDeep"]!, 2)).toBe(1);
    expect(visibleShare(solid("lightGray"), colors, colors["woodLight"]!, 2)).toBe(0);
    expect(visibleShare(solid(null), colors, colors["woodDeep"]!, 2)).toBe(0);
  });

  it("counts only the edge pixels for the edge share, and none for a sprite with no edge", () => {
    expect(edgeShare(block("lightGray"), colors, colors["woodDeep"]!, 2)).toBe(1);
    expect(edgeShare(block("lightGray"), colors, colors["woodLight"]!, 2)).toBe(0);
    expect(edgeShare(solid("lightGray"), colors, colors["woodDeep"]!, 2)).toBe(0); // a full tile has no transparent pixel beside it
  });

  it("fails a pale sprite on the light cell and a dark one on the dark slot, and passes a mid-tone one on both", () => {
    const on = (s: Sprite, bg: keyof typeof BACKGROUNDS) => showing(s, colors, colors[BACKGROUNDS[bg]]!) >= MIN_SHARE;
    expect(on(block("cream"), "cell")).toBe(false);
    expect(on(block("cream"), "slot")).toBe(true);
    expect(on(block("slateDeep"), "slot")).toBe(false);
    expect(on(block("slateDeep"), "cell")).toBe(true);
    expect(on(block("baltic"), "slot") && on(block("baltic"), "cell")).toBe(true);
  });
});

describe("the library against the table's backgrounds", () => {
  const lib = readLibrary();
  const refs = allReferences(lib);

  it("has no black pixel: nothing is outlined", () => {
    for (const ref of refs) {
      const s = resolveReference(lib, ref)!;
      expect(s.flat().includes("black"), ref).toBe(false);
    }
  });

  it("shows every sprite on the dark slot and on the lightened grid cell", () => {
    expect(colors["woodLight"]).toBeDefined();
    for (const ref of refs) {
      const s = resolveReference(lib, ref)!;
      for (const [where, bg] of Object.entries(BACKGROUNDS)) {
        expect(showing(s, colors, colors[bg]!), `${ref} on the ${where}`).toBeGreaterThanOrEqual(MIN_SHARE);
      }
    }
  });
});
