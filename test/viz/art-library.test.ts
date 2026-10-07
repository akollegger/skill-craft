import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allReferences, EMPTY_LIBRARY, libraryPath, parseLibrary, readLibrary, resolveReference, type Library } from "../../src/viz/art/library.js";

/** The palette's names, read from the page's file as text so a Node test needs nothing from the page's project. */
const paletteNames = (): Set<string> => {
  const source = readFileSync(new URL("../../viz/src/palette.ts", import.meta.url), "utf8");
  const block = source.slice(source.indexOf("export const palette = {"), source.indexOf("} as const;"));
  return new Set([...block.matchAll(/^\s+(\w+): "#[0-9A-Fa-f]{6}"/gm)].map((m) => m[1]!));
};

const row = (c: string) => c.repeat(8);
const small = {
  format: 1,
  legend: { ".": null, f: "woodFace", s: "woodShade" },
  sprites: { stick: [row("."), row("f"), row("."), row("s"), row("."), row("f"), row("."), row("s")] },
  shapes: { pick: [row("."), row("m"), row("M"), row("."), row("m"), row("M"), row("."), row("f")] },
  materials: { wooden: ["woodFace", "woodShade"], iron: ["lightGray", "slateFace"] },
};
const parsed = (json: unknown): Library => {
  const r = parseLibrary(json);
  if (!("library" in r)) throw new Error(r.problems.join("; "));
  return r.library;
};

describe("the committed library", () => {
  const raw = JSON.parse(readFileSync(libraryPath(), "utf8")) as unknown;
  const result = parseLibrary(raw);

  it("has no problems", () => {
    expect("problems" in result ? result.problems : []).toEqual([]);
  });

  it("colors every pixel from a palette name or leaves it transparent", () => {
    const names = paletteNames();
    expect(names.size).toBeGreaterThan(20);
    const lib = parsed(raw);
    for (const [ch, v] of Object.entries(lib.legend)) if (v !== null) expect(names.has(v), `legend ${ch}: ${v}`).toBe(true);
    for (const [name, [body, shade]] of Object.entries(lib.materials)) {
      expect(names.has(body), `${name} body`).toBe(true);
      expect(names.has(shade), `${name} shade`).toBe(true);
    }
  });

  it("reserves m and M for materials", () => {
    expect(Object.keys(parsed(raw).legend)).not.toContain("m");
    expect(Object.keys(parsed(raw).legend)).not.toContain("M");
  });

  it("names every entry in lowercase kebab-case, once", () => {
    const lib = parsed(raw);
    const names = [...Object.keys(lib.sprites), ...Object.keys(lib.shapes)];
    for (const n of names) expect(n, n).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(new Set(names).size).toBe(names.length);
  });

  it("resolves every reference to an 8 by 8 sprite, and no two share a pixel pattern", () => {
    const lib = parsed(raw);
    const refs = allReferences(lib);
    expect(refs.length).toBeGreaterThan(0);
    const seen = new Map<string, string>();
    for (const ref of refs) {
      const s = resolveReference(lib, ref);
      expect(s, ref).toBeDefined();
      expect(s!).toHaveLength(8);
      for (const r of s!) expect(r).toHaveLength(8);
      const key = JSON.stringify(s);
      expect(seen.get(key), `${ref} repeats ${seen.get(key)}`).toBeUndefined();
      seen.set(key, ref);
    }
  });
});

/** Batch 1 of the starter set (ADR-005 2.6): every name must resolve, so a missing drawing fails here. */
const BATCH_1: Record<string, string[]> = {
  faithful: ["log", "cobblestone", "ingot", "planks", "stick", "crafting-table", "slab", "pickaxe/wooden", "pickaxe/stone", "pickaxe/iron", "sword/wooden", "sword/stone", "sword/iron"],
  tools: ["hammer/wooden", "hammer/stone", "hammer/iron", "axe/wooden", "axe/stone", "axe/iron", "shovel/wooden", "shovel/stone", "shovel/iron", "hoe/wooden", "hoe/stone", "hoe/iron", "saw", "wrench", "screwdriver", "pliers", "scissors", "knife", "paintbrush", "ruler", "ladder", "toolbox", "nut-and-bolt", "gear"],
  containers: ["box", "crate", "barrel", "chest", "bag", "bottle", "jar", "bowl", "cup", "bucket", "rope", "cloth", "paper", "scroll", "book", "coin", "gem", "crystal", "leaf", "flame"],
  food: ["wheat", "egg", "milk", "butter", "cheese", "salt", "sugar", "tomato", "bell-pepper", "chili-pepper", "steak", "chicken-leg", "bacon", "fish", "flour", "dough", "bread", "pizza", "omelet", "pancake", "cake", "cookie", "soup"],
  symbols: [
    ...Array.from({ length: 26 }, (_, i) => `letter-${String.fromCharCode(97 + i)}`),
    ...Array.from({ length: 10 }, (_, i) => `digit-${i}`),
    "pi", "sigma", "delta", "lambda", "omega", "circle", "square", "triangle", "diamond", "star", "cross",
  ],
};

describe("batch 1 of the starter set", () => {
  const lib = parsed(JSON.parse(readFileSync(libraryPath(), "utf8")));
  for (const [group, names] of Object.entries(BATCH_1)) {
    it(`has every ${group} sprite`, () => {
      for (const ref of names) expect(resolveReference(lib, ref), ref).toBeDefined();
    });
  }

  it("holds 115 drawings: nine faithful, sixteen tools, twenty containers and materials, twenty-three foods and forty-seven symbols", () => {
    expect(Object.keys(lib.sprites).length + Object.keys(lib.shapes).length).toBe(115);
  });
});

describe("parsing a library", () => {
  it("accepts a small valid one", () => {
    expect("library" in parseLibrary(small)).toBe(true);
  });

  it("reports a legend that uses the reserved characters", () => {
    const r = parseLibrary({ ...small, legend: { ...small.legend, m: "woodFace" } });
    expect("problems" in r && r.problems.join(" ")).toMatch(/reserved/);
  });

  it("reports a row of the wrong size, a row character the legend lacks, and a shape character that is neither", () => {
    const bad = (sprites: unknown) => parseLibrary({ ...small, sprites });
    expect("problems" in bad({ x: [row("f")] })).toBe(true);
    expect("problems" in bad({ x: Array(8).fill("fffffff") })).toBe(true);
    expect("problems" in bad({ x: Array(8).fill(row("z")) })).toBe(true);
    expect("problems" in bad({ x: Array(8).fill(row("m")) })).toBe(true); // m is for shapes only
  });

  it("reports a name that is not kebab-case or is used twice", () => {
    expect("problems" in parseLibrary({ ...small, sprites: { "Bad Name": small.sprites.stick } })).toBe(true);
    expect("problems" in parseLibrary({ ...small, shapes: { stick: small.shapes.pick } })).toBe(true);
  });

  it("reports an unknown format", () => {
    expect("problems" in parseLibrary({ ...small, format: 2 })).toBe(true);
  });
});

describe("resolving a reference", () => {
  const lib = parsed(small);

  it("turns a sprite name into rows of palette names", () => {
    const s = resolveReference(lib, "stick")!;
    expect(s[0]!.every((c) => c === null)).toBe(true);
    expect(s[1]!.every((c) => c === "woodFace")).toBe(true);
    expect(s[3]!.every((c) => c === "woodShade")).toBe(true);
  });

  it("applies a material's two colors to a shape's m and M", () => {
    const wooden = resolveReference(lib, "pick/wooden")!;
    const iron = resolveReference(lib, "pick/iron")!;
    expect(wooden[1]![0]).toBe("woodFace");
    expect(wooden[2]![0]).toBe("woodShade");
    expect(iron[1]![0]).toBe("lightGray");
    expect(iron[2]![0]).toBe("slateFace");
    expect(wooden[7]).toEqual(iron[7]); // the shape's fixed color is the same in every material
    expect(wooden[1]).not.toEqual(iron[1]);
  });

  it("gives nothing for an unknown name, an unknown material, a shape without a material, or a sprite with one", () => {
    for (const ref of ["nope", "pick/gold", "pick", "stick/wooden", "pick/", "/wooden", ""]) expect(resolveReference(lib, ref), ref).toBeUndefined();
  });

  it("lists a reference for each sprite and for each shape in each material", () => {
    expect(allReferences(lib).sort()).toEqual(["pick/iron", "pick/wooden", "stick"]);
  });
});

describe("reading a library file", () => {
  const dir = mkdtempSync(join(tmpdir(), "skill-craft-lib-"));
  const at = (name: string, text: string) => {
    const p = join(dir, name);
    writeFileSync(p, text);
    return p;
  };

  it("reads a valid file", () => {
    expect(Object.keys(readLibrary(at("ok.json", JSON.stringify(small))).sprites)).toEqual(["stick"]);
  });

  it("treats a missing, unparseable or invalid file as empty, without throwing", () => {
    expect(readLibrary(join(dir, "missing.json"))).toEqual(EMPTY_LIBRARY);
    expect(readLibrary(at("junk.json", "{not json"))).toEqual(EMPTY_LIBRARY);
    expect(readLibrary(at("bad.json", JSON.stringify({ ...small, format: 9 })))).toEqual(EMPTY_LIBRARY);
  });
});
