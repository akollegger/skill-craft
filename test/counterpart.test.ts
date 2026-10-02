import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { goalsPathFor, loadGoals } from "../src/sim/goals.js";
import { loadWorld } from "../src/sim/loader.js";
import { loadNotes, notesPathFor } from "../src/sim/notes.js";
import { renameWorld } from "../src/sim/rename.js";
import type { Recipe } from "../src/sim/schema.js";
import { solve, type BestRun } from "../src/sim/solver.js";

const BASE = "worlds/minecraft-inspired.json";
const COUNTERPART = "worlds/generated/minecraft-inspired-7.json";
const base = loadWorld(BASE);
const baseGoals = loadGoals(goalsPathFor(BASE), base);

/** Structure with names erased: kinds, quantities and which pattern cells are filled. */
const shape = (recipes: readonly Recipe[]) =>
  recipes.map((r) => (r.kind === "shapeless" ? ["sl", r.inputs.map((i) => i.qty), r.output.qty] : ["sh", r.pattern.map((row) => row.map((c) => c !== null)), r.output.qty]));

describe("the invented counterpart of the faithful world (spec 003, US3)", () => {
  const { world, goals } = renameWorld(base, baseGoals, { seed: 7 });

  it("keeps the recipe structure, the table and the stock quantities", () => {
    expect(shape(world.recipes)).toEqual(shape(base.recipes));
    expect(world.grid).toEqual(base.grid);
    expect(Object.values(world.stock).sort()).toEqual(Object.values(base.stock).sort());
  });

  it("is solvable for the same goals with the same best runs", () => {
    expect(goals).toHaveLength(baseGoals.length);
    goals.forEach((g, i) => {
      const there = solve(world, g) as BestRun;
      const here = solve(base, baseGoals[i]!) as BestRun;
      expect(there.reachable).toBe(true);
      expect([there.minCrafts, there.minCalls, there.slack]).toEqual([here.minCrafts, here.minCalls, here.slack]);
    });
  });

  it("carries none of the base world's names anywhere", () => {
    const text = JSON.stringify({ world, goals });
    // The world's own name, "workshop", is an ordinary word that its description still uses; it names no recipe.
    for (const name of [...base.items.map((i) => i.id), ...base.recipes.map((r) => r.id)]) {
      expect(text, name).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
    expect(text).not.toMatch(/minecraft|mojang|pickaxe|sword|oak|cobblestone|iron/i);
  });
});

describe("the committed counterpart", () => {
  it("equals what the renamer produces from the committed base, byte for byte", () => {
    const { world, goals } = renameWorld(base, baseGoals, { seed: 7 });
    const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
    expect(readFileSync(COUNTERPART, "utf8")).toBe(json(world));
    expect(readFileSync(goalsPathFor(COUNTERPART), "utf8")).toBe(json({ goals }));
  });

  it("declares itself invented and says where it came from", () => {
    const notes = loadNotes(notesPathFor(COUNTERPART), loadWorld(COUNTERPART));
    expect(notes).toEqual({ priorFit: "invented", derivedFrom: BASE });
  });
});
