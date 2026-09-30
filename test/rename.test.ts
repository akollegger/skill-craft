import { describe, expect, it } from "vitest";
import { loadGoals } from "../src/sim/goals.js";
import { checkWorld, loadWorld } from "../src/sim/loader.js";
import { renameWorld } from "../src/sim/rename.js";
import type { Recipe } from "../src/sim/schema.js";
import { solve } from "../src/sim/solver.js";

const base = loadWorld("worlds/forge.json");
const goals = loadGoals("worlds/forge.goals.json", base);
const baseNames = base.items.map((i) => i.id);

/** Structure with names erased: quantities, kinds and which pattern cells are filled. */
const shape = (recipes: readonly Recipe[]) =>
  recipes.map((r) => (r.kind === "shapeless" ? ["sl", r.inputs.map((i) => i.qty), r.output.qty] : ["sh", r.pattern.map((row) => row.map((c) => c !== null)), r.output.qty]));

describe("renameWorld", () => {
  it("is reproducible from a seed, and different seeds differ", () => {
    const a = renameWorld(base, goals, { seed: 3 });
    expect(JSON.stringify(renameWorld(base, goals, { seed: 3 }))).toBe(JSON.stringify(a));
    expect(JSON.stringify(renameWorld(base, goals, { seed: 4 }))).not.toBe(JSON.stringify(a));
  });

  it("leaves none of the base world's names anywhere in the output", () => {
    const text = JSON.stringify(renameWorld(base, goals, { seed: 9 }));
    for (const name of [...baseNames, base.name]) expect(text, name).not.toMatch(new RegExp(`\\b${name}\\b`));
  });

  it("keeps every quantity, kind, arrangement and table setting when not perturbing", () => {
    const { world } = renameWorld(base, goals, { seed: 5 });
    expect(shape(world.recipes)).toEqual(shape(base.recipes));
    expect(world.grid).toEqual(base.grid);
    expect(world.hints).toBe(base.hints);
    expect(Object.values(world.stock).sort()).toEqual(Object.values(base.stock).sort());
    expect(world.items).toHaveLength(base.items.length);
  });

  it("reduces descriptions to a bare category by default, and can keep them", () => {
    const opaque = renameWorld(base, goals, { seed: 2 }).world;
    expect(new Set(opaque.items.map((i) => i.description))).toEqual(new Set(["A raw material.", "A made item."]));
    expect(opaque.description).not.toBe(base.description);
    const kept = renameWorld(base, goals, { seed: 2, keepDescriptions: true }).world;
    expect(kept.items.map((i) => i.description)).toEqual(base.items.map((i) => i.description));
  });

  it("maps the goals onto the new names, keeping quantities and dropping notes that name base items", () => {
    const out = renameWorld(base, goals, { seed: 6 });
    const ids = new Set(out.world.items.map((i) => i.id));
    expect(out.goals).toHaveLength(goals.length);
    out.goals.forEach((g, i) => {
      expect(ids.has(g.item)).toBe(true);
      expect(g.qty).toBe(goals[i]?.qty);
      expect(g).not.toHaveProperty("note");
    });
    expect(goals.some((g) => g.note !== undefined)).toBe(true); // the base goals do carry notes
  });

  it("produces valid, solvable worlds for 20 seeds", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const out = renameWorld(base, goals, { seed });
      expect(() => checkWorld(out.world), `seed ${seed}`).not.toThrow();
      for (const goal of out.goals) expect(solve(out.world, goal).reachable, `seed ${seed}`).toBe(true);
    }
  });
});

describe("perturbation", () => {
  it("changes recipes, stays valid and keeps the same goals solvable, for 20 seeds", () => {
    let shapedChanged = 0;
    let shapelessChanged = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const plain = renameWorld(base, goals, { seed });
      const out = renameWorld(base, goals, { seed, perturb: true });
      expect(() => checkWorld(out.world), `seed ${seed}`).not.toThrow();
      for (const goal of out.goals) expect(solve(out.world, goal).reachable, `seed ${seed}`).toBe(true);

      expect(out.world.items.map((i) => i.id)).toEqual(plain.world.items.map((i) => i.id)); // same names
      expect(JSON.stringify(out.world.recipes), `seed ${seed} should differ`).not.toBe(JSON.stringify(plain.world.recipes));
      out.world.recipes.forEach((r, i) => {
        const before = plain.world.recipes[i];
        if (JSON.stringify(r) === JSON.stringify(before)) return;
        if (r.kind === "shaped") shapedChanged++;
        else shapelessChanged++;
      });
    }
    expect(shapedChanged).toBeGreaterThan(0);
    expect(shapelessChanged).toBeGreaterThan(0);
  });

  it("is reproducible from a seed", () => {
    const a = renameWorld(base, goals, { seed: 11, perturb: true });
    expect(JSON.stringify(renameWorld(base, goals, { seed: 11, perturb: true }))).toBe(JSON.stringify(a));
  });
});
