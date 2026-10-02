import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLE_FILES, exportBundle } from "../../src/harness/export.js";
import { parseCatalog } from "../../src/viz/contract.js";
import { entryId, RunCatalog } from "../../src/viz/catalog.js";
import { DESCRIPTIONS, finishedRun, stampScore, WORLD_FILE_NAME } from "../helpers/finished-run.js";

async function folder() {
  const first = await finishedRun({ label: "alpha", runs: 2 });
  await finishedRun({ dir: first.dir, world: first.world, label: "beta", runs: 1 });
  return { ...first, root: first.out };
}

const byRel = (cat: RunCatalog, rel: string, kind: "run" | "bundle" = "run") => {
  const snap = cat.scan();
  return { snap, entry: snap.catalog.runs.find((e) => e.id === entryId(kind, rel))! };
};

describe("RunCatalog", () => {
  it("lists every run with attributes, a preview and a bundle address, and validates against the contract", async () => {
    const { root } = await folder();
    const { catalog } = new RunCatalog(root).scan();
    expect(parseCatalog(JSON.parse(JSON.stringify(catalog))).ok).toBe(true);
    expect(catalog.runs).toHaveLength(3);
    for (const e of catalog.runs) {
      expect(e.status).toBe("ready");
      expect(e.bundle).toBe(`bundles/${e.id}/`);
      expect(e.preview?.strip).toMatch(/^[pcrt.]*$/);
    }
    expect(catalog.runs.map((e) => `${e.attributes["label"]}/${e.attributes["run"]}`)).toEqual(["alpha/001", "alpha/002", "beta/001"]);
  });

  it("gives the same ids and the same bytes on every scan, with no timestamp and no path", async () => {
    const { root, dir } = await folder();
    const a = JSON.stringify(new RunCatalog(root).scan().catalog);
    const b = JSON.stringify(new RunCatalog(root).scan().catalog);
    expect(b).toBe(a);
    expect(a).not.toContain(dir);
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(a).not.toContain(WORLD_FILE_NAME);
  });

  it("gives a run and a bundle of that run different ids", async () => {
    const { root, runDir } = await folder();
    exportBundle(runDir, join(root, "shared", "one"));
    const { catalog } = new RunCatalog(root).scan();
    const ids = catalog.runs.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(catalog.runs.filter((e) => e.kind === "bundle")).toHaveLength(1);
    const run = catalog.runs.find((e) => e.kind === "run" && e.attributes["label"] === "alpha" && e.attributes["run"] === "001")!;
    const bundle = catalog.runs.find((e) => e.kind === "bundle")!;
    expect(bundle.attributes).toEqual(run.attributes);
    expect(bundle.preview).toEqual(run.preview);
  });

  it("serves a run's bundle files as exactly what the export writes", async () => {
    const { root, runDir, dest } = await folder();
    exportBundle(runDir, dest);
    const { snap, entry } = byRel(new RunCatalog(root), "alpha/001");
    for (const name of BUNDLE_FILES) expect(snap.file(entry.id, name), name).toBe(readFileSync(join(dest, name), "utf8"));
  });

  it("serves a bundle folder's files as they are, and an empty trace when the file is absent", async () => {
    const { root, runDir } = await folder();
    const dest = join(root, "shared", "one");
    exportBundle(runDir, dest);
    rmSync(join(dest, "trace.jsonl"));
    const { snap, entry } = byRel(new RunCatalog(root), "shared/one", "bundle");
    expect(entry.status).toBe("ready");
    expect(snap.file(entry.id, "frames.jsonl")).toBe(readFileSync(join(dest, "frames.jsonl"), "utf8"));
    expect(snap.file(entry.id, "trace.jsonl")).toBe("");
  });

  it("has no file for an unknown id, an unknown name or an entry that is not ready", async () => {
    const { root, runDir } = await folder();
    rmSync(join(runDir, "score.json"));
    const { snap, catalog } = (() => { const s = new RunCatalog(root).scan(); return { snap: s, catalog: s.catalog }; })();
    const ready = catalog.runs.find((e) => e.status === "ready")!;
    const notReady = catalog.runs.find((e) => e.status !== "ready")!;
    expect(snap.file("0000000000000000", "bundle.json")).toBeUndefined();
    expect(snap.file(ready.id, "run.jsonl")).toBeUndefined();
    expect(snap.file(ready.id, "../mcp.json")).toBeUndefined();
    expect(snap.file(notReady.id, "bundle.json")).toBeUndefined();
  });

  it("lists a run that cannot be opened with a coded reason of fixed text", async () => {
    const { root, runDir } = await folder();
    // unfinished
    rmSync(join(runDir, "score.json"));
    // does not replay
    const third = join(root, "alpha", "002", "run.jsonl");
    writeFileSync(third, readFileSync(third, "utf8").replace('"ok":true', '"ok":false'));
    // corrupt record
    const beta = join(root, "beta", "001");
    writeFileSync(join(beta, "score.json"), "not json at all");
    const { catalog } = new RunCatalog(root).scan();
    const reason = (label: string, run: string) => catalog.runs.find((e) => e.attributes["label"] === label && e.attributes["run"] === run);
    expect(reason("alpha", "001")).toMatchObject({ status: "unfinished", reason: expect.stringMatching(/^Unfinished: /) });
    expect(reason("alpha", "002")).toMatchObject({ status: "unreadable", reason: expect.stringMatching(/^ReplayFailed: /) });
    expect(reason("beta", "001")).toMatchObject({ status: "unreadable", reason: expect.stringMatching(/^RunInvalid: /) });
    expect(parseCatalog(JSON.parse(JSON.stringify(catalog))).ok).toBe(true);
    const text = JSON.stringify(catalog);
    expect(text).not.toContain(root);
    expect(text).not.toContain("not json");
    expect(text).not.toMatch(/entry \d+/);
    for (const e of catalog.runs.filter((x) => x.status !== "ready")) expect(e.bundle).toBeUndefined();
  });

  it("lists a run whose world file is gone as unreadable with WorldMissing", async () => {
    const f = await finishedRun({ label: "lost" });
    rmSync(f.world);
    const { catalog } = new RunCatalog(f.out).scan();
    expect(catalog.runs[0]).toMatchObject({ status: "unreadable", reason: expect.stringMatching(/^WorldMissing: /), attributes: { label: "lost", run: "001", goalItem: "e", outcome: "reached" } });
  });

  it("lists a corrupt bundle and a bundle of an unknown format as unreadable", async () => {
    const { root, runDir } = await folder();
    exportBundle(runDir, join(root, "shared", "bad"));
    exportBundle(runDir, join(root, "shared", "new"));
    writeFileSync(join(root, "shared", "bad", "frames.jsonl"), "{nope\n");
    const manifest = JSON.parse(readFileSync(join(root, "shared", "new", "bundle.json"), "utf8")) as Record<string, unknown>;
    writeFileSync(join(root, "shared", "new", "bundle.json"), JSON.stringify({ ...manifest, format: 2 }));
    const { catalog } = new RunCatalog(root).scan();
    const bad = catalog.runs.find((e) => e.kind === "bundle" && e.attributes["run"] === "bad")!;
    const fresh = catalog.runs.find((e) => e.kind === "bundle" && e.attributes["run"] === "new")!;
    for (const e of [bad, fresh]) expect(e).toMatchObject({ status: "unreadable", reason: expect.stringMatching(/^BundleInvalid: /) });
  });

  it("opens a run with zero calls at its start state", async () => {
    const f = await finishedRun({ label: "empty" });
    writeFileSync(join(f.runDir, "run.jsonl"), "");
    const { entry } = byRel(new RunCatalog(f.out), "empty/001");
    expect(entry.status).toBe("ready");
    expect(entry.preview?.strip).toBe("");
  });

  it("lists a run as unfinished until its score.json appears, then as ready", async () => {
    const f = await finishedRun({ label: "grow" });
    const text = readFileSync(join(f.runDir, "score.json"), "utf8");
    rmSync(join(f.runDir, "score.json"));
    const cat = new RunCatalog(f.out);
    expect(cat.scan().catalog.runs[0]?.status).toBe("unfinished");
    writeFileSync(join(f.runDir, "score.json"), text);
    expect(cat.scan().catalog.runs[0]?.status).toBe("ready");
  });

  it("builds a run's bundle once while its files do not change, and again when they do", async () => {
    const f = await finishedRun({ label: "cache" });
    const cat = new RunCatalog(f.out);
    cat.scan();
    cat.scan();
    expect(cat.builds).toBe(1);
    await new Promise((r) => setTimeout(r, 20));
    stampScore(f.runDir, { promptNote: "changed" });
    const { entry } = (() => { const s = cat.scan(); return { entry: s.catalog.runs[0]! }; })();
    expect(cat.builds).toBe(2);
    expect(entry.attributes["promptNote"]).toBe("changed");
  });

  it("holds no world file name and no item description in the catalog or any bundle file", async () => {
    const { root } = await folder();
    const snap = new RunCatalog(root).scan();
    const text = JSON.stringify(snap.catalog) + snap.catalog.runs.flatMap((e) => BUNDLE_FILES.map((n) => snap.file(e.id, n) ?? "")).join("\n");
    expect(text).not.toContain(WORLD_FILE_NAME);
    for (const d of Object.values(DESCRIPTIONS)) expect(text, d).not.toContain(d);
  });

  it("gives an empty catalog for a folder with no runs", () => {
    expect(new RunCatalog(join(process.cwd(), "specs", "004-skillcraft-visualizer", "contracts")).scan().catalog).toEqual({ format: 1, runs: [] });
  });
});
