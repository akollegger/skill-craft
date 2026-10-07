import { describe, expect, it } from "vitest";
import { arrange, defaultView, searchRuns, sortRuns } from "../src/state/view.ts";
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

describe("searchRuns", () => {
  it("searches the text attributes, ignoring case: world, goal, outcome, model, name", () => {
    expect(ids(searchRuns(runs, "SONNET"))).toEqual(["beta/001"]);
    expect(ids(searchRuns(runs, "alpha"))).toEqual(["alpha/001", "alpha/002"]);
    expect(ids(searchRuns(runs, "forge"))).toEqual(["alpha/001", "alpha/002"]);
    expect(ids(searchRuns(runs, "gave up"))).toEqual(["alpha/002"]);
    expect(ids(searchRuns(runs, "unfinished"))).toEqual(["beta/002"]);
  });

  it("finds a goal item by name", () => {
    const g = run({ label: "x", run: "1", goalItem: "pickaxe" });
    expect(ids(searchRuns([a, g], "pick"))).toEqual(["x/1"]);
  });

  it("treats blank search as all runs, and does not match numbers", () => {
    expect(ids(searchRuns(runs, "  "))).toEqual(ids(runs));
    expect(ids(searchRuns(runs, ""))).toEqual(ids(runs));
    expect(ids(searchRuns(runs, "11"))).toEqual([]);
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
  it("searches, then sorts, then groups, and keeps the labelled none group last", () => {
    const groups = arrange(runs, { ...defaultView(), group: "world", sort: { attr: "actionCalls", dir: "asc" }, search: "a" });
    expect(groups.map((g) => g.label)).toEqual(["forge", "workshop", "no world"]);
    expect(ids(groups[0]!.runs)).toEqual(["alpha/001", "alpha/002"]);
    expect(ids(groups[1]!.runs)).toEqual(["beta/001"]);
    expect(ids(groups[2]!.runs)).toEqual(["beta/002"]);
  });

  it("is one unlabelled group when nothing is grouped", () => {
    const groups = arrange(runs, { ...defaultView(), sort: null });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("");
    expect(ids(groups[0]!.runs)).toEqual(ids(runs));
  });

  it("works with an attribute that was added after the page was built", () => {
    const fresh = [run({ brandNew: "x", n: 1 }), run({ brandNew: "y", n: 2 }), run({ brandNew: "x", n: 3 })];
    const groups = arrange(fresh, { ...defaultView(), group: "brandNew", sort: { attr: "n", dir: "desc" } });
    expect(groups.map((g) => [g.label, g.runs.map((r) => r.attributes["n"])])).toEqual([["x", [3, 1]], ["y", [2]]]);
  });

  it("defaults to a list ungrouped, with the fewest calls first, and no search", () => {
    expect(defaultView()).toEqual({ group: null, sort: { attr: "actionCalls", dir: "asc" }, search: "", presentation: "list" });
  });
});
