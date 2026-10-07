import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exportBundle } from "../../src/harness/export.js";
import { artFilePath } from "../../src/viz/art/art-file.js";
import { RunCatalog } from "../../src/viz/catalog.js";
import { exportFolder } from "../../src/viz/export-folder.js";
import { finishedRun } from "../helpers/finished-run.js";

const DRAW_E = { format: 1, legend: { ".": null, f: "woodFace" }, items: { e: Array(8).fill(".ffffff.") } };
const read = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;

describe("a static export's art", () => {
  it("carries art in the catalog and in every bundle, and names no library entry", async () => {
    const { out, dir, world } = await finishedRun({ runs: 2 });
    writeFileSync(artFilePath(world), JSON.stringify(DRAW_E));
    const dest = join(dir, "site");
    exportFolder(out, dest);
    const catalog = read(join(dest, "catalog.json"));
    expect(Object.keys(catalog.art)).toHaveLength(1);
    for (const e of catalog.runs as { id: string }[]) {
      const manifest = read(join(dest, "bundles", e.id, "bundle.json"));
      expect(manifest.art.items.e.rows).toBeDefined();
    }
    for (const file of ["catalog.json"]) expect(readFileSync(join(dest, file), "utf8")).not.toContain("library");
  });

  it("draws the same sprites once the world, its art file and the library are out of reach", async () => {
    const { out, dir, world } = await finishedRun();
    writeFileSync(artFilePath(world), JSON.stringify(DRAW_E));
    const dest = join(dir, "site");
    exportFolder(out, dest);
    const before = read(join(dest, "catalog.json")).art;
    rmSync(world);
    rmSync(artFilePath(world));
    // The exported bundles are a folder of their own: scanning it needs nothing but their files.
    const scanned = new RunCatalog(join(dest, "bundles")).scan().catalog;
    expect(scanned.runs.every((e) => e.status === "ready")).toBe(true);
    expect(scanned.art).toEqual(before);
  });

  it("does not change when the art file is edited after the export", async () => {
    const { out, dir, world } = await finishedRun();
    writeFileSync(artFilePath(world), JSON.stringify(DRAW_E));
    const dest = join(dir, "site");
    exportFolder(out, dest);
    const exported = readFileSync(join(dest, "catalog.json"), "utf8");
    writeFileSync(artFilePath(world), JSON.stringify({ format: 1, legend: { f: "baltic" }, items: { e: Array(8).fill("ffffffff") } }));
    expect(readFileSync(join(dest, "catalog.json"), "utf8")).toBe(exported);
  });
});

describe("a folder of bundles and the catalog's art", () => {
  it("takes a bundle's own art into its world's entry", async () => {
    const { runDir, dir, world } = await finishedRun();
    writeFileSync(artFilePath(world), JSON.stringify(DRAW_E));
    const root = join(dir, "shared");
    exportBundle(runDir, join(root, "one"));
    rmSync(world);
    rmSync(artFilePath(world));
    const { catalog } = new RunCatalog(root).scan();
    expect(catalog.runs[0]!.status).toBe("ready");
    expect(Object.values(catalog.art!)[0]!.items["e"]).toHaveProperty("rows");
  });

  it("lists a bundle with no art and opens it, with nothing in the catalog for it", async () => {
    const { runDir, dir } = await finishedRun();
    const root = join(dir, "shared");
    exportBundle(runDir, join(root, "old"));
    const path = join(root, "old", "bundle.json");
    const manifest = read(path);
    delete manifest["art"];
    writeFileSync(path, JSON.stringify(manifest));
    const { catalog, file } = new RunCatalog(root).scan();
    expect(catalog.runs[0]!.status).toBe("ready");
    expect(catalog.art).toBeUndefined();
    expect(file(catalog.runs[0]!.id, "bundle.json")).toBeDefined();
  });

  it("calls a bundle with a malformed art object invalid, and lists it with the fixed reason", async () => {
    const { runDir, dir } = await finishedRun();
    const root = join(dir, "shared");
    mkdirSync(root, { recursive: true });
    exportBundle(runDir, join(root, "bad"));
    const path = join(root, "bad", "bundle.json");
    const manifest = read(path);
    manifest["art"] = { legend: {}, items: { e: { rows: ["x"] } } };
    writeFileSync(path, JSON.stringify(manifest));
    const { catalog } = new RunCatalog(root).scan();
    expect(catalog.runs[0]!.status).toBe("unreadable");
    expect(catalog.runs[0]!.reason).toMatch(/^BundleInvalid: /);
    expect(catalog.art).toBeUndefined();
  });
});
