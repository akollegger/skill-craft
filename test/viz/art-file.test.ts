import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { artFilePath, readArtFile } from "../../src/viz/art/art-file.js";
import { parseLibrary, type Library } from "../../src/viz/art/library.js";

const row = (c: string) => c.repeat(8);
const library = (() => {
  const r = parseLibrary({
    format: 1,
    legend: { ".": null, f: "woodFace", s: "woodShade" },
    sprites: { stick: Array(8).fill(row("f")), log: Array(8).fill(row("s")) },
    shapes: { pick: Array(8).fill(row("m")) },
    materials: { iron: ["lightGray", "slateFace"] },
  });
  if (!("library" in r)) throw new Error(r.problems.join("; "));
  return r.library as Library;
})();

const dir = mkdtempSync(join(tmpdir(), "skill-craft-art-"));
let n = 0;
const write = (content: unknown): string => {
  const path = join(dir, `w${n++}.art.json`);
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
};
const names = (m: Map<string, readonly (readonly (string | null)[])[]>) => [...m.keys()].sort();

describe("an art file", () => {
  it("sits beside the world file, with .art.json for .json", () => {
    expect(artFilePath("/w/forge.json")).toBe("/w/forge.art.json");
    expect(artFilePath("/w/generated/forge-7.json")).toBe("/w/generated/forge-7.art.json");
  });

  it("maps items to library references and needs no legend for them", () => {
    const got = readArtFile(write({ format: 1, items: { oak_log: "log", iron_pickaxe: "pick/iron" } }), ["oak_log", "iron_pickaxe", "stick"], library);
    expect(names(got)).toEqual(["iron_pickaxe", "oak_log"]);
    expect(got.get("oak_log")![0]![0]).toBe("woodShade");
    expect(got.get("iron_pickaxe")![0]![0]).toBe("lightGray");
  });

  it("draws inline rows through the file's own legend", () => {
    const rows = Array(8).fill(".fffffs.".replace(/./g, (c) => c));
    const got = readArtFile(write({ format: 1, legend: { ".": null, f: "woodFace", s: "woodShade" }, items: { stick: rows } }), ["stick"], library);
    expect(got.get("stick")![0]).toEqual([null, "woodFace", "woodFace", "woodFace", "woodFace", "woodFace", "woodShade", null]);
  });

  it("takes some items from the library and some inline, and leaves the rest out", () => {
    const got = readArtFile(write({ format: 1, legend: { f: "woodFace" }, items: { a: "log", b: Array(8).fill(row("f")) } }), ["a", "b", "c"], library);
    expect(names(got)).toEqual(["a", "b"]);
  });

  it("ignores a file that is not valid JSON or has the wrong format, whole", () => {
    expect(readArtFile(write("{nope"), ["a"], library).size).toBe(0);
    expect(readArtFile(write({ format: 2, items: { a: "log" } }), ["a"], library).size).toBe(0);
    expect(readArtFile(write({ format: 1, items: "no" }), ["a"], library).size).toBe(0);
    expect(readArtFile(join(dir, "missing.art.json"), ["a"], library).size).toBe(0);
  });

  it("drops an entry for an item the world lacks, an unknown reference, or rows of the wrong size, and keeps the rest", () => {
    const art = {
      format: 1,
      legend: { f: "woodFace" },
      items: { ghost: "log", a: "no-such-sprite", b: Array(7).fill(row("f")), c: Array(8).fill("fff"), d: Array(8).fill(row("z")), e: "log" },
    };
    expect(names(readArtFile(write(art), ["a", "b", "c", "d", "e"], library))).toEqual(["e"]);
  });

  it("does not keep any text from the file", () => {
    const got = readArtFile(write({ format: 1, note: "SECRET-NOTE", items: { a: "log" } }), ["a"], library);
    expect(JSON.stringify([...got])).not.toContain("SECRET-NOTE");
  });
});
