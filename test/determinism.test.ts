import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/engine.js";
import { goalsPathFor, loadGoals } from "../src/sim/goals.js";
import { loadWorld } from "../src/sim/loader.js";
import type { World } from "../src/sim/schema.js";
import { solve } from "../src/sim/solver.js";

const REPLAYS = 100;

const worldFiles = ["worlds", "worlds/generated", "test/fixtures/valid"].flatMap((dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".json") && !f.endsWith(".goals.json") && !f.endsWith(".notes.json"))
        .sort()
        .map((f) => join(dir, f))
    : [],
);

type Call = { tool: "place" | "remove" | "clear" | "craft" | "look" | "inventory"; item?: string; row?: number; col?: number };

/**
 * A fixed sequence with no randomness: the first goal's best run (so crafts really happen), then 200
 * calls that cycle through the tools and every cell in a set order, with deliberately invalid
 * arguments mixed in.
 */
function sequenceFor(world: World, path: string): Call[] {
  const { rows, cols } = world.grid;
  const ids = world.items.map((i) => i.id);
  const goal = loadGoals(goalsPathFor(path), world)[0];
  const best = goal ? solve(world, goal) : undefined;
  const prefix: Call[] = best?.reachable
    ? best.calls.map((c) => (c.tool === "craft" ? { tool: "craft" } : { tool: "place", item: String(c.args["item"]), row: Number(c.args["row"]), col: Number(c.args["col"]) }))
    : [];

  const cycle: Call[] = [];
  const ops: Call["tool"][] = ["place", "place", "look", "remove", "craft", "inventory", "place", "clear", "remove", "place"];
  for (let i = 0; i < 200; i++) {
    const cell = i % (rows * cols);
    const call: Call = { tool: ops[i % ops.length] as Call["tool"], item: ids[i % ids.length] as string, row: Math.floor(cell / cols), col: cell % cols };
    if (i % 7 === 0) call.row = rows + 3; // out of bounds
    if (i % 11 === 0) call.item = "no-such-item";
    cycle.push(call);
  }
  return [...prefix, ...cycle];
}

function play(world: World, calls: Call[]): { outcomes: string[]; log: string } {
  const game = new Game(world);
  const outcomes = calls.map((c) => {
    switch (c.tool) {
      case "place": return JSON.stringify(game.place(c.item as string, c.row as number, c.col as number));
      case "remove": return JSON.stringify(game.remove(c.row as number, c.col as number));
      case "clear": return JSON.stringify(game.clear());
      case "craft": return JSON.stringify(game.craft());
      case "look": return JSON.stringify(game.look());
      case "inventory": return JSON.stringify(game.inventory());
    }
  });
  return { outcomes, log: game.log.toJsonl() };
}

describe("determinism (SC-001)", () => {
  it("finds worlds to check", () => {
    expect(worldFiles.length).toBeGreaterThanOrEqual(11);
  });

  for (const path of worldFiles) {
    it(`${path}: ${REPLAYS} replays of one call sequence give identical outcomes and byte-identical logs`, () => {
      const world = loadWorld(path);
      const calls = sequenceFor(world, path);
      const first = play(world, calls);
      expect(first.outcomes.some((o) => o.includes('"ok":false'))).toBe(true); // refusals are exercised
      for (let i = 0; i < REPLAYS; i++) {
        const again = play(world, calls);
        expect(again.outcomes).toEqual(first.outcomes);
        expect(again.log).toBe(first.log);
      }
    });
  }

  it("exercises real crafts on the base world", () => {
    const world = loadWorld("worlds/forge.json");
    const { outcomes } = play(world, sequenceFor(world, "worlds/forge.json"));
    expect(outcomes.some((o) => o.includes('"crafted"'))).toBe(true);
  });
});
