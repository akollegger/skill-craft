import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { entrySchema, parseCatalog } from "../../src/viz/contract.js";

const ready = {
  id: "0123456789abcdef",
  kind: "run",
  status: "ready",
  attributes: { label: "lab", run: "001", world: "w", rows: 3, cols: 3, skillLoaded: true },
  preview: { strip: "pcr.t", table: [["a", null], [null, "b"]] },
  bundle: "bundles/0123456789abcdef/",
};
const unreadable = { id: "fedcba9876543210", kind: "bundle", status: "unreadable", reason: "BundleInvalid: bundle.json is missing", attributes: { label: "x" } };

describe("the catalog contract", () => {
  it("accepts ready, unfinished and unreadable entries", () => {
    const r = parseCatalog({ format: 1, runs: [ready, unreadable, { id: "aaaaaaaaaaaaaaaa", kind: "run", status: "unfinished", reason: "Unfinished: the run has no score.json", attributes: {} }] });
    expect(r.ok).toBe(true);
  });

  it("accepts an empty catalog", () => {
    expect(parseCatalog({ format: 1, runs: [] }).ok).toBe(true);
  });

  it("ignores fields it does not know", () => {
    const r = parseCatalog({ format: 1, extra: 1, runs: [{ ...ready, later: { a: 1 } }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.catalog.runs[0]).not.toHaveProperty("later");
  });

  it("rejects an attribute whose value is an object, an array or null", () => {
    for (const bad of [{ a: { b: 1 } }, { a: [1] }, { a: null }]) {
      expect(entrySchema.safeParse({ ...ready, attributes: bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("reports an unknown format apart from a malformed catalog", () => {
    expect(parseCatalog({ format: 2, runs: [] })).toEqual({ ok: false, error: "unsupported-format", format: 2 });
    const r = parseCatalog({ format: 1, runs: "no" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid");
    expect(parseCatalog("nonsense")).toMatchObject({ ok: false, error: "invalid" });
  });

  it("requires a preview and a bundle address on a ready entry, and neither on any other", () => {
    expect(entrySchema.safeParse({ ...ready, preview: undefined }).success).toBe(false);
    expect(entrySchema.safeParse({ ...ready, bundle: undefined }).success).toBe(false);
    expect(entrySchema.safeParse({ ...unreadable, bundle: "bundles/x/" }).success).toBe(false);
    expect(entrySchema.safeParse({ ...unreadable, preview: ready.preview }).success).toBe(false);
  });

  it("requires a coded reason on an entry that is not ready, and none on one that is", () => {
    expect(entrySchema.safeParse({ ...unreadable, reason: undefined }).success).toBe(false);
    expect(entrySchema.safeParse({ ...unreadable, reason: "something went wrong" }).success).toBe(false);
    expect(entrySchema.safeParse({ ...unreadable, reason: "Mystery: something" }).success).toBe(false);
    for (const code of ["Unfinished", "WorldMissing", "ReplayFailed", "BundleInvalid", "RunInvalid"]) {
      expect(entrySchema.safeParse({ ...unreadable, reason: `${code}: fixed text` }).success, code).toBe(true);
    }
    expect(entrySchema.safeParse({ ...ready, reason: "Unfinished: x" }).success).toBe(false);
  });

  it("requires an id of sixteen hex characters", () => {
    for (const id of ["short", "ZZZZZZZZZZZZZZZZ", "0123456789abcdef0"]) expect(entrySchema.safeParse({ ...ready, id }).success, id).toBe(false);
  });

  it("has no Node import, so the page can share it", () => {
    const source = readFileSync(new URL("../../src/viz/contract.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["']node:/);
    expect(source).not.toMatch(/require\(/);
  });

  it("accepts only the relative bundle address built from the entry's own id, never an absolute or foreign one", () => {
    expect(entrySchema.safeParse(ready).success).toBe(true);
    for (const bundle of ["https://evil.example/bundles/0123456789abcdef/", "//evil.example/", "/bundles/0123456789abcdef/", "bundles/ffffffffffffffff/", "bundles/0123456789abcdef", "../bundles/0123456789abcdef/"]) {
      expect(entrySchema.safeParse({ ...ready, bundle }).success, bundle).toBe(false);
    }
  });
});
