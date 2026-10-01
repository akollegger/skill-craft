import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorldError } from "../src/sim/errors.js";
import { loadNotes, notesPathFor, parseNotes, priorFitOf } from "../src/sim/notes.js";
import { makeWorld } from "./helpers/worlds.js";

const world = makeWorld(); // recipes r-d, r-e, r-s

const faithful = {
  priorFit: "faithful",
  inspiration: "a well-known crafting game",
  recipes: { "r-d": "Two of one thing make another.", "r-e": "A made thing joins a raw one.", "r-s": "An arrangement on the table." },
  omissions: ["Gathering raw materials"],
};

const problemsOf = (data: unknown): string[] => {
  try {
    parseNotes(data, world);
  } catch (e) {
    if (e instanceof WorldError) return e.problems;
    throw e;
  }
  return [];
};

describe("parseNotes", () => {
  it("accepts a complete faithful file", () => {
    expect(parseNotes(faithful, world).priorFit).toBe("faithful");
  });

  it("accepts the short form of a generated world", () => {
    expect(parseNotes({ priorFit: "invented", derivedFrom: "worlds/forge.json" }, world).priorFit).toBe("invented");
  });

  it("rejects an unknown prior fit and an unknown field", () => {
    expect(problemsOf({ ...faithful, priorFit: "mostly-real" }).length).toBeGreaterThan(0);
    expect(problemsOf({ ...faithful, colour: "blue" }).length).toBeGreaterThan(0);
  });

  it("requires a faithful file to carry inspiration, omissions and a note for every recipe", () => {
    const { inspiration: _i, ...noInspiration } = faithful;
    expect(problemsOf(noInspiration).join("\n")).toMatch(/inspiration/);
    expect(problemsOf({ ...faithful, omissions: [] }).join("\n")).toMatch(/omissions/);
    expect(problemsOf({ ...faithful, recipes: { "r-d": "x" } }).join("\n")).toMatch(/r-e/);
  });

  it("rejects a note for a recipe the world lacks", () => {
    expect(problemsOf({ ...faithful, recipes: { ...faithful.recipes, "r-ghost": "x" } }).join("\n")).toMatch(/r-ghost/);
  });

  it("rejects text that names an edition or a version of the source", () => {
    for (const text of ["the Java game", "Bedrock rules", "the second edition", "release 1.21", "as of 1.20.4"]) {
      expect(problemsOf({ ...faithful, inspiration: text }).join("\n"), text).toMatch(/edition|version/);
      expect(problemsOf({ ...faithful, omissions: [text] }).join("\n"), text).toMatch(/edition|version/);
    }
    expect(problemsOf({ ...faithful, recipes: { ...faithful.recipes, "r-d": "Needs Java." } }).join("\n")).toMatch(/edition|version/);
  });

  it("reports every problem together", () => {
    const problems = problemsOf({ priorFit: "faithful", recipes: { "r-ghost": "x" } });
    expect(problems.length).toBeGreaterThanOrEqual(3);
  });
});

describe("priorFitOf and loadNotes", () => {
  const dir = mkdtempSync(join(tmpdir(), "notes-"));
  const worldFile = join(dir, "w.json");
  writeFileSync(worldFile, JSON.stringify(world));

  it("puts the notes file beside the world", () => {
    expect(notesPathFor("worlds/forge.json")).toBe("worlds/forge.notes.json");
  });

  it("is 'undeclared' when there is no notes file", () => {
    expect(priorFitOf(worldFile)).toBe("undeclared");
  });

  it("reads the declared prior fit", () => {
    writeFileSync(notesPathFor(worldFile), JSON.stringify(faithful));
    expect(priorFitOf(worldFile)).toBe("faithful");
    expect(loadNotes(notesPathFor(worldFile), world).omissions).toEqual(["Gathering raw materials"]);
  });

  it("throws for a notes file that exists but is invalid, rather than saying 'undeclared'", () => {
    writeFileSync(notesPathFor(worldFile), JSON.stringify({ priorFit: "nope" }));
    expect(() => priorFitOf(worldFile)).toThrow(WorldError);
    writeFileSync(notesPathFor(worldFile), "{not json");
    expect(() => priorFitOf(worldFile)).toThrow(WorldError);
  });
});

describe("generated worlds", () => {
  const worlds = readdirSync("worlds/generated").filter((f) => f.endsWith(".json") && !f.endsWith(".goals.json") && !f.endsWith(".notes.json"));

  it("finds generated worlds", () => {
    expect(worlds.length).toBeGreaterThan(0);
  });

  for (const file of worlds) {
    it(`${file} declares its prior fit as invented or perturbed`, () => {
      const path = join("worlds/generated", file);
      expect(existsSync(notesPathFor(path)), `missing ${notesPathFor(path)}`).toBe(true);
      expect(["invented", "perturbed"]).toContain(priorFitOf(path));
    });
  }
});
