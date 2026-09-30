import { describe, expect, it } from "vitest";
import { WorldError } from "../src/sim/errors.js";
import { parseWorld } from "../src/sim/schema.js";

const example = (): Record<string, unknown> => ({
  name: "forge",
  description: "A small workshop with a single crafting table.",
  grid: { rows: 3, cols: 3 },
  hints: "exact",
  stock: { ore: 4, wood: 3, dust: 2 },
  items: [
    { id: "ore", description: "A raw material." },
    { id: "wood", description: "A raw material." },
    { id: "dust", description: "A raw material." },
    { id: "bar", description: "A made item." },
    { id: "frame", description: "A made item." },
  ],
  recipes: [
    { id: "r-bar", kind: "shapeless", inputs: [{ item: "ore", qty: 2 }], output: { item: "bar", qty: 1 } },
    { id: "r-frame", kind: "shaped", pattern: [["bar", "bar"], ["wood", null]], output: { item: "frame", qty: 1 } },
  ],
});

const problemsOf = (data: unknown): string[] => {
  try {
    parseWorld(data);
  } catch (e) {
    if (e instanceof WorldError) return e.problems;
    throw e;
  }
  return [];
};

describe("parseWorld", () => {
  it("accepts the example world from the world-format contract", () => {
    const world = parseWorld(example());
    expect(world.name).toBe("forge");
    expect(world.recipes).toHaveLength(2);
  });

  it("rejects an unknown top-level field such as tasks or goals", () => {
    expect(problemsOf({ ...example(), tasks: [] }).join("\n")).toContain("tasks");
    expect(problemsOf({ ...example(), goals: [] }).join("\n")).toContain("goals");
  });

  it("rejects an unknown recipe kind", () => {
    const w = example();
    (w["recipes"] as Record<string, unknown>[])[0] = { id: "r", kind: "magic", output: { item: "bar", qty: 1 } };
    expect(problemsOf(w).length).toBeGreaterThan(0);
  });

  it("rejects a non-rectangular pattern", () => {
    const w = example();
    (w["recipes"] as Record<string, unknown>[])[1] = {
      id: "r-frame",
      kind: "shaped",
      pattern: [["bar", "bar"], ["wood"]],
      output: { item: "frame", qty: 1 },
    };
    expect(problemsOf(w).join("\n")).toContain("rectangular");
  });

  it("rejects a pattern with no items", () => {
    const w = example();
    (w["recipes"] as Record<string, unknown>[])[1] = {
      id: "r-frame",
      kind: "shaped",
      pattern: [[null, null]],
      output: { item: "frame", qty: 1 },
    };
    expect(problemsOf(w).join("\n")).toContain("at least one item");
  });

  it("rejects non-positive quantities and malformed ids", () => {
    const badQty = example();
    (badQty["stock"] as Record<string, number>)["ore"] = 0;
    expect(problemsOf(badQty).length).toBeGreaterThan(0);

    const badId = example();
    (badId["items"] as Record<string, unknown>[])[0] = { id: "Ore!", description: "x" };
    expect(problemsOf(badId).length).toBeGreaterThan(0);
  });

  it("trims empty border rows and columns of a shaped pattern", () => {
    const w = example();
    (w["recipes"] as Record<string, unknown>[])[1] = {
      id: "r-frame",
      kind: "shaped",
      pattern: [[null, null, null], [null, "bar", "bar"], [null, "wood", null]],
      output: { item: "frame", qty: 1 },
    };
    const world = parseWorld(w);
    const frame = world.recipes.find((r) => r.id === "r-frame");
    expect(frame?.kind === "shaped" && frame.pattern).toEqual([["bar", "bar"], ["wood", null]]);
  });

  it("defaults hints to exact", () => {
    const w = example();
    delete w["hints"];
    expect(parseWorld(w).hints).toBe("exact");
  });

  it("reports every problem, not just the first", () => {
    const w = { ...example(), tasks: [], grid: { rows: 0, cols: 3 } };
    expect(problemsOf(w).length).toBeGreaterThanOrEqual(2);
  });
});
