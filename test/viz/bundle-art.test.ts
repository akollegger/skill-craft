import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readBundle } from "../../src/harness/bundle.js";
import { buildBundle, exportBundle } from "../../src/harness/export.js";
import { artFilePath } from "../../src/viz/art/art-file.js";
import { bundleProblem } from "../../src/viz/contract.js";
import { DESCRIPTIONS, finishedRun, WORLD_FILE_NAME } from "../helpers/finished-run.js";

const used = (b: ReturnType<typeof buildBundle>): string[] => {
  const s = new Set<string>([b.manifest.goal.item]);
  for (const f of b.frames) {
    for (const row of f.grid) for (const c of row) if (c) s.add(c);
    for (const h of Object.keys(f.held)) s.add(h);
    if (f.crafted) s.add(f.crafted.item);
    if (f.craftable) s.add(f.craftable);
  }
  return [...s].sort();
};

describe("a bundle's art", () => {
  it("covers exactly the items its frames and goal use, and no other item of the world", async () => {
    const { runDir } = await finishedRun();
    const b = buildBundle(runDir);
    expect(b.manifest.art).toBeDefined();
    expect(Object.keys(b.manifest.art!.items).sort()).toEqual(used(b));
    expect(Object.keys(b.manifest.art!.items)).not.toContain("s"); // the world has an item the run never touches
  });

  it("gives generated glyphs to a world with no art file", async () => {
    const { runDir } = await finishedRun();
    for (const e of Object.values(buildBundle(runDir).manifest.art!.items)) expect("family" in e).toBe(true);
  });

  it("draws an item the art file draws, and gives glyphs to the rest", async () => {
    const { runDir, world } = await finishedRun();
    writeFileSync(artFilePath(world), JSON.stringify({ format: 1, legend: { ".": null, f: "woodFace" }, items: { e: Array(16).fill(`.${"f".repeat(14)}.`) } }));
    const art = buildBundle(runDir).manifest.art!;
    expect("rows" in art.items["e"]!).toBe(true);
    expect(art.legend).toEqual({ ".": null, a: "woodFace" });
    const others = Object.entries(art.items).filter(([k]) => k !== "e");
    expect(others.length).toBeGreaterThan(0);
    for (const [, e] of others) expect("family" in e).toBe(true);
  });

  it("names no file, library entry, description or recipe", async () => {
    const { runDir, world } = await finishedRun();
    writeFileSync(artFilePath(world), JSON.stringify({ format: 1, note: "NOTE-FROM-ART-FILE", items: { e: "no-such-sprite" } }));
    const text = JSON.stringify(buildBundle(runDir).manifest);
    expect(text).not.toContain(WORLD_FILE_NAME);
    expect(text).not.toContain("NOTE-FROM-ART-FILE");
    expect(text).not.toContain("no-such-sprite");
    expect(text).not.toContain("library");
    for (const d of Object.values(DESCRIPTIONS)) expect(text).not.toContain(d);
  });

  it("is written by the export exactly as the visualizer builds it", async () => {
    const { runDir, dest } = await finishedRun();
    const built = buildBundle(runDir);
    exportBundle(runDir, dest);
    expect(readBundle(dest).manifest).toEqual(built.manifest);
    expect(readFileSync(join(dest, "bundle.json"), "utf8")).toContain('"art"');
  });

  it("is the same for the same run every time", async () => {
    const { runDir } = await finishedRun();
    expect(JSON.stringify(buildBundle(runDir).manifest.art)).toBe(JSON.stringify(buildBundle(runDir).manifest.art));
  });

  it("is optional: a bundle made before item art still reads and still passes the bundle check", async () => {
    const { runDir, dest } = await finishedRun();
    exportBundle(runDir, dest);
    const manifest = JSON.parse(readFileSync(join(dest, "bundle.json"), "utf8")) as Record<string, unknown>;
    delete manifest["art"];
    writeFileSync(join(dest, "bundle.json"), JSON.stringify(manifest));
    const b = readBundle(dest);
    expect(b.manifest.art).toBeUndefined();
    expect(bundleProblem(b)).toBeUndefined();
  });

  it("makes a malformed art object a malformed bundle", async () => {
    const { runDir, dest } = await finishedRun();
    exportBundle(runDir, dest);
    const manifest = JSON.parse(readFileSync(join(dest, "bundle.json"), "utf8")) as Record<string, unknown>;
    manifest["art"] = { legend: {}, items: { e: { rows: ["x"] } } };
    writeFileSync(join(dest, "bundle.json"), JSON.stringify(manifest));
    expect(bundleProblem(readBundle(dest))).toBeDefined();
  });
});
