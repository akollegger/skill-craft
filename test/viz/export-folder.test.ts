import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLE_FILES, exportBundle } from "../../src/harness/export.js";
import { RunCatalog } from "../../src/viz/catalog.js";
import { VizRefused } from "../../src/viz/errors.js";
import { exportFolder } from "../../src/viz/export-folder.js";
import { finishedRun } from "../helpers/finished-run.js";

/** Every file under a folder, relative path to text. */
function tree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rel of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (rel.isFile()) out[join(rel.parentPath.slice(root.length + 1), rel.name)] = readFileSync(join(rel.parentPath, rel.name), "utf8");
  }
  return out;
}

async function source() {
  const f = await finishedRun({ label: "alpha", runs: 2 });
  await finishedRun({ dir: f.dir, world: f.world, label: "beta" });
  return { ...f, root: f.out, dest: join(f.dir, "site") };
}

describe("exportFolder", () => {
  it("writes catalog.json and four files for every run that can be opened", async () => {
    const { root, dest } = await source();
    const r = exportFolder(root, dest);
    const catalog = JSON.parse(readFileSync(join(dest, "catalog.json"), "utf8")) as { runs: { id: string; status: string; bundle: string }[] };
    expect(catalog.runs).toHaveLength(3);
    expect(r.exported).toBe(3);
    for (const e of catalog.runs) {
      expect(readdirSync(join(dest, "bundles", e.id)).sort()).toEqual([...BUNDLE_FILES].sort());
      expect(e.bundle).toBe(`bundles/${e.id}/`);
    }
    expect(readdirSync(dest).sort()).toEqual(["bundles", "catalog.json"]);
  });

  it("writes exactly what the local supplier serves", async () => {
    const { root, dest } = await source();
    exportFolder(root, dest);
    const snap = new RunCatalog(root).scan();
    expect(readFileSync(join(dest, "catalog.json"), "utf8")).toBe(`${JSON.stringify(snap.catalog, null, 2)}\n`);
    for (const e of snap.catalog.runs) for (const name of BUNDLE_FILES) expect(readFileSync(join(dest, "bundles", e.id, name), "utf8"), `${e.id}/${name}`).toBe(snap.file(e.id, name));
  });

  it("keeps runs that cannot be opened in the catalog with their reason, and gives them no bundle", async () => {
    const { root, dest, runDir } = await source();
    rmSync(join(runDir, "score.json")); // alpha/001 becomes unfinished
    const r = exportFolder(root, dest);
    expect(r.exported).toBe(2);
    expect(r.skipped).toEqual([{ label: "alpha", run: "001", reason: expect.stringMatching(/^Unfinished: /) }]);
    const catalog = JSON.parse(readFileSync(join(dest, "catalog.json"), "utf8")) as { runs: { id: string; status: string; reason?: string; bundle?: string }[] };
    const skipped = catalog.runs.find((e) => e.status === "unfinished")!;
    expect(skipped.bundle).toBeUndefined();
    expect(existsSync(join(dest, "bundles", skipped.id))).toBe(false);
  });

  it("exports an exported bundle as it is, including a missing trace as an empty file", async () => {
    const f = await finishedRun({ label: "alpha" });
    const bundles = join(f.dir, "only-bundles");
    exportBundle(f.runDir, join(bundles, "one"));
    rmSync(join(bundles, "one", "trace.jsonl"));
    const dest = join(f.dir, "site");
    exportFolder(bundles, dest);
    const id = (JSON.parse(readFileSync(join(dest, "catalog.json"), "utf8")) as { runs: { id: string }[] }).runs[0]!.id;
    expect(readFileSync(join(dest, "bundles", id, "trace.jsonl"), "utf8")).toBe("");
    expect(readFileSync(join(dest, "bundles", id, "frames.jsonl"), "utf8")).toBe(readFileSync(join(bundles, "one", "frames.jsonl"), "utf8"));
  });

  it("leaves the source folder exactly as it was", async () => {
    const { root, dest } = await source();
    const before = tree(root);
    exportFolder(root, dest);
    expect(tree(root)).toEqual(before);
  });

  it("refuses a destination that exists, and does not touch it", async () => {
    const { root, dest } = await source();
    mkdirSync(dest);
    writeFileSync(join(dest, "keep.txt"), "mine");
    expect(() => exportFolder(root, dest)).toThrow(VizRefused);
    expect(() => exportFolder(root, dest)).toThrow(/already exists/);
    expect(readFileSync(join(dest, "keep.txt"), "utf8")).toBe("mine");
  });

  it("refuses a destination inside the folder it reads, and a source that is not a folder", async () => {
    const { root } = await source();
    expect(() => exportFolder(root, join(root, "site"))).toThrow(/inside/);
    expect(() => exportFolder(root, join(root, "..site"))).toThrow(/inside/); // a name that only starts with two dots is still inside
    expect(() => exportFolder(join(tmpdir(), "no-such-folder-xyz"), join(tmpdir(), "x-out"))).toThrow(/does not exist/);
  });

  it("builds in a temporary sibling and leaves nothing behind when it fails", async () => {
    const { root, dest, dir } = await source();
    const page = join(dir, "no-such-page");
    expect(() => exportFolder(root, dest, { pageDir: page })).toThrow(VizRefused);
    expect(existsSync(dest)).toBe(false);
    expect(readdirSync(dir).filter((n) => n.startsWith("site"))).toEqual([]);
  });

  it("copies the built page beside the data when asked", async () => {
    const { root, dest, dir } = await source();
    const page = mkdtempSync(join(tmpdir(), "skill-craft-page-"));
    mkdirSync(join(page, "assets"));
    writeFileSync(join(page, "index.html"), "<title>p</title>");
    writeFileSync(join(page, "assets", "app.js"), "export {};");
    exportFolder(root, dest, { pageDir: page });
    expect(readFileSync(join(dest, "index.html"), "utf8")).toBe("<title>p</title>");
    expect(existsSync(join(dest, "assets", "app.js"))).toBe(true);
    expect(existsSync(join(dest, "catalog.json"))).toBe(true);
    expect(dir).toBeTruthy();
  });

  it("exports a folder with no runs as an empty catalog", () => {
    const empty = mkdtempSync(join(tmpdir(), "skill-craft-empty-"));
    const dest = join(mkdtempSync(join(tmpdir(), "skill-craft-out-")), "site");
    const r = exportFolder(empty, dest);
    expect(r).toMatchObject({ exported: 0, skipped: [] });
    expect(JSON.parse(readFileSync(join(dest, "catalog.json"), "utf8"))).toEqual({ format: 1, runs: [] });
  });
});
