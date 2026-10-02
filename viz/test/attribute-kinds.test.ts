import { describe, expect, it } from "vitest";
import { attributeLabel, describeAttributes } from "../src/state/attributes.ts";
import type { CatalogEntry } from "../../src/viz/contract.ts";

let n = 0;
const run = (attributes: CatalogEntry["attributes"], status: CatalogEntry["status"] = "ready"): CatalogEntry => {
  const id = (n++).toString(16).padStart(16, "0");
  return status === "ready"
    ? { id, kind: "run", status, attributes, preview: { strip: "", table: [] }, bundle: `bundles/${id}/` }
    : { id, kind: "run", status, reason: "Unfinished: x", attributes };
};
const info = (runs: CatalogEntry[], name: string) => describeAttributes(runs).find((a) => a.name === name);

describe("describeAttributes", () => {
  const runs = [
    run({ world: "w1", rows: 3, skillLoaded: true, goalQty: 1 }),
    run({ world: "w2", rows: 6, skillLoaded: false, goalQty: "many" }),
    run({ world: "w1", rows: 3 }),
    run({ world: "w1" }, "unfinished"),
  ];

  it("infers text, number and flag from the values, not from a list of names", () => {
    expect(info(runs, "world")?.kind).toBe("text");
    expect(info(runs, "rows")?.kind).toBe("number");
    expect(info(runs, "skillLoaded")?.kind).toBe("flag");
  });

  it("treats an attribute whose values disagree in kind as text", () => {
    expect(info(runs, "goalQty")?.kind).toBe("text");
  });

  it("counts the runs that have the attribute and the runs that lack it, counting every status", () => {
    expect(info(runs, "world")).toMatchObject({ present: 4, missing: 0 });
    expect(info(runs, "rows")).toMatchObject({ present: 3, missing: 1 });
    expect(info(runs, "skillLoaded")).toMatchObject({ present: 2, missing: 2 });
  });

  it("lists distinct values in order: numbers by size, text alphabetically, flags false then true", () => {
    expect(info(runs, "rows")?.values).toEqual([3, 6]);
    expect(info(runs, "world")?.values).toEqual(["w1", "w2"]);
    expect(info(runs, "skillLoaded")?.values).toEqual([false, true]);
  });

  it("picks up an attribute it has never seen", () => {
    const a = info([run({ brandNew: 7 }), run({ brandNew: 2 })], "brandNew");
    expect(a).toMatchObject({ kind: "number", present: 2, missing: 0, values: [2, 7] });
  });

  it("orders attributes by name and gives nothing for no runs", () => {
    const names = describeAttributes(runs).map((a) => a.name);
    expect(names).toEqual([...names].sort());
    expect(describeAttributes([])).toEqual([]);
  });
});

describe("attributeLabel", () => {
  it("turns a camelCase name into words", () => {
    expect(attributeLabel("priorFit")).toBe("prior fit");
    expect(attributeLabel("goalQty")).toBe("goal qty");
    expect(attributeLabel("world")).toBe("world");
  });

  it("uses a plainer word for a few well-known names", () => {
    expect(attributeLabel("actionCalls")).toBe("calls");
    expect(attributeLabel("modelRan")).toBe("model");
    expect(attributeLabel("costUsd")).toBe("cost");
    expect(attributeLabel("durationMs")).toBe("time");
  });
});
