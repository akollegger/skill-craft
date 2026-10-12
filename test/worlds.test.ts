import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { goalsPathFor, loadGoals } from "../src/sim/goals.js";
import { loadWorld } from "../src/sim/loader.js";
import { createRunLog } from "../src/sim/runlog.js";
import { solve, type BestRun } from "../src/sim/solver.js";
import { connect } from "./helpers/client.js";

const dirs = ["worlds", "worlds/generated", "test/fixtures/valid"];
const worldFiles = dirs.flatMap((dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".json") && !f.endsWith(".goals.json") && !f.endsWith(".notes.json") && !f.endsWith(".art.json"))
        .sort()
        .map((f) => join(dir, f))
    : [],
);

describe("every committed world (FR-021)", () => {
  it("finds worlds to check", () => {
    expect(worldFiles.length).toBeGreaterThanOrEqual(12);
  });

  for (const path of worldFiles) {
    it(`${path}: goals are solvable, replay through the tools in exactly minCalls, and solve in under 10 s`, async () => {
      const world = loadWorld(path);
      const goalsPath = goalsPathFor(path);
      expect(existsSync(goalsPath), `missing ${goalsPath}`).toBe(true);

      for (const goal of loadGoals(goalsPath, world)) {
        const started = performance.now();
        const run = solve(world, goal);
        expect(performance.now() - started).toBeLessThan(10_000);
        expect(run.reachable, `${goal.item}:${goal.qty} should be reachable`).toBe(true);
        const best = run as BestRun;

        // Replay using only the agent-facing tools, on a fresh server.
        const log = createRunLog();
        const { call } = await connect(world, { log });
        let sent = 0;
        for (const step of best.calls) {
          const res = await call(step.tool, step.args);
          sent++;
          expect(res.isError, JSON.stringify(step)).toBe(false);
        }
        expect(sent).toBe(best.minCalls);
        const held = (await call("inventory")).json?.["items"] as Record<string, number>;
        expect(held[goal.item] ?? 0).toBeGreaterThanOrEqual(goal.qty);
        expect(log.entries.filter((e) => e.tool === "place" || e.tool === "craft")).toHaveLength(best.minCalls);
      }
    });
  }
});

describe("the base world (worlds/forge.json)", () => {
  const world = loadWorld("worlds/forge.json");
  const goals = loadGoals("worlds/forge.goals.json", world);
  const run = (item: string) => solve(world, goals.find((g) => g.item === item) ?? { item, qty: 1 }) as BestRun;

  it("gives the warm-up goal at least one wasted craft of slack", () => {
    expect(run("bar").slack).toBeGreaterThanOrEqual(1);
  });

  it("has a one-recipe warm-up and a two-step middle goal", () => {
    expect(run("bar").minCrafts).toBe(1);
    expect(run("rod").minCrafts).toBe(2);
  });

  it("makes the held-out goal take at least 4 crafts and reuse intermediates from earlier goals", async () => {
    const lamp = run("lamp");
    expect(lamp.minCrafts).toBeGreaterThanOrEqual(4);
    const log = createRunLog();
    const { call } = await connect(world, { log });
    for (const step of lamp.calls) await call(step.tool, step.args);
    const crafted = new Set(log.entries.flatMap((e) => (e.crafted ? [e.crafted.item] : [])));
    expect(crafted.has("bar")).toBe(true); // the warm-up goal's item
    expect(crafted.has("rod")).toBe(true); // the middle goal's item
  });

  it("keeps neutral ids, so it is a base for generation and not an experiment world", () => {
    expect(world.items.some((i) => i.id === "ore")).toBe(true);
  });
});
