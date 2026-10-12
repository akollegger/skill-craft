import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allReferences, readLibrary } from "../../src/viz/art/library.js";

const credits = readFileSync(new URL("../../src/viz/art/CREDITS.md", import.meta.url), "utf8");
/** The first cell of each row of the credits table. */
const credited = (): string[] =>
  credits
    .split("\n")
    .filter((l) => l.startsWith("|") && !/^\|\s*(Sprite|-+)/.test(l))
    .map((l) => l.split("|")[1]!.trim())
    .filter((c) => c !== "");

describe("the sprite credits", () => {
  it("names only sprites the library has", () => {
    const refs = new Set(allReferences(readLibrary()));
    const shapes = new Set(Object.keys(readLibrary().shapes));
    for (const name of credited()) expect(refs.has(name) || shapes.has(name), name).toBe(true);
  });

  it("gives each credited sprite once, with a source, a licence and a modification", () => {
    const rows = credits.split("\n").filter((l) => l.startsWith("|") && !/^\|\s*(Sprite|-+)/.test(l));
    const names = rows.map((l) => l.split("|")[1]!.trim());
    expect(new Set(names).size).toBe(names.length);
    for (const row of rows) for (const cell of row.split("|").slice(1, 5)) expect(cell.trim(), row).not.toBe("");
  });

  it("carries the attribution for Noto Emoji", () => {
    expect(credits).toContain("Apache License 2.0");
    expect(credits).toContain("googlefonts/noto-emoji");
  });
});
