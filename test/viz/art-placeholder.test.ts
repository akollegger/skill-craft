import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { World } from "../../src/sim/schema.js";
import { artFilePath } from "../../src/viz/art/art-file.js";
import { readLibrary, resolveReference } from "../../src/viz/art/library.js";
import { fromWire, worldArtFor } from "../../src/viz/art/world-art.js";
import { RunCatalog } from "../../src/viz/catalog.js";
import { finishedRun } from "../helpers/finished-run.js";

/** A world whose items carry no meaning: placeholders, as a designer may choose. Only its item list matters to art. */
const placeholders = (ids: string[]): World => ({ items: ids.map((id) => ({ id, description: "x" })) }) as unknown as World;
const dir = mkdtempSync(join(tmpdir(), "skill-craft-ph-"));
let n = 0;
const worldWith = (art: unknown): string => {
  const path = join(dir, `w${n++}.json`);
  if (art !== undefined) writeFileSync(artFilePath(path), typeof art === "string" ? art : JSON.stringify(art));
  return path;
};
const library = readLibrary();
const sprite = (art: ReturnType<typeof worldArtFor>, item: string) => {
  const e = fromWire(art)[item]!;
  if (!("sprite" in e)) throw new Error(`${item} is not drawn`);
  return e.sprite;
};

describe("a world of placeholder names", () => {
  it("shows the letters and symbols its art file names", () => {
    const path = worldWith({ format: 1, items: { A: "letter-a", B: "letter-b", π: "pi" } });
    const art = worldArtFor(placeholders(["A", "B", "π"]), path, ["A", "B", "π"]);
    expect(sprite(art, "A")).toEqual(resolveReference(library, "letter-a"));
    expect(sprite(art, "B")).toEqual(resolveReference(library, "letter-b"));
    expect(sprite(art, "π")).toEqual(resolveReference(library, "pi"));
  });

  it("never interprets a name: an item called `wrench` can show the letter A, and `A` can show another symbol", () => {
    const path = worldWith({ format: 1, items: { wrench: "letter-a", A: "star" } });
    const art = worldArtFor(placeholders(["wrench", "A"]), path, ["wrench", "A"]);
    expect(sprite(art, "wrench")).toEqual(resolveReference(library, "letter-a"));
    expect(sprite(art, "A")).toEqual(resolveReference(library, "star"));
  });

  it("resolves a mix of references, inline rows and omitted items, each as written", () => {
    const rows = Array(16).fill(`..${"f".repeat(12)}..`);
    const path = worldWith({ format: 1, legend: { ".": null, f: "woodFace" }, items: { A: "letter-a", B: rows } });
    const art = worldArtFor(placeholders(["A", "B", "C"]), path, ["A", "B", "C"]);
    expect(sprite(art, "A")).toEqual(resolveReference(library, "letter-a"));
    expect(sprite(art, "B")[0]).toEqual([null, null, ...Array(12).fill("woodFace"), null, null]);
    expect("glyph" in fromWire(art)["C"]!).toBe(true); // omitted: a generated glyph
  });

  it("gives a generated glyph to an item whose reference the library does not have, and still builds", () => {
    const path = worldWith({ format: 1, items: { A: "no-such-sprite", B: "letter-b" } });
    const art = worldArtFor(placeholders(["A", "B"]), path, ["A", "B"]);
    expect("glyph" in fromWire(art)["A"]!).toBe(true);
    expect("sprite" in fromWire(art)["B"]!).toBe(true);
  });

  it("gives every item a generated glyph when the art file is invalid, without any text from the file", () => {
    const path = worldWith("{this is not json SECRET-IN-ART-FILE");
    const art = worldArtFor(placeholders(["A", "B"]), path, ["A", "B"]);
    for (const e of Object.values(fromWire(art))) expect("glyph" in e).toBe(true);
    expect(JSON.stringify(art)).not.toContain("SECRET");
  });

  it("opens the run and reports no error from a bad art file", async () => {
    const { out, world } = await finishedRun();
    writeFileSync(artFilePath(world), "{not json SECRET-IN-ART-FILE");
    const text = JSON.stringify(new RunCatalog(out).scan().catalog);
    expect(text).not.toContain("SECRET");
    expect(text).toContain('"status":"ready"');
  });
});
