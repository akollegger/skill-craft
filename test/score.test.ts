import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/engine.js";
import { scoreRun } from "../src/sim/score.js";
import { makeWorld } from "./helpers/worlds.js";

const world = makeWorld(); // goal e: two crafts (d from a+a, then e from d+b), 6 world-changing calls
const goal = { item: "e", qty: 1 };

/** Play a script on a fresh game and return its run log. */
function play(script: (g: Game) => void) {
  const game = new Game(world);
  script(game);
  return game.log.entries;
}

const bestRun = (g: Game) => {
  g.place("a", 0, 0);
  g.place("a", 0, 1);
  g.craft();
  g.place("d", 0, 0);
  g.place("b", 0, 1);
  g.craft();
};

describe("scoreRun", () => {
  it("scores a perfect run as reached with no extra calls", () => {
    const s = scoreRun(world, goal, play(bestRun));
    expect(s).toMatchObject({ reached: true, callsToGoal: 6, actionCalls: 6, craftsMade: 2, failedCrafts: 0, extraCalls: 0, extraCrafts: 0 });
    expect(s.best).toMatchObject({ minCrafts: 2, minCalls: 6 });
  });

  it("counts the extra calls a wandering run spends before reaching the goal", () => {
    const s = scoreRun(
      world,
      goal,
      play((g) => {
        g.look();
        g.place("a", 0, 0);
        g.place("b", 0, 1); // a wrong pairing
        g.remove(0, 1);
        g.place("a", 0, 1);
        g.craft();
        g.inventory();
        g.place("d", 0, 0);
        g.place("b", 0, 1);
        g.craft();
      }),
    );
    expect(s.reached).toBe(true);
    // place, place, remove, place, craft, place, place, craft: look and inventory are free
    expect(s.callsToGoal).toBe(8);
    expect(s.extraCalls).toBe(2);
    expect(s.extraCrafts).toBe(0);
    expect(s.totalCalls).toBe(10);
  });

  it("stops counting at the moment the goal is first held", () => {
    const s = scoreRun(
      world,
      goal,
      play((g) => {
        bestRun(g);
        g.place("a", 0, 0); // keeps playing after success
        g.clear();
      }),
    );
    expect(s.callsToGoal).toBe(6);
    expect(s.actionCalls).toBe(8);
  });

  it("reports a run that never reaches the goal", () => {
    const s = scoreRun(
      world,
      goal,
      play((g) => {
        g.look();
        g.place("a", 0, 0);
        g.place("c", 1, 1);
        g.craft(); // nothing_to_craft
        g.remove(2, 2); // cell_empty
      }),
    );
    expect(s).toMatchObject({ reached: false, extraCalls: null, extraCrafts: null, failedCrafts: 1 });
    expect(s.actionCalls).toBe(4); // place, place, craft (refused), remove (refused); look is free
    expect(s.callsToGoal).toBe(4); // never reached, so every action counts
  });

  it("counts refusals by code and failed crafts", () => {
    const s = scoreRun(
      world,
      goal,
      play((g) => {
        g.place("a", 9, 9); // out_of_bounds
        g.place("zzz", 0, 0); // unknown_item
        g.craft(); // nothing_to_craft
        g.craft(); // nothing_to_craft
      }),
    );
    expect(s.refusals).toEqual({ out_of_bounds: 1, unknown_item: 1, nothing_to_craft: 2 });
    expect(s.failedCrafts).toBe(2);
  });

  it("reports best as null for a goal that cannot be reached", () => {
    const s = scoreRun(makeWorld({ stock: { a: 1 } }), goal, []);
    expect(s.best).toBeNull();
    expect(s.reached).toBe(false);
  });

  it("treats a goal that is already held as reached with no calls", () => {
    const s = scoreRun(world, { item: "a", qty: 1 }, play((g) => g.look()));
    expect(s).toMatchObject({ reached: true, callsToGoal: 0, extraCalls: 0, extraCrafts: 0 });
  });

  it("scores an empty log", () => {
    expect(scoreRun(world, goal, [])).toMatchObject({ reached: false, totalCalls: 0, actionCalls: 0, callsToGoal: 0 });
  });

  it("rejects a log that does not replay on this world", () => {
    const entries = play(bestRun).map((e) => ({ ...e }));
    entries[2] = { ...entries[2]!, ok: false, error: "nothing_to_craft" };
    expect(() => scoreRun(world, goal, entries)).toThrow(/entry 3/);
    expect(() => scoreRun(makeWorld({ stock: { a: 1, b: 1 } }), goal, play(bestRun))).toThrow(/does not replay/);
  });
});
