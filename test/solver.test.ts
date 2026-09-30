import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/engine.js";
import { SLACK_CAP } from "../src/sim/limits.js";
import type { World } from "../src/sim/schema.js";
import { SolverBudgetError, solve, type BestRun } from "../src/sim/solver.js";
import { makeWorld } from "./helpers/worlds.js";

const items = (...ids: string[]) => ids.map((id) => ({ id, description: "An item." }));
const sl = (id: string, inputs: [string, number][], out: string, qty = 1) => ({
  id,
  kind: "shapeless",
  inputs: inputs.map(([item, n]) => ({ item, qty: n })),
  output: { item: out, qty },
});

const reachable = (run: ReturnType<typeof solve>): BestRun => {
  expect(run.reachable).toBe(true);
  return run as BestRun;
};

/** Replay a best run on a fresh game; every call must succeed and the goal must be held. */
function replay(world: World, run: BestRun): Game {
  const game = new Game(world);
  for (const call of run.calls) {
    const res = call.tool === "place" ? game.place(String(call.args["item"]), Number(call.args["row"]), Number(call.args["col"])) : game.craft();
    expect(res, JSON.stringify(call)).toMatchObject({ ok: true });
  }
  expect(game.count(run.goal.item)).toBeGreaterThanOrEqual(run.goal.qty);
  return game;
}

describe("best run: hand-worked worlds", () => {
  it("(a) one recipe: 1 craft, 3 calls, slack at the cap", () => {
    const world = makeWorld({ stock: { a: 2 }, items: items("a", "b"), recipes: [sl("r", [["a", 2]], "b")] });
    const run = reachable(solve(world, { item: "b", qty: 1 }));
    expect(run.minCrafts).toBe(1);
    expect(run.minCalls).toBe(3);
    expect(run.slack).toBe(SLACK_CAP);
    expect(run.calls).toEqual([
      { tool: "place", args: { item: "a", row: 0, col: 0 } },
      { tool: "place", args: { item: "a", row: 0, col: 1 } },
      { tool: "craft", args: {} },
    ]);
    replay(world, run);
  });

  it("(b) one wasted craft is survivable, two are not: slack 1", () => {
    const world = makeWorld({
      stock: { a: 3 },
      items: items("a", "b", "x"),
      recipes: [sl("r1", [["a", 2]], "b"), sl("r2", [["a", 1]], "x")],
    });
    const run = reachable(solve(world, { item: "b", qty: 1 }));
    expect(run.slack).toBe(1);
    expect(run.minCrafts).toBe(1);
    replay(world, run);
  });

  it("(c) the fewest crafts and the fewest calls come from different paths", () => {
    const world = makeWorld({
      stock: { a: 6, b: 1 },
      items: items("a", "b", "g", "x"),
      recipes: [sl("r-big", [["a", 6]], "g"), sl("r-x", [["a", 2]], "x"), sl("r-g2", [["x", 1], ["b", 1]], "g")],
    });
    const run = reachable(solve(world, { item: "g", qty: 1 }));
    expect(run.minCrafts).toBe(1); // r-big alone, 7 calls
    expect(run.minCalls).toBe(6); // r-x then r-g2, 3 + 3 calls
    expect(run.calls.filter((c) => c.tool === "craft")).toHaveLength(2);
    replay(world, run);
  });

  it("(d) an unreachable goal is reported as such", () => {
    const world = makeWorld({ stock: { a: 1 }, items: items("a", "b"), recipes: [sl("r", [["a", 2]], "b")] });
    const run = solve(world, { item: "b", qty: 1 });
    expect(run.reachable).toBe(false);
    expect("calls" in run).toBe(false);
  });

  it("(e) a search that exceeds its budget throws an error naming the budget", () => {
    const world = makeWorld({
      stock: { a: 6, b: 1 },
      items: items("a", "b", "g", "x"),
      recipes: [sl("r-big", [["a", 6]], "g"), sl("r-x", [["a", 2]], "x"), sl("r-g2", [["x", 1], ["b", 1]], "g")],
    });
    expect(() => solve(world, { item: "g", qty: 1 }, { stateBudget: 2 })).toThrow(SolverBudgetError);
    expect(() => solve(world, { item: "g", qty: 1 }, { stateBudget: 2 })).toThrow(/budget of 2/);
  });

  it("a goal that is already held needs no calls", () => {
    const world = makeWorld({ stock: { a: 2 }, items: items("a", "b"), recipes: [sl("r", [["a", 2]], "b")] });
    const run = reachable(solve(world, { item: "a", qty: 2 }));
    expect([run.minCrafts, run.minCalls, run.calls.length]).toEqual([0, 0, 0]);
  });

  it("counts a repeated recipe as separate crafts", () => {
    const world = makeWorld({ stock: { a: 4 }, items: items("a", "b"), recipes: [sl("r", [["a", 2]], "b")] });
    const run = reachable(solve(world, { item: "b", qty: 2 }));
    expect([run.minCrafts, run.minCalls]).toEqual([2, 6]);
    replay(world, run);
  });

  it("makes several units with one craft when the recipe outputs several", () => {
    const world = makeWorld({ stock: { a: 1 }, items: items("a", "b"), recipes: [sl("r", [["a", 1]], "b", 3)] });
    const run = reachable(solve(world, { item: "b", qty: 2 }));
    expect([run.minCrafts, run.minCalls]).toEqual([1, 2]);
  });

  it("places a shaped recipe's pattern anchored at the top-left", () => {
    const world = makeWorld({
      stock: { a: 2 },
      items: items("a", "b"),
      recipes: [{ id: "r", kind: "shaped", pattern: [[null, "a"], ["a", null]], output: { item: "b", qty: 1 } }],
    });
    const run = reachable(solve(world, { item: "b", qty: 1 }));
    expect(run.calls).toEqual([
      { tool: "place", args: { item: "a", row: 0, col: 1 } },
      { tool: "place", args: { item: "a", row: 1, col: 0 } },
      { tool: "craft", args: {} },
    ]);
    replay(world, run);
  });

  it("solves the standard test world's chained goal", () => {
    const world = makeWorld();
    const run = reachable(solve(world, { item: "e", qty: 1 }));
    expect(run.minCrafts).toBe(2); // d from a+a, then e from d+b
    expect(run.minCalls).toBe(3 + 3);
    replay(world, run);
  });

  it("rejects a goal for an item the world does not define", () => {
    expect(() => solve(makeWorld(), { item: "ghost", qty: 1 })).toThrow(/unknown item 'ghost'/);
  });
});
