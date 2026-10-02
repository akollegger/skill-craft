import { describe, expect, it } from "vitest";
import { arrange, defaultView, filterRuns, opsFor, sortRuns, type Filter } from "../src/state/view.ts";
import type { CatalogEntry } from "../../src/viz/contract.ts";

let n = 0;
const run = (attributes: CatalogEntry["attributes"], status: CatalogEntry["status"] = "ready"): CatalogEntry => {
  const id = (n++).toString(16).padStart(16, "0");
  return status === "ready"
    ? { id, kind: "run", status, attributes, preview: { strip: "", table: [] }, bundle: `bundles/${id}/` }
    : { id, kind: "run", status, reason: "Unfinished: x", attributes };
};

const a = run({ label: "alpha", run: "001", world: "forge", outcome: "reached", actionCalls: 11, skillLoaded: true, modelRan: "haiku" });
const b = run({ label: "alpha", run: "002", world: "forge", outcome: "gave up", actionCalls: 90, skillLoaded: false, modelRan: "haiku" });
const c = run({ label: "beta", run: "001", world: "workshop", outcome: "reached", actionCalls: 3, modelRan: "sonnet" });
const d = run({ label: "beta", run: "002", outcome: "unfinished", actionCalls: 9 }, "unfinished");
const runs = [a, b, c, d];
const ids = (list: CatalogEntry[]) => list.map((e) => `${e.attributes["label"]}/${e.attributes["run"]}`);
const f = (attr: string, op: Filter["op"], value?: string | number | boolean): Filter => (value === undefined ? { attr, op } : { attr, op, value });

describe("filterRuns", () => {
  it("filters text with is, is not and contains", () => {
    expect(ids(filterRuns(runs, [f("outcome", "is", "reached")]))).toEqual(["alpha/001", "beta/001"]);
    expect(ids(filterRuns(runs, [f("outcome", "is not", "reached")]))).toEqual(["alpha/002", "beta/002"]);
    expect(ids(filterRuns(runs, [f("modelRan", "contains", "AIK")]))).toEqual(["alpha/001", "alpha/002"]);
  });

  it("filters numbers with =, ≥ and ≤", () => {
    expect(ids(filterRuns(runs, [f("actionCalls", "=", 11)]))).toEqual(["alpha/001"]);
    expect(ids(filterRuns(runs, [f("actionCalls", ">=", 11)]))).toEqual(["alpha/001", "alpha/002"]);
    expect(ids(filterRuns(runs, [f("actionCalls", "<=", 9)]))).toEqual(["beta/001", "beta/002"]);
  });

  it("filters flags with is", () => {
    expect(ids(filterRuns(runs, [f("skillLoaded", "is", true)]))).toEqual(["alpha/001"]);
    expect(ids(filterRuns(runs, [f("skillLoaded", "is", false)]))).toEqual(["alpha/002"]);
  });

  it("makes a run that lacks the attribute fail every test except is-missing", () => {
    for (const op of ["is", "is not", "contains"] as const) expect(ids(filterRuns([d], [f("world", op, "forge")])), op).toEqual([]);
    expect(ids(filterRuns([d], [f("actionCalls", ">=", 0), f("world", "is not", "x")]))).toEqual([]);
    expect(ids(filterRuns(runs, [f("world", "missing")]))).toEqual(["beta/002"]);
    expect(ids(filterRuns(runs, [f("skillLoaded", "missing")]))).toEqual(["beta/001", "beta/002"]);
  });

  it("combines filters with and", () => {
    expect(ids(filterRuns(runs, [f("outcome", "is", "reached"), f("actionCalls", ">=", 5)]))).toEqual(["alpha/001"]);
  });

  it("ignores a filter whose value does not fit the attribute, and treats no filters as all runs", () => {
    expect(filterRuns(runs, [])).toEqual(runs);
    expect(ids(filterRuns(runs, [f("actionCalls", ">=", "many")]))).toEqual([]);
  });

  it("searches the text attributes, ignoring case", () => {
    expect(ids(filterRuns(runs, [], "SONNET"))).toEqual(["beta/001"]);
    expect(ids(filterRuns(runs, [], "alpha"))).toEqual(["alpha/001", "alpha/002"]);
    expect(ids(filterRuns(runs, [], "  "))).toEqual(ids(runs));
    expect(ids(filterRuns(runs, [], "11"))).toEqual([]); // numbers are not text
  });
});

describe("sortRuns", () => {
  it("sorts numbers by size and text alphabetically, either way", () => {
    expect(ids(sortRuns(runs, { attr: "actionCalls", dir: "asc" }))).toEqual(["beta/001", "beta/002", "alpha/001", "alpha/002"]);
    expect(ids(sortRuns(runs, { attr: "actionCalls", dir: "desc" }))).toEqual(["alpha/002", "alpha/001", "beta/002", "beta/001"]);
    expect(ids(sortRuns(runs, { attr: "modelRan", dir: "asc" }))).toEqual(["alpha/001", "alpha/002", "beta/001", "beta/002"]);
  });

  it("sorts flags false before true", () => {
    expect(ids(sortRuns([a, b], { attr: "skillLoaded", dir: "asc" }))).toEqual(["alpha/002", "alpha/001"]);
  });

  it("puts runs that lack the attribute last, whichever way it sorts", () => {
    expect(ids(sortRuns(runs, { attr: "skillLoaded", dir: "asc" })).slice(-2)).toEqual(["beta/001", "beta/002"]);
    expect(ids(sortRuns(runs, { attr: "skillLoaded", dir: "desc" })).slice(-2)).toEqual(["beta/001", "beta/002"]);
  });

  it("keeps the catalog order among equals, and leaves the order alone with no sort", () => {
    expect(ids(sortRuns(runs, { attr: "outcome", dir: "asc" }))).toEqual(["alpha/002", "alpha/001", "beta/001", "beta/002"]);
    expect(sortRuns(runs, null)).toEqual(runs);
  });

  it("does not change the list it was given", () => {
    const copy = [...runs];
    sortRuns(runs, { attr: "actionCalls", dir: "desc" });
    expect(runs).toEqual(copy);
  });
});

describe("arrange", () => {
  it("filters, then sorts, then groups, and keeps the labelled none group last", () => {
    const groups = arrange(runs, { ...defaultView(), group: "world", sort: { attr: "actionCalls", dir: "asc" }, filters: [f("actionCalls", ">=", 5)] });
    expect(groups.map((g) => g.label)).toEqual(["forge", "no world"]);
    expect(ids(groups[0]!.runs)).toEqual(["alpha/001", "alpha/002"]);
    expect(ids(groups[1]!.runs)).toEqual(["beta/002"]);
  });

  it("is one unlabelled group when nothing is grouped", () => {
    const groups = arrange(runs, defaultView());
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("");
    expect(ids(groups[0]!.runs)).toEqual(ids(runs));
  });

  it("works with an attribute that was added after the page was built", () => {
    const fresh = [run({ brandNew: "x", n: 1 }), run({ brandNew: "y", n: 2 }), run({ brandNew: "x", n: 3 })];
    const groups = arrange(fresh, { ...defaultView(), group: "brandNew", sort: { attr: "n", dir: "desc" }, filters: [f("n", ">=", 2)] });
    expect(groups.map((g) => [g.label, g.runs.map((r) => r.attributes["n"])])).toEqual([["x", [3]], ["y", [2]]]);
  });

  it("defaults to a list ungrouped, unsorted and unfiltered", () => {
    expect(defaultView()).toEqual({ group: null, sort: null, filters: [], search: "", presentation: "list" });
  });
});

describe("opsFor", () => {
  it("offers each kind its own operators, and every kind is-missing", () => {
    expect(opsFor("text")).toEqual(["is", "is not", "contains", "missing"]);
    expect(opsFor("number")).toEqual(["=", ">=", "<=", "missing"]);
    expect(opsFor("flag")).toEqual(["is", "missing"]);
  });
});
