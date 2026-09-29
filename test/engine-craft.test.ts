import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/engine.js";
import { loadWorld } from "../src/sim/loader.js";
import { parseWorld } from "../src/sim/schema.js";
import { gridOf, makeWorld } from "./helpers/worlds.js";

const items = (...ids: string[]) => ids.map((id) => ({ id, description: "An item." }));

/** One recipe: a + b in any arrangement makes c. */
const abToC = () =>
  makeWorld({
    stock: { a: 1, b: 1 },
    items: items("a", "b", "c"),
    recipes: [{ id: "r", kind: "shapeless", inputs: [{ item: "a", qty: 1 }, { item: "b", qty: 1 }], output: { item: "c", qty: 1 } }],
  });

describe("Story 1: discover what a combination makes", () => {
  it("reports the output once the inputs of a shapeless recipe are on the table", () => {
    const game = new Game(abToC());
    expect(game.place("a", 0, 0)).toMatchObject({ ok: true, craftable: null });
    expect(game.place("b", 2, 2)).toMatchObject({ ok: true, craftable: "c" });
  });

  it("consumes the table, adds the output, and leaves the table empty", () => {
    const game = new Game(abToC());
    game.place("a", 0, 0);
    game.place("b", 0, 1);
    expect(game.craft()).toEqual({ ok: true, crafted: { item: "c", qty: 1 } });
    expect(game.count("c")).toBe(1);
    expect(game.count("a")).toBe(0);
    expect(game.count("b")).toBe(0);
    expect(game.preview().grid).toEqual(gridOf(["...", "...", "..."]));
  });

  it("refuses to craft when nothing matches and consumes nothing", () => {
    const game = new Game(abToC());
    game.place("a", 1, 1);
    const before = game.preview();
    expect(game.craft()).toMatchObject({ ok: false, error: "nothing_to_craft" });
    expect(game.preview()).toEqual(before);
    expect(game.count("a")).toBe(0); // still on the table, not lost
  });

  it("lets a made item count toward a later recipe", () => {
    const game = new Game(makeWorld());
    game.place("a", 0, 0);
    expect(game.place("a", 0, 1)).toMatchObject({ craftable: "d" });
    game.craft();
    game.place("d", 1, 0);
    expect(game.place("b", 2, 2)).toMatchObject({ craftable: "e" });
    expect(game.craft()).toMatchObject({ ok: true, crafted: { item: "e" } });
  });

  it("matches a shaped recipe only in its arrangement", () => {
    const right = new Game(makeWorld());
    right.place("a", 0, 0);
    right.place("b", 0, 1);
    expect(right.place("c", 1, 1)).toMatchObject({ craftable: "s" });

    const wrong = new Game(makeWorld());
    wrong.place("a", 0, 0);
    wrong.place("b", 0, 1);
    expect(wrong.place("c", 1, 0)).toMatchObject({ craftable: null });
  });

  it("matches a shaped recipe wherever it sits on the table", () => {
    const game = new Game(makeWorld());
    game.place("a", 1, 1);
    game.place("b", 1, 2);
    expect(game.place("c", 2, 2)).toMatchObject({ craftable: "s" });
  });
});

describe("placement refusals", () => {
  it("names the reason for each refusal", () => {
    const game = new Game(makeWorld());
    expect(game.place("a", 9, 0)).toMatchObject({ ok: false, error: "out_of_bounds" });
    expect(game.place("zzz", 0, 0)).toMatchObject({ ok: false, error: "unknown_item" });
    game.place("a", 0, 0);
    expect(game.place("a", 0, 0)).toMatchObject({ ok: false, error: "cell_occupied" });
    expect(game.place("s", 1, 1)).toMatchObject({ ok: false, error: "not_in_inventory" });
  });
});

describe("loadWorld", () => {
  it("reads a world file and returns the same world as parseWorld", () => {
    const dir = mkdtempSync(join(tmpdir(), "skill-craft-"));
    const path = join(dir, "world.json");
    const world = makeWorld();
    writeFileSync(path, JSON.stringify(world));
    expect(loadWorld(path)).toEqual(parseWorld(JSON.parse(JSON.stringify(world))));
  });
});
