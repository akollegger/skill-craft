import type { Grid } from "../../src/sim/matcher.js";
import { parseWorld, type World } from "../../src/sim/schema.js";

/**
 * A small valid world for tests. Items are single letters. Recipes:
 *   r-d  shapeless  a + a        -> d
 *   r-e  shapeless  d + b        -> e   (uses a made item)
 *   r-s  shaped     [a b / . c]  -> s   (arrangement matters)
 * Stock: a:4, b:2, c:1 on a 3x3 table. Pass overrides to replace any top-level field.
 */
export function makeWorld(overrides: Record<string, unknown> = {}): World {
  return parseWorld({
    name: "test",
    description: "A world for tests.",
    grid: { rows: 3, cols: 3 },
    hints: "exact",
    stock: { a: 4, b: 2, c: 1 },
    items: ["a", "b", "c", "d", "e", "s"].map((id) => ({ id, description: "An item." })),
    recipes: [
      { id: "r-d", kind: "shapeless", inputs: [{ item: "a", qty: 2 }], output: { item: "d", qty: 1 } },
      { id: "r-e", kind: "shapeless", inputs: [{ item: "d", qty: 1 }, { item: "b", qty: 1 }], output: { item: "e", qty: 1 } },
      { id: "r-s", kind: "shaped", pattern: [["a", "b"], [null, "c"]], output: { item: "s", qty: 1 } },
    ],
    ...overrides,
  });
}

/** Build a grid from rows of characters; `.` is an empty cell. */
export function gridOf(rows: string[]): Grid {
  return rows.map((row) => [...row].map((ch) => (ch === "." ? null : ch)));
}
