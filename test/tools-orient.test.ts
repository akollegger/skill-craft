import { describe, expect, it } from "vitest";
import { connect } from "./helpers/client.js";
import { makeWorld } from "./helpers/worlds.js";

const SEVEN = ["clear", "craft", "help", "inventory", "look", "place", "remove"];

/** A world with word-like ids, so leaks are easy to spot in text. */
const wordy = () =>
  makeWorld({
    stock: { ore: 2, wood: 1 },
    items: ["ore", "wood", "plank", "frame"].map((id) => ({ id, description: "An item." })),
    recipes: [
      { id: "r-plank", kind: "shapeless", inputs: [{ item: "wood", qty: 1 }], output: { item: "plank", qty: 1 } },
      { id: "r-frame", kind: "shaped", pattern: [["plank", "ore"], ["ore", null]], output: { item: "frame", qty: 1 } },
    ],
  });

describe("tool list", () => {
  it("is exactly the seven tools, with no gather, reset or log tool", async () => {
    const { client } = await connect(makeWorld());
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(SEVEN);
  });
});

describe("help", () => {
  it("describes the world and every tool, and gives no recipes", async () => {
    const world = wordy();
    const { call } = await connect(world);
    const res = await call("help");
    expect(res.isError).toBe(false);
    expect(res.json?.["world"]).toEqual({ name: world.name, description: world.description, grid: { rows: 3, cols: 3 } });
    expect(res.json?.["coordinates"]).toContain("zero-based");
    const toolNames = (res.json?.["tools"] as { name: string; purpose: string }[]).map((t) => t.name);
    expect(toolNames.slice().sort()).toEqual(SEVEN);
    for (const t of res.json?.["tools"] as { purpose: string }[]) expect(t.purpose.length).toBeGreaterThan(10);
    for (const id of [...world.items.map((i) => i.id), ...world.recipes.map((r) => r.id)]) {
      expect(res.text, id).not.toMatch(new RegExp(`\\b${id}\\b`));
    }
  });
});

describe("inventory", () => {
  it("returns only items held, omitting zero quantities, keys sorted", async () => {
    const { call } = await connect(wordy());
    const start = await call("inventory");
    expect(Object.keys(start.json ?? {})).toEqual(["items"]);
    expect(start.json?.["items"]).toEqual({ ore: 2, wood: 1 });

    await call("place", { item: "wood", row: 0, col: 0 });
    const after = await call("inventory");
    expect(after.json).toEqual({ items: { ore: 2 } });
    expect(Object.keys(after.json?.["items"])).toEqual(Object.keys(after.json?.["items"]).sort());
  });
});

describe("look", () => {
  it("shows the same preview as the last change and alters nothing", async () => {
    const { call } = await connect(makeWorld());
    const placed = await call("place", { item: "a", row: 1, col: 1 });
    const looked = await call("look");
    expect(looked.json).toEqual(placed.json);
    expect(await call("look")).toEqual(looked);
  });
});

describe("read-only tools change nothing (SC-009)", () => {
  it("leaves inventory, table and preview identical after ten calls each", async () => {
    const { call, game } = await connect(makeWorld());
    const states = [async () => undefined, async () => call("place", { item: "a", row: 0, col: 0 }), async () => call("place", { item: "a", row: 0, col: 1 })];
    for (const setup of states) {
      await setup();
      const before = { held: game.world.items.map((i) => game.count(i.id)), preview: game.preview() };
      for (let i = 0; i < 10; i++) for (const tool of ["help", "inventory", "look"]) await call(tool);
      expect({ held: game.world.items.map((i) => game.count(i.id)), preview: game.preview() }).toEqual(before);
    }
  });
});

describe("no recipe information leaks (SC-006)", () => {
  it("keeps recipe ids, unrelated item ids and remedy words out of every answer", async () => {
    const world = wordy();
    const { call } = await connect(world);
    const recipeIds = world.recipes.map((r) => r.id);
    const itemIds = world.items.map((i) => i.id);
    const remedy = /\b(try|should|instead|need to|must)\b/i;

    const outputs: { text: string; allowed: string[]; refusal: boolean }[] = [];
    const run = async (tool: string, args: Record<string, unknown> = {}, allowed: string[] = []) => {
      const r = await call(tool, args);
      outputs.push({ text: r.text, allowed, refusal: r.isError });
      return r;
    };

    await run("help");
    await run("inventory");
    await run("look");
    await run("place", { item: "wood", row: 0, col: 0 });
    await run("look");
    await run("place", { item: "wood", row: 0, col: 1 }, ["wood"]); // not_in_inventory
    await run("place", { item: "ghost", row: 0, col: 1 }, ["ghost"]); // unknown_item
    await run("place", { item: "ore", row: 0, col: 0 }, ["ore"]); // cell_occupied
    await run("place", { item: "ore", row: 9, col: 9 }, ["ore"]); // out_of_bounds
    await run("remove", { row: 2, col: 2 }); // cell_empty
    await run("remove", { row: 9, col: 9 }); // out_of_bounds
    await run("clear");
    await run("craft"); // nothing_to_craft
    await run("inventory");

    for (const { text, allowed, refusal } of outputs) {
      for (const id of recipeIds) expect(text).not.toContain(id);
      if (refusal) {
        expect(text).not.toMatch(remedy);
        for (const id of itemIds.filter((i) => !allowed.includes(i))) expect(text).not.toMatch(new RegExp(`\\b${id}\\b`));
      }
    }
    expect(outputs.filter((o) => o.refusal).length).toBeGreaterThanOrEqual(6);
  });
});

describe("the call budget's refusal (spec 008, FR-011, SC-004)", () => {
  it("is one fixed line that names no item, recipe, tool or grid cell of any world", async () => {
    const { BUDGET_REFUSAL } = await import("../src/harness/ai-options.js");
    const { readFileSync, readdirSync } = await import("node:fs");
    const worlds = ["worlds/forge.json", "worlds/woodworking.json", "worlds/minecraft-inspired.json", ...readdirSync("worlds/generated").filter((f) => f.endsWith(".json") && !/goals|notes|art/.test(f)).map((f) => `worlds/generated/${f}`)];
    for (const path of worlds) {
      const world = JSON.parse(readFileSync(path, "utf8")) as { items?: { id: string }[] };
      for (const item of world.items ?? []) expect(BUDGET_REFUSAL, `${path}: ${item.id}`).not.toContain(item.id);
    }
    expect(BUDGET_REFUSAL).not.toMatch(/recipe|shaped|shapeless|row|col|craft|place|inventory/i);
  });
});
