import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/engine.js";
import { connect } from "./helpers/client.js";
import { makeWorld } from "./helpers/worlds.js";

const partialWorld = () => makeWorld({ hints: "partial" });

/** The `partial` flag after placing items, or undefined if the preview has none. */
function after(world: ReturnType<typeof makeWorld>, ...placements: [string, number, number][]): boolean | undefined {
  const game = new Game(world);
  for (const [item, row, col] of placements) game.place(item, row, col);
  return (game.preview() as { partial?: boolean }).partial;
}

describe("exact hint level", () => {
  it("never reports partial", () => {
    const game = new Game(makeWorld());
    game.place("a", 0, 0);
    expect(game.preview()).not.toHaveProperty("partial");
    expect(Object.keys(game.preview())).toEqual(["ok", "grid", "craftable"]);
  });
});

describe("partial hint level", () => {
  it("adds partial after craftable, and only partial", () => {
    const game = new Game(partialWorld());
    expect(Object.keys(game.preview())).toEqual(["ok", "grid", "craftable", "partial"]);
  });

  it("is false on an empty table", () => {
    expect(after(partialWorld())).toBe(false);
  });

  it("is true for a proper sub-multiset of a shapeless recipe", () => {
    expect(after(partialWorld(), ["a", 2, 2])).toBe(true); // a of a+a
    const withD = makeWorld({ hints: "partial", stock: { a: 4, b: 2, c: 1, d: 1 } });
    expect(after(withD, ["d", 1, 1])).toBe(true); // d of d+b
  });

  it("is true for a shaped recipe's pattern with cells still to add, at a position that fits", () => {
    expect(after(partialWorld(), ["a", 0, 0], ["b", 0, 1])).toBe(true); // a b / . c, top-left
    expect(after(partialWorld(), ["a", 1, 1], ["b", 1, 2])).toBe(true); // shifted down and right
    expect(after(partialWorld(), ["c", 2, 2])).toBe(true); // c is the pattern's last cell
  });

  it("is false when no recipe can extend the arrangement", () => {
    expect(after(partialWorld(), ["a", 0, 0], ["b", 1, 0])).toBe(false); // b below a, not beside it
    expect(after(partialWorld(), ["c", 0, 0])).toBe(false); // c cannot be the last cell at the corner
    expect(after(partialWorld(), ["b", 0, 0], ["b", 0, 1])).toBe(false); // too many b
  });

  it("is false for an exact match that nothing larger extends, though craftable is set", () => {
    const game = new Game(partialWorld());
    game.place("a", 0, 0);
    game.place("a", 0, 1);
    expect(game.preview()).toMatchObject({ craftable: "d", partial: false });
    const s = new Game(partialWorld());
    s.place("a", 0, 0);
    s.place("b", 0, 1);
    s.place("c", 1, 1);
    expect(s.preview()).toMatchObject({ craftable: "s", partial: false });
  });
});

describe("hints through the tools", () => {
  it("returns partial from place, remove, clear and look in a partial world only", async () => {
    const partial = await connect(partialWorld());
    for (const res of [
      await partial.call("place", { item: "a", row: 0, col: 0 }),
      await partial.call("look"),
      await partial.call("remove", { row: 0, col: 0 }),
      await partial.call("clear"),
    ]) {
      expect(res.json).toHaveProperty("partial");
    }
    const exact = await connect(makeWorld());
    expect((await exact.call("place", { item: "a", row: 0, col: 0 })).json).not.toHaveProperty("partial");
  });

  it("mentions partial in help only in a partial world, and names nothing", async () => {
    const partial = (await (await connect(partialWorld())).call("help")).json;
    const exact = (await (await connect(makeWorld())).call("help")).json;
    expect(String(partial?.["preview"])).toContain("partial");
    expect(String(exact?.["preview"])).not.toContain("partial");
  });
});
