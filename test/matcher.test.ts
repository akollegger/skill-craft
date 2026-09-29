import { describe, expect, it } from "vitest";
import { buildMatcher, shapedKey, shapelessKey, tableKeys, type Grid } from "../src/sim/matcher.js";
import type { Recipe } from "../src/sim/schema.js";

const shapeless = (id: string, inputs: [string, number][], out = "out"): Recipe => ({
  id,
  kind: "shapeless",
  inputs: inputs.map(([item, qty]) => ({ item, qty })),
  output: { item: out, qty: 1 },
});
const shaped = (id: string, pattern: (string | null)[][], out = "out"): Recipe => ({
  id,
  kind: "shaped",
  pattern,
  output: { item: out, qty: 1 },
});
const empty = (rows: number, cols: number): Grid => Array.from({ length: rows }, () => Array<string | null>(cols).fill(null));

describe("keys", () => {
  it("shapeless key ignores item order and merges repeated entries", () => {
    expect(shapelessKey([{ item: "a", qty: 1 }, { item: "b", qty: 2 }])).toBe(
      shapelessKey([{ item: "b", qty: 2 }, { item: "a", qty: 1 }]),
    );
    expect(shapelessKey([{ item: "a", qty: 1 }, { item: "a", qty: 1 }])).toBe(shapelessKey([{ item: "a", qty: 2 }]));
  });

  it("shaped key is the same wherever the pattern sits, but not when rotated or mirrored", () => {
    const base = [["a", "b"], [null, "c"]];
    const padded = [[null, null, null, null], [null, "a", "b", null], [null, null, "c", null]];
    expect(shapedKey(base)).toBe(shapedKey(padded));
    expect(shapedKey(base)).not.toBe(shapedKey([["b", "a"], ["c", null]])); // mirrored
    expect(shapedKey(base)).not.toBe(shapedKey([["c", null], ["b", "a"]])); // rotated
  });

  it("table keys describe the multiset and the trimmed arrangement", () => {
    const g = empty(3, 3);
    g[1]![1] = "a";
    g[1]![2] = "b";
    g[2]![2] = "c";
    const keys = tableKeys(g);
    expect(keys.shaped).toBe(shapedKey([["a", "b"], [null, "c"]]));
    expect(keys.multiset).toBe(shapelessKey([{ item: "a", qty: 1 }, { item: "b", qty: 1 }, { item: "c", qty: 1 }]));
  });
});

describe("matching", () => {
  it("matches a shapeless recipe in any cells and rejects extra items", () => {
    const m = buildMatcher([shapeless("r", [["a", 1], ["b", 1]], "c")]);
    const g = empty(3, 3);
    g[0]![2] = "b";
    g[2]![0] = "a";
    expect(m.match(g)?.id).toBe("r");
    g[1]![1] = "z";
    expect(m.match(g)).toBeNull();
  });

  it("matches a shaped recipe at any position but only in its arrangement", () => {
    const m = buildMatcher([shaped("r", [["a", "b"], [null, "c"]])]);
    const right = empty(3, 3);
    right[1]![1] = "a";
    right[1]![2] = "b";
    right[2]![2] = "c";
    expect(m.match(right)?.id).toBe("r");
    const wrong = empty(3, 3);
    wrong[1]![1] = "a";
    wrong[1]![2] = "b";
    wrong[2]![1] = "c";
    expect(m.match(wrong)).toBeNull();
  });

  it("matches nothing on an empty table", () => {
    expect(buildMatcher([shapeless("r", [["a", 1]])]).match(empty(2, 2))).toBeNull();
  });
});

describe("conflicts", () => {
  it("reports two shapeless recipes with the same multiset", () => {
    const m = buildMatcher([shapeless("r1", [["a", 2]]), shapeless("r2", [["a", 2]], "other")]);
    expect(m.conflicts).toEqual([["r1", "r2"]]);
  });

  it("reports two shaped recipes equal up to translation", () => {
    const m = buildMatcher([shaped("r1", [["a", "b"]], "x"), shaped("r2", [[null, null, null], [null, "a", "b"]], "y")]);
    expect(m.conflicts).toEqual([["r1", "r2"]]);
  });

  it("reports a shaped and a shapeless recipe with the same multiset", () => {
    const m = buildMatcher([shapeless("r1", [["a", 1], ["b", 1]]), shaped("r2", [["a", "b"]], "other")]);
    expect(m.conflicts).toEqual([["r1", "r2"]]);
  });

  it("allows two shaped recipes with the same items in different arrangements", () => {
    const m = buildMatcher([shaped("r1", [["a"], ["b"]]), shaped("r2", [["b"], ["a"]], "other")]);
    expect(m.conflicts).toEqual([]);
  });
});
