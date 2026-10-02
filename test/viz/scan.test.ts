import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exportBundle } from "../../src/harness/export.js";
import { scanFolder } from "../../src/viz/scan.js";
import { finishedRun } from "../helpers/finished-run.js";

const rels = (root: string) => scanFolder(root).map((f) => `${f.kind}:${f.rel}`);

/** Two experiments of two runs each under one scratch folder; returns the collection folder. */
async function collection() {
  const first = await finishedRun({ label: "alpha", runs: 2 });
  await finishedRun({ dir: first.dir, world: first.world, label: "beta", runs: 2 });
  return { ...first, collection: first.out };
}

describe("scanFolder", () => {
  it("finds the runs of a collection of experiments", async () => {
    const { collection: root } = await collection();
    expect(rels(root)).toEqual(["run:alpha/001", "run:alpha/002", "run:beta/001", "run:beta/002"]);
  });

  it("finds the runs of one experiment", async () => {
    const { collection: root } = await collection();
    expect(rels(join(root, "alpha"))).toEqual(["run:001", "run:002"]);
  });

  it("finds a single run, whose own folder is the root", async () => {
    const { collection: root } = await collection();
    expect(rels(join(root, "alpha", "001"))).toEqual(["run:."]);
  });

  it("finds exported bundles beside runs", async () => {
    const { collection: root, runDir } = await collection();
    exportBundle(runDir, join(root, "shared", "one"));
    expect(rels(root)).toEqual(["run:alpha/001", "run:alpha/002", "run:beta/001", "run:beta/002", "bundle:shared/one"]);
  });

  it("finds a folder of bundles with no runs", async () => {
    const { runDir, dir } = await finishedRun();
    const root = join(dir, "only-bundles");
    exportBundle(runDir, join(root, "a"));
    exportBundle(runDir, join(root, "b"));
    expect(rels(root)).toEqual(["bundle:a", "bundle:b"]);
  });

  it("lists a run with no score.json, which is unfinished, as a run", async () => {
    const { collection: root } = await collection();
    rmSync(join(root, "alpha", "002", "score.json"));
    expect(rels(root)).toContain("run:alpha/002");
  });

  it("does not descend into a run or look inside a bundle for more", async () => {
    const { collection: root, runDir } = await collection();
    mkdirSync(join(runDir, "nested"), { recursive: true });
    writeFileSync(join(runDir, "nested", "run.jsonl"), "");
    expect(rels(root)).toEqual(["run:alpha/001", "run:alpha/002", "run:beta/001", "run:beta/002"]);
  });

  it("does not follow symbolic links", async () => {
    const { collection: root, dir } = await collection();
    symlinkSync(join(root, "alpha"), join(root, "linked"));
    symlinkSync(join(root, "beta", "001"), join(root, "linked-run"));
    expect(rels(root)).toEqual(["run:alpha/001", "run:alpha/002", "run:beta/001", "run:beta/002"]);
    expect(dir).toBeTruthy();
  });

  it("skips a bundle still being written", async () => {
    const { runDir, dir } = await finishedRun();
    const root = join(dir, "b");
    exportBundle(runDir, join(root, "done"));
    mkdirSync(join(root, "half.tmp-123"), { recursive: true });
    writeFileSync(join(root, "half.tmp-123", "bundle.json"), "{}");
    expect(rels(root)).toEqual(["bundle:done"]);
  });

  it("gives nothing for an empty folder, and for one with unrelated files", () => {
    const root = mkdtempSync(join(tmpdir(), "skill-craft-scan-"));
    expect(scanFolder(root)).toEqual([]);
    writeFileSync(join(root, "notes.txt"), "x");
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "sub", "a.json"), "{}");
    expect(scanFolder(root)).toEqual([]);
  });

  it("returns the same order each time, by relative path", async () => {
    const { collection: root } = await collection();
    const found = scanFolder(root);
    expect(scanFolder(root)).toEqual(found);
    const paths = found.map((f) => f.rel);
    expect(paths).toEqual([...paths].sort());
  });
});
