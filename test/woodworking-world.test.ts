import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { goalsPathFor, loadGoals } from "../src/sim/goals.js";
import { loadWorld } from "../src/sim/loader.js";
import { loadNotes, notesPathFor } from "../src/sim/notes.js";
import type { Recipe } from "../src/sim/schema.js";
import { solve, type BestRun } from "../src/sim/solver.js";

const PATH = "worlds/woodworking.json";
const world = loadWorld(PATH);
const goals = loadGoals(goalsPathFor(PATH), world);
const notes = loadNotes(notesPathFor(PATH), world);
const recipe = (id: string): Recipe => world.recipes.find((r) => r.id === id) as Recipe;

describe("the woodworking world (spike, perturbed)", () => {
  it("has 5 items and 4 recipes on a 3x3 table", () => {
    expect(world.items.map((i) => i.id)).toEqual(["log", "plank", "rod", "seat", "wooden_stool"]);
    expect(world.recipes).toHaveLength(4);
    expect(world.grid).toEqual({ rows: 3, cols: 3 });
  });

  it("makes four planks from a log and two rods from a column of two planks", () => {
    expect(recipe("r-planks")).toMatchObject({ kind: "shapeless", inputs: [{ item: "log", qty: 1 }], output: { item: "plank", qty: 4 } });
    expect(recipe("r-rods")).toMatchObject({ kind: "shaped", pattern: [["plank"], ["plank"]], output: { item: "rod", qty: 2 } });
  });

  it("makes a seat from a row of three planks", () => {
    expect(recipe("r-seat")).toMatchObject({ kind: "shaped", pattern: [["plank", "plank", "plank"]], output: { item: "seat", qty: 1 } });
  });

  it("makes the stool from a seat centred over a bottom row of three rods", () => {
    expect(recipe("r-wooden_stool")).toMatchObject({
      kind: "shaped",
      pattern: [[null, "seat", null], ["rod", "rod", "rod"]],
      output: { item: "wooden_stool", qty: 1 },
    });
  });

  it("uses only symmetric arrangements, since matching here does not mirror", () => {
    for (const r of world.recipes) {
      if (r.kind !== "shaped") continue;
      expect(r.pattern.map((row) => [...row].reverse()), r.id).toEqual(r.pattern);
    }
  });

  it("has recipe ids that are not item ids", () => {
    const items = new Set(world.items.map((i) => i.id));
    for (const r of world.recipes) expect(items.has(r.id), r.id).toBe(false);
  });

  it("uses no Minecraft vocabulary in anything an agent or a reader of the notes sees", () => {
    const text = [PATH, goalsPathFor(PATH), notesPathFor(PATH)].map((p) => readFileSync(p, "utf8")).join("\n");
    expect(text).not.toMatch(/stick|oak|slab|crafting_table|minecraft/i);
  });
});

describe("the goal", () => {
  it("is the wooden stool and nothing else", () => {
    expect(goals).toEqual([{ item: "wooden_stool", qty: 1 }]);
  });

  it("is reachable with room for at least one wasted craft, and needs the whole chain", () => {
    const run = solve(world, goals[0]!);
    expect(run.reachable).toBe(true);
    const best = run as BestRun;
    expect(best.slack).toBeGreaterThanOrEqual(1);
    expect(best.minCrafts).toBe(6);
  });
});

describe("the notes", () => {
  it("declare a perturbed world and say what was changed", () => {
    expect(notes.priorFit).toBe("perturbed");
    expect(notes.inspiration).toBeTruthy();
    expect(notes.recipes?.["r-rods"]).toMatch(/two|2/i);
  });
});
