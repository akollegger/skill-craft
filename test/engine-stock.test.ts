import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/engine.js";
import { makeWorld } from "./helpers/worlds.js";

const items = (...ids: string[]) => ids.map((id) => ({ id, description: "An item." }));

/** Everything observable about a game: held counts and the preview. */
const snapshot = (game: Game) => ({
  held: Object.fromEntries(game.world.items.map((i) => [i.id, game.count(i.id)])),
  preview: game.preview(),
});

describe("Story 2: exploring is free and reversible", () => {
  it("place takes a unit from the inventory and remove gives it back", () => {
    const game = new Game(makeWorld());
    expect(game.count("a")).toBe(4);
    game.place("a", 0, 0);
    expect(game.count("a")).toBe(3);
    expect(game.remove(0, 0)).toMatchObject({ ok: true });
    expect(game.count("a")).toBe(4);
  });

  it("refuses to place an item that is not held", () => {
    const game = new Game(makeWorld()); // c: 1
    game.place("c", 0, 0);
    expect(game.place("c", 0, 1)).toMatchObject({ ok: false, error: "not_in_inventory" });
  });

  it("clear returns every table item, and clearing an empty table succeeds", () => {
    const game = new Game(makeWorld());
    game.place("a", 0, 0);
    game.place("a", 0, 1);
    game.place("b", 1, 1);
    expect(game.clear()).toMatchObject({ ok: true });
    expect(game.count("a")).toBe(4);
    expect(game.count("b")).toBe(2);
    expect(game.preview().grid.flat().every((c) => c === null)).toBe(true);
    expect(game.clear()).toMatchObject({ ok: true });
  });

  it("refuses a second item in an occupied cell", () => {
    const game = new Game(makeWorld());
    game.place("a", 1, 1);
    expect(game.place("b", 1, 1)).toMatchObject({ ok: false, error: "cell_occupied" });
  });

  it("refuses positions outside the table for place and remove", () => {
    const game = new Game(makeWorld());
    expect(game.place("a", -1, 0)).toMatchObject({ ok: false, error: "out_of_bounds" });
    expect(game.place("a", 0, 3)).toMatchObject({ ok: false, error: "out_of_bounds" });
    expect(game.remove(3, 0)).toMatchObject({ ok: false, error: "out_of_bounds" });
  });

  it("refuses to remove from an empty cell", () => {
    expect(new Game(makeWorld()).remove(0, 0)).toMatchObject({ ok: false, error: "cell_empty" });
  });

  it("lets the agent rearrange a shaped recipe from wrong to right", () => {
    const game = new Game(makeWorld());
    game.place("a", 0, 0);
    game.place("b", 0, 1);
    expect(game.place("c", 1, 0)).toMatchObject({ craftable: null });
    game.remove(1, 0);
    expect(game.place("c", 1, 1)).toMatchObject({ craftable: "s" });
  });
});

describe("Story 2: only crafting spends stock", () => {
  it("a wrong craft spends raw items and can make the goal unreachable", () => {
    const world = makeWorld({
      stock: { a: 2 },
      items: items("a", "x", "g"),
      recipes: [
        { id: "r-x", kind: "shapeless", inputs: [{ item: "a", qty: 1 }], output: { item: "x", qty: 1 } },
        { id: "r-g", kind: "shapeless", inputs: [{ item: "a", qty: 2 }], output: { item: "g", qty: 1 } },
      ],
    });
    const game = new Game(world);
    game.place("a", 0, 0);
    expect(game.craft()).toMatchObject({ ok: true, crafted: { item: "x" } }); // the wrong craft
    expect(game.count("a")).toBe(1);
    game.place("a", 0, 0);
    expect(game.place("a", 0, 1)).toMatchObject({ ok: false, error: "not_in_inventory" });
    expect(game.preview().craftable).toBe("x"); // one a still only makes x
    expect(game.count("g")).toBe(0);
  });

  it("no sequence of up to four place/remove/clear calls creates or destroys an item", () => {
    const world = makeWorld({
      grid: { rows: 2, cols: 2 },
      stock: { a: 2, b: 2 },
      items: items("a", "b", "c"),
      recipes: [{ id: "r", kind: "shapeless", inputs: [{ item: "a", qty: 1 }, { item: "b", qty: 1 }], output: { item: "c", qty: 1 } }],
    });
    type Op = () => (game: Game) => unknown;
    const ops: Op[] = [];
    for (const item of ["a", "b"]) for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) ops.push(() => (g) => g.place(item, r, c));
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) ops.push(() => (g) => g.remove(r, c));
    ops.push(() => (g) => g.clear());
    expect(ops).toHaveLength(13);

    let sequences = 0;
    const conserved = (game: Game) =>
      ["a", "b"].every((item) => game.count(item) + game.preview().grid.flat().filter((c) => c === item).length === 2);

    const walk = (chosen: number[]) => {
      const game = new Game(world);
      for (const i of chosen) {
        ops[i]!()(game);
        expect(conserved(game)).toBe(true);
      }
      sequences++;
      if (chosen.length < 4) for (let i = 0; i < ops.length; i++) walk([...chosen, i]);
    };
    walk([]);
    expect(sequences).toBe(1 + 13 + 13 ** 2 + 13 ** 3 + 13 ** 4);
  });

  it("a refusal leaves inventory, table and preview unchanged", () => {
    const game = new Game(makeWorld());
    game.place("a", 0, 0);
    game.place("c", 1, 1);
    const refusals: (() => unknown)[] = [
      () => game.place("a", 9, 9),
      () => game.place("zzz", 2, 2),
      () => game.place("b", 0, 0),
      () => game.place("s", 2, 0),
      () => game.remove(2, 2),
      () => game.remove(9, 9),
      () => game.craft(),
    ];
    for (const attempt of refusals) {
      const before = snapshot(game);
      expect(attempt()).toMatchObject({ ok: false });
      expect(snapshot(game)).toEqual(before);
    }
  });

  it("two games built from one world share no state", () => {
    const world = makeWorld();
    const one = new Game(world);
    const two = new Game(world);
    one.place("a", 0, 0);
    one.place("a", 0, 1);
    one.craft();
    expect(one.count("d")).toBe(1);
    expect(two.count("d")).toBe(0);
    expect(two.count("a")).toBe(4);
    expect(two.preview().grid.flat().every((c) => c === null)).toBe(true);
  });
});
