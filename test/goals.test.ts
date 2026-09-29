import { describe, expect, it } from "vitest";
import { WorldError } from "../src/sim/errors.js";
import { goalsPathFor, loadGoals, parseGoals } from "../src/sim/goals.js";
import { loadWorld } from "../src/sim/loader.js";
import { makeWorld } from "./helpers/worlds.js";

const world = makeWorld();

const problemsOf = (data: unknown): string => {
  try {
    parseGoals(data, world);
  } catch (e) {
    if (e instanceof WorldError) return e.problems.join("\n");
    throw e;
  }
  return "";
};

describe("goals file", () => {
  it("parses goals with an optional note", () => {
    expect(parseGoals({ goals: [{ item: "d", qty: 1 }, { item: "e", qty: 2, note: "harder" }] }, world)).toEqual([
      { item: "d", qty: 1 },
      { item: "e", qty: 2, note: "harder" },
    ]);
  });

  it("rejects an item the world does not define", () => {
    expect(problemsOf({ goals: [{ item: "ghost", qty: 1 }] })).toContain("unknown item 'ghost'");
  });

  it("rejects a non-positive quantity", () => {
    expect(problemsOf({ goals: [{ item: "d", qty: 0 }] })).not.toBe("");
  });

  it("rejects an unknown field, an empty list and a missing list", () => {
    expect(problemsOf({ goals: [{ item: "d", qty: 1, priority: 1 }] })).not.toBe("");
    expect(problemsOf({ goals: [] })).not.toBe("");
    expect(problemsOf({})).not.toBe("");
  });

  it("finds the goals file beside a world file", () => {
    expect(goalsPathFor("worlds/forge.json")).toBe("worlds/forge.goals.json");
    expect(goalsPathFor("a/b/tiny-2x2.json")).toBe("a/b/tiny-2x2.goals.json");
  });

  it("loads a fixture's goals against its world", () => {
    const path = "test/fixtures/valid/mirror-pair.json";
    const goals = loadGoals(goalsPathFor(path), loadWorld(path));
    expect(goals.map((g) => g.item)).toEqual(["c", "d"]);
  });

  it("is not accepted inside a world file", () => {
    expect(() => loadWorld("test/fixtures/invalid/stray-tasks.json")).toThrow(WorldError);
  });
});
