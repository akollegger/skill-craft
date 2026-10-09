import { readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildBundle, exportBundle } from "../../src/harness/export.js";
import { artFilePath } from "../../src/viz/art/art-file.js";
import { libraryPath } from "../../src/viz/art/library.js";
import { RunCatalog } from "../../src/viz/catalog.js";
import { finishedRun } from "../helpers/finished-run.js";

const DRAW_E = { format: 1, legend: { ".": null, f: "woodFace" }, items: { e: Array(16).fill(`.${"f".repeat(14)}.`) } };
const touch = (path: string, ms: number) => utimesSync(path, new Date(ms), new Date(ms));

describe("the catalog's art", () => {
  it("is keyed by the world's name and holds the items of its ready runs", async () => {
    const { out, runDir } = await finishedRun({ runs: 2 });
    const { catalog } = new RunCatalog(out).scan();
    const world = String(catalog.runs[0]!.attributes["world"]);
    expect(Object.keys(catalog.art ?? {})).toEqual([world]);
    expect(Object.keys(catalog.art![world]!.items).sort()).toEqual(Object.keys(buildBundle(runDir).manifest.art!.items).sort());
  });

  it("gives a goal item the same sprite as the same run's bundle, so a thumbnail matches the table", async () => {
    const { out, runDir } = await finishedRun();
    const { catalog } = new RunCatalog(out).scan();
    const manifest = buildBundle(runDir).manifest;
    expect(catalog.art![manifest.world.name]!.items[manifest.goal.item]).toEqual(manifest.art!.items[manifest.goal.item]);
  });

  it("is left out when no ready run has art", async () => {
    const { out, runDir } = await finishedRun();
    writeFileSync(join(runDir, "score.json"), "{}"); // a score with no result in it: the run cannot be opened
    const { catalog } = new RunCatalog(out).scan();
    expect(catalog.runs.every((e) => e.status !== "ready")).toBe(true);
    expect(catalog.art).toBeUndefined();
  });

  it("names no item that no run of the world used", async () => {
    const { out } = await finishedRun({ runs: 2 });
    const { catalog } = new RunCatalog(out).scan();
    for (const art of Object.values(catalog.art!)) expect(Object.keys(art.items)).not.toContain("s");
  });

  it("takes an item from the run first in catalog order where runs disagree", async () => {
    const { out, runDir, world } = await finishedRun();
    const dest = join(out, "shared", "earlier");
    exportBundle(runDir, dest); // its manifest has `e` as a glyph
    const manifest = JSON.parse(readFileSync(join(dest, "bundle.json"), "utf8")) as { label: string };
    manifest.label = "aaa / 001"; // sorts before the run itself
    writeFileSync(join(dest, "bundle.json"), JSON.stringify(manifest));
    writeFileSync(artFilePath(world), JSON.stringify(DRAW_E)); // the run itself now draws `e`
    const { catalog } = new RunCatalog(out).scan();
    const worldName = buildBundle(runDir).manifest.world.name;
    expect("family" in catalog.art![worldName]!.items["e"]!).toBe(true);
  });

  it("rebuilds a run when its art file, the library file or its world file changes", async () => {
    const { out, world } = await finishedRun();
    const cat = new RunCatalog(out);
    cat.scan();
    expect(cat.builds).toBe(1);
    cat.scan();
    expect(cat.builds).toBe(1); // nothing changed
    writeFileSync(artFilePath(world), JSON.stringify(DRAW_E));
    cat.scan();
    expect(cat.builds).toBe(2);
    touch(artFilePath(world), Date.now() + 5000);
    cat.scan();
    expect(cat.builds).toBe(3);
    touch(libraryPath(), Date.now() + 10000);
    cat.scan();
    expect(cat.builds).toBe(4);
    touch(world, Date.now() + 15000);
    cat.scan();
    expect(cat.builds).toBe(5);
  });
});
