import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/engine.js";
import { planFor, type PlanStep } from "../src/sim/plan.js";
import { renameWorld } from "../src/sim/rename.js";
import type { World } from "../src/sim/schema.js";
import { loadWorld, parseWorld, validateWorld, WorldError } from "../src/sim/world-loader.js";

const base = () => loadWorld("worlds/ember-forge.json");

/** Run a plan through the engine; every step must succeed. */
function execute(game: Game, steps: PlanStep[]): void {
  for (const s of steps) {
    const r =
      s.action === "gather" ? game.gather(s.item, s.qty)
      : s.action === "craft" ? game.craft(s.item, s.qty)
      : game.placeStation(s.station);
    expect(r, JSON.stringify(s)).toMatchObject({ ok: true });
  }
}

describe("engine rules", () => {
  it("rejects bad input and unknown names", () => {
    const g = new Game(base());
    expect(g.gather("timber", 0)).toMatchObject({ ok: false, error: "invalid_quantity" });
    expect(g.gather("nope", 1)).toMatchObject({ ok: false, error: "unknown_item" });
    expect(g.craft("nope", 1)).toMatchObject({ ok: false, error: "unknown_item" });
    expect(g.placeStation("nope")).toMatchObject({ ok: false, error: "unknown_station" });
  });

  it("only raw materials can be gathered, only made things crafted", () => {
    const g = new Game(base());
    expect(g.gather("board", 1)).toMatchObject({ ok: false, error: "not_gatherable" });
    expect(g.craft("timber", 1)).toMatchObject({ ok: false, error: "not_craftable" });
  });

  it("enforces tool tiers", () => {
    const g = new Game(base());
    expect(g.gather("timber", 2)).toMatchObject({ ok: true });
    expect(g.gather("rubble", 2)).toMatchObject({ ok: false, error: "wrong_tool_tier", details: { toolTier: 0, tierNeeded: 1 } });
  });

  it("requires a placed station, then ingredients, then fuel", () => {
    const g = new Game(base());
    g.gather("timber", 6);
    g.craft("board", 8);
    g.craft("rod", 2);
    expect(g.craft("chipper", 1)).toMatchObject({ ok: false, error: "no_station_nearby" });
    g.craft("workbench", 1);
    expect(g.placeStation("bench")).toMatchObject({ ok: true });
    expect(g.craft("hammer", 1)).toMatchObject({ ok: false, error: "missing_ingredient" });
    expect(g.craft("chipper", 1)).toMatchObject({ ok: true });
    expect(g.inventory()).toMatchObject({ toolTier: 1, stations: ["bench"] });
  });

  it("fails smelting without fuel and consumes nothing", () => {
    const world = base();
    const g = new Game(world);
    const steps = planFor(world, { item: "ingot", qty: 1 }).steps;
    const last = steps.findIndex((s) => s.action === "craft" && s.item === "ingot");
    // everything except the final smelt, and skip gathering the fuel
    execute(g, steps.slice(0, last).filter((s) => !(s.action === "gather" && s.item === "cinder")));
    const ore = g.count("veinrock");
    expect(ore).toBe(1);
    expect(g.craft("ingot", 1)).toMatchObject({ ok: false, error: "missing_fuel", details: { fuel: { need: 1, have: 0 } } });
    expect(g.count("veinrock")).toBe(ore);
    expect(g.count("ingot")).toBe(0);
  });

  it("logs every call with its outcome", () => {
    const g = new Game(base());
    g.survey();
    g.gather("rubble", 1);
    expect(g.log.map((l) => [l.tool, l.ok, l.error])).toEqual([
      ["survey", true, undefined],
      ["gather", false, "wrong_tool_tier"],
    ]);
  });
});

describe("planner", () => {
  it("solves every task in the base world when executed by the engine", () => {
    const world = base();
    for (const task of world.tasks) {
      const game = new Game(world);
      const plan = planFor(world, task.goal);
      execute(game, plan.steps);
      expect(game.count(task.goal.item)).toBeGreaterThanOrEqual(task.goal.qty);
      expect(game.inventory()).toMatchObject({ tasks: expect.arrayContaining([{ id: task.id, done: true }]) });
    }
  });
});

describe("world validation", () => {
  it("accepts the base world", () => {
    expect(validateWorld(base())).toEqual([]);
  });

  it("reports dangling references", () => {
    const w = structuredClone(base());
    w.recipes[0]!.inputs[0]!.item = "ghost";
    w.stations[0]!.item = "phantom";
    const problems = validateWorld(w);
    expect(problems.some((p) => p.includes("ghost"))).toBe(true);
    expect(problems.some((p) => p.includes("phantom"))).toBe(true);
  });

  it("reports recipe cycles as unsolvable tasks", () => {
    const w = structuredClone(base());
    w.recipes.find((r) => r.id === "r-board")!.inputs = [{ item: "rod", qty: 1 }];
    expect(validateWorld(w).some((p) => p.includes("not solvable"))).toBe(true);
  });

  it("throws WorldError with all problems from parseWorld", () => {
    expect(() => parseWorld({ name: "x" })).toThrow(WorldError);
  });
});

describe("renamer", () => {
  const shape = (w: World) => ({
    items: w.items.length,
    recipes: w.recipes.map((r) => [r.inputs.map((i) => i.qty), r.output.qty, !!r.station, r.fuel?.qty ?? 0]),
    tiers: w.items.map((i) => [i.gather?.minTier ?? -1, i.toolTier ?? 0]),
  });

  it("is deterministic per seed and differs across seeds", () => {
    expect(renameWorld(base(), { seed: 3 })).toEqual(renameWorld(base(), { seed: 3 }));
    expect(renameWorld(base(), { seed: 3 })).not.toEqual(renameWorld(base(), { seed: 4 }));
  });

  it("removes every original name", () => {
    const original = base();
    const ids = new Set(original.items.map((i) => i.id));
    for (const i of renameWorld(original, { seed: 9 }).items) expect(ids.has(i.id)).toBe(false);
  });

  it("can strip flavour text so descriptions reveal nothing", () => {
    const w = renameWorld(base(), { seed: 2, opaque: true });
    expect(new Set(w.items.map((i) => i.description))).toEqual(new Set(["A raw material.", "A tool.", "A made item."]));
  });

  it("preserves structure when not perturbing", () => {
    expect(shape(renameWorld(base(), { seed: 5 }))).toEqual(shape(base()));
  });

  it("changes quantities when perturbing, and stays solvable", () => {
    let changed = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const w = renameWorld(base(), { seed, perturb: true });
      expect(validateWorld(w)).toEqual([]);
      if (JSON.stringify(shape(w)) !== JSON.stringify(shape(base()))) changed++;
    }
    expect(changed).toBeGreaterThan(10);
  });

  it("produces solvable, executable worlds for many seeds", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = renameWorld(base(), { seed });
      for (const t of w.tasks) {
        const game = new Game(w);
        execute(game, planFor(w, t.goal).steps);
        expect(game.count(t.goal.item)).toBeGreaterThanOrEqual(t.goal.qty);
      }
    }
  });
});
