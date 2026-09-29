import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorldError } from "../src/sim/errors.js";
import { checkWorld, loadWorld } from "../src/sim/loader.js";
import { makeWorld } from "./helpers/worlds.js";

const VALID = "test/fixtures/valid";
const INVALID = "test/fixtures/invalid";

const jsonFiles = (dir: string, exclude = /\.goals\.json$/) => readdirSync(dir).filter((f) => f.endsWith(".json") && !exclude.test(f)).sort();

const problemsOf = (data: unknown): string[] => {
  try {
    checkWorld(data);
  } catch (e) {
    if (e instanceof WorldError) return e.problems;
    throw e;
  }
  return [];
};

describe("valid fixtures", () => {
  it("has ten of them", () => {
    expect(jsonFiles(VALID)).toHaveLength(10);
  });

  for (const file of jsonFiles(VALID)) {
    it(`${file} loads and validates`, () => {
      expect(() => loadWorld(join(VALID, file))).not.toThrow();
    });
  }
});

describe("invalid fixtures", () => {
  it("has a broken world for every rule", () => {
    expect(jsonFiles(INVALID).length).toBeGreaterThanOrEqual(16);
  });

  for (const file of jsonFiles(INVALID)) {
    it(`${file} is rejected with its expected problem`, () => {
      const data = JSON.parse(readFileSync(join(INVALID, file), "utf8")) as Record<string, unknown>;
      const expected = String(data["$expect"]);
      delete data["$expect"];
      const problems = problemsOf(data);
      expect(problems.length, "should be rejected").toBeGreaterThan(0);
      expect(problems.join("\n")).toContain(expected);
    });
  }
});

describe("validation", () => {
  it("accepts the standard test world", () => {
    expect(problemsOf(makeWorld())).toEqual([]);
  });

  it("reports every problem together, not just the first", () => {
    const world = makeWorld();
    const broken = {
      ...world,
      grid: { rows: 7, cols: 7 },
      items: [...world.items, { id: "a", description: "again" }],
      recipes: [
        ...world.recipes,
        { id: "r-x", kind: "shapeless", inputs: [{ item: "ghost", qty: 1 }], output: { item: "d", qty: 1 } },
      ],
    };
    const problems = problemsOf(broken).join("\n");
    expect(problems).toContain("above the limit");
    expect(problems).toContain("duplicate item id 'a'");
    expect(problems).toContain("unknown item 'ghost'");
  });

  it("names the recipe involved in a conflict", () => {
    const world = makeWorld();
    const conflicting = { ...world, recipes: [...world.recipes, { id: "r-dup", kind: "shapeless", inputs: [{ item: "a", qty: 2 }], output: { item: "e", qty: 1 } }] };
    expect(problemsOf(conflicting).join("\n")).toMatch(/'r-d' and 'r-dup'/);
  });

  it("treats an item that only another recipe can supply as obtainable", () => {
    // r-e needs d, which r-d makes from stock: valid. Removing the stock of a makes both unobtainable.
    const world = makeWorld();
    expect(problemsOf(world)).toEqual([]);
    const noStock = { ...world, stock: { b: 2, c: 1 } };
    expect(problemsOf(noStock).join("\n")).toContain("cannot be obtained");
  });

  it("reports an unreadable file as a world error", () => {
    expect(() => loadWorld("test/fixtures/does-not-exist.json")).toThrow(WorldError);
  });
});
