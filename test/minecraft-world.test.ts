import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { goalsPathFor, loadGoals } from "../src/sim/goals.js";
import { loadWorld } from "../src/sim/loader.js";
import { loadNotes, notesPathFor } from "../src/sim/notes.js";
import type { Recipe } from "../src/sim/schema.js";
import { solve, type BestRun } from "../src/sim/solver.js";
import { connect } from "./helpers/client.js";

const PATH = "worlds/minecraft-inspired.json";
const world = loadWorld(PATH);
const goals = loadGoals(goalsPathFor(PATH), world);
const notes = loadNotes(notesPathFor(PATH), world);
const recipe = (id: string): Recipe => world.recipes.find((r) => r.id === id) as Recipe;
const pattern = (id: string) => {
  const r = recipe(id);
  if (r.kind !== "shaped") throw new Error(`${id} is not shaped`);
  return r.pattern;
};
const swap = (grid: (string | null)[][], from: string, to: string) => grid.map((row) => row.map((c) => (c === from ? to : c)));

describe("the faithful world (spec 003, US1)", () => {
  it("has 13 items and 10 recipes on a 3x3 table", () => {
    expect(world.items).toHaveLength(13);
    expect(world.recipes).toHaveLength(10);
    expect(world.grid).toEqual({ rows: 3, cols: 3 });
  });

  it("keeps its source's name out of the name the agent sees", () => {
    expect(world.name).toBe("workshop");
  });

  it("has three pickaxes that share one arrangement and differ only in material", () => {
    const wooden = pattern("r-wooden_pickaxe");
    expect(swap(wooden, "oak_planks", "cobblestone")).toEqual(pattern("r-stone_pickaxe"));
    expect(swap(wooden, "oak_planks", "iron_ingot")).toEqual(pattern("r-iron_pickaxe"));
    expect(wooden).toEqual([["oak_planks", "oak_planks", "oak_planks"], [null, "stick", null], [null, "stick", null]]);
  });

  it("has three swords that share another arrangement, so a wrong craft costs the same materials", () => {
    const wooden = pattern("r-wooden_sword");
    expect(swap(wooden, "oak_planks", "cobblestone")).toEqual(pattern("r-stone_sword"));
    expect(swap(wooden, "oak_planks", "iron_ingot")).toEqual(pattern("r-iron_sword"));
  });

  it("uses only symmetric arrangements, since matching here does not mirror", () => {
    for (const r of world.recipes) {
      if (r.kind !== "shaped") continue;
      const mirrored = r.pattern.map((row) => [...row].reverse());
      expect(mirrored, r.id).toEqual(r.pattern);
    }
  });

  it("has recipe ids that are not item ids, so a refusal naming an item never names a recipe", () => {
    const items = new Set(world.items.map((i) => i.id));
    for (const r of world.recipes) expect(items.has(r.id), r.id).toBe(false);
  });
});

describe("the goals", () => {
  it("are two learn goals and one held-out goal from the pickaxe family", () => {
    expect(goals.map((g) => [g.item, g.note])).toEqual([
      ["wooden_pickaxe", "learn"],
      ["stone_pickaxe", "learn"],
      ["iron_pickaxe", "held-out"],
    ]);
  });

  it("are all reachable, and the held-out goal leaves room for at least two wasted crafts", () => {
    for (const goal of goals) expect(solve(world, goal).reachable, goal.item).toBe(true);
    const held = solve(world, { item: "iron_pickaxe", qty: 1 }) as BestRun;
    expect(held.slack).toBeGreaterThanOrEqual(2);
  });

  it("make the held-out goal need intermediates made earlier in the same run", () => {
    const held = solve(world, { item: "iron_pickaxe", qty: 1 }) as BestRun;
    expect(held.minCrafts).toBeGreaterThanOrEqual(3);
    const crafted = held.calls.filter((c) => c.tool === "craft").length;
    expect(crafted).toBe(held.minCrafts);
  });
});

describe("what the agent can see", () => {
  it("is described in category-only words", () => {
    for (const item of world.items) expect(["A raw material.", "A made item."], item.id).toContain(item.description);
  });

  it("never carries the source's name, an edition, a version or the attribution", () => {
    const text = [readFileSync(PATH, "utf8"), readFileSync(goalsPathFor(PATH), "utf8")].join("\n");
    expect(text).not.toMatch(/minecraft|mojang|microsoft|trademark|affiliat|inspired|endorse/i);
    expect(text).not.toMatch(/\b(java|bedrock|edition)\b|\b\d+\.\d+(\.\d+)?\b/i);
  });

  it("is not shown by help, look, inventory or any refusal", async () => {
    const { call } = await connect(world);
    const outputs: string[] = [];
    for (const [tool, args] of [
      ["help", {}],
      ["look", {}],
      ["inventory", {}],
      ["place", { item: "no-such-item", row: 0, col: 0 }],
      ["place", { item: "iron_ingot", row: 99, col: 0 }],
      ["place", { item: "stick", row: 0, col: 0 }],
      ["craft", {}],
      ["remove", { row: 1, col: 1 }],
    ] as [string, Record<string, unknown>][]) {
      outputs.push((await call(tool, args)).text);
    }
    const text = outputs.join("\n");
    for (const id of world.recipes.map((r) => r.id)) expect(text, id).not.toContain(id);
    expect(text).not.toMatch(/minecraft|mojang|microsoft|trademark|affiliat|inspired|endorse/i);
    expect(text).not.toMatch(/\b(java|bedrock|edition)\b/i);
    const help = outputs[0] as string;
    for (const id of world.items.map((i) => i.id)) expect(help, id).not.toMatch(new RegExp(`\\b${id}\\b`));
  });
});

describe("the notes beside the world", () => {
  it("declare the world faithful, with a note per recipe and a list of omissions", () => {
    expect(notes.priorFit).toBe("faithful");
    expect(Object.keys(notes.recipes ?? {}).sort()).toEqual(world.recipes.map((r) => r.id).sort());
    expect(notes.omissions?.length).toBeGreaterThanOrEqual(4);
  });

  it("state what the world leaves out, including smelting and the mirrored and any-of recipes", () => {
    const text = (notes.omissions ?? []).join(" ").toLowerCase();
    for (const word of ["gathering", "smelting", "durability", "mirrored", "any of"]) expect(text, word).toContain(word);
  });
});

describe("the attribution (FR-009)", () => {
  const readme = readFileSync("worlds/README.md", "utf8");

  it("credits the game as inspiration and says the project is unaffiliated", () => {
    expect(readme).toMatch(/inspired\s+by\s+minecraft/i);
    expect(readme).toMatch(/trademark/i);
    expect(readme).toMatch(/not\s+affiliated\s+with\s+or\s+endorsed\s+by/i);
  });

  it("names no edition or version", () => {
    expect(readme).not.toMatch(/\b(java|bedrock)\b|\bedition\b(?! or version)|\b\d+\.\d+\.\d+\b/i);
  });

  it("is linked from the repository readme", () => {
    expect(readFileSync("README.md", "utf8")).toContain("worlds/README.md");
  });
});
