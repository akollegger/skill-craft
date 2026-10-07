import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorldArt } from "../../src/viz/contract.ts";
import { WORLD_ART, type WorldArtLookup } from "../src/art/context.ts";
import { artFromWorld, defaultItemArt } from "../src/art/index.ts";
import { palette } from "../src/palette.ts";
import Thumbnail from "../src/shell/Thumbnail.svelte";

const solid: WorldArt = { legend: { a: "woodFace" }, items: { d: { rows: Array(8).fill("aaaaaaaa") } } };
const face = palette.woodFace.toLowerCase();

let fills: string[] = [];
beforeEach(() => {
  fills = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => {
    let style = "";
    return {
      set fillStyle(v: string) { style = v; },
      get fillStyle() { return style; },
      fillRect() { fills.push(style.toLowerCase()); },
      clearRect() {},
    };
  }) as never);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const draw = (props: { goal?: string; world?: string }, lookup?: WorldArtLookup) =>
  render(Thumbnail, { props: { reached: true, ...props }, ...(lookup ? { context: new Map([[WORLD_ART, lookup]]) } : {}) });

describe("a goal thumbnail's art", () => {
  it("draws the goal with its world's art from the catalog when there is any", () => {
    draw({ goal: "d", world: "w" }, (world) => (world === "w" ? solid : undefined));
    expect(fills.filter((c) => c === face).length).toBe(64);
  });

  it("falls back to the name-only sprite when the catalog has no art for the world, or the page has none at all", () => {
    draw({ goal: "d", world: "other" }, () => undefined);
    const withLookup = fills.slice();
    fills = [];
    cleanup();
    draw({ goal: "d", world: "w" });
    expect(fills).toEqual(withLookup);
    expect(fills.filter((c) => c === face).length).not.toBe(64);
  });

  it("draws the same sprite the table's art gives for the same item", () => {
    const table = artFromWorld(solid)("d");
    expect(table.pixels.every((p) => p !== null)).toBe(true);
    expect(artFromWorld(undefined)("d")).toEqual(defaultItemArt("d"));
    draw({ goal: "d", world: "w" }, () => solid);
    expect(fills.filter((c) => c === face).length).toBe(table.pixels.length);
  });
});
