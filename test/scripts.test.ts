import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/engine.js";
import { loadWorld } from "../src/sim/loader.js";
import { createRunLog } from "../src/sim/runlog.js";
import { solve } from "../src/sim/solver.js";

/** Run a script the way a user would: `node --import tsx <script> ...args` from the repo root. */
function run(script: string, args: string[], env: Record<string, string> = {}) {
  const res = spawnSync(process.execPath, ["--import", "tsx", script, ...args], { encoding: "utf8", timeout: 60_000, env: { ...process.env, ...env } });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

describe("scripts/solve.ts", () => {
  it("prints the best run for every goal in a goals file", () => {
    const res = run("scripts/solve.ts", ["--world", "worlds/forge.json", "--goals-file", "worlds/forge.goals.json"]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout) as Record<string, any>[];
    expect(out.map((o) => o["goal"].item)).toEqual(["bar", "rod", "lamp"]);
    for (const o of out) {
      expect(Object.keys(o)).toEqual(expect.arrayContaining(["goal", "reachable", "minCrafts", "minCalls", "slack", "statesVisited", "calls"]));
    }
    expect(out[0]).toMatchObject({ reachable: true, minCrafts: 1, minCalls: 3 });
    expect(out[2]).toMatchObject({ reachable: true, minCrafts: 7, minCalls: 22 });
  });

  it("takes goals from --goal, repeatable, with a default quantity of 1", () => {
    const res = run("scripts/solve.ts", ["--world", "worlds/forge.json", "--goal", "bar", "--goal", "bar:2"]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout) as Record<string, any>[];
    expect(out.map((o) => o["goal"])).toEqual([{ item: "bar", qty: 1 }, { item: "bar", qty: 2 }]);
    expect(out[1]?.["minCrafts"]).toBe(2);
  });

  it("reports an unreachable goal without failing", () => {
    const res = run("scripts/solve.ts", ["--world", "worlds/forge.json", "--goal", "lamp:5"]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout) as Record<string, any>[];
    expect(out[0]).toMatchObject({ reachable: false });
    expect(out[0]).not.toHaveProperty("calls");
  });

  it("exits 1 with a message when the world cannot be loaded", () => {
    const broken = JSON.parse(readFileSync("test/fixtures/invalid/conflict-shapeless.json", "utf8")) as Record<string, unknown>;
    delete broken["$expect"];
    const path = join(mkdtempSync(join(tmpdir(), "skill-craft-")), "broken.json");
    writeFileSync(path, JSON.stringify(broken));
    const res = run("scripts/solve.ts", ["--world", path, "--goal", "c"]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("can match the same table state");
  });

  it("exits 1 naming the budget when the search is too large", () => {
    const res = run("scripts/solve.ts", ["--world", "worlds/forge.json", "--goal", "lamp", "--state-budget", "5"]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("budget of 5");
  });

  it("exits 1 when no goal is given", () => {
    expect(run("scripts/solve.ts", ["--world", "worlds/forge.json"]).status).toBe(1);
  });
});

describe("scripts/smoke.ts", () => {
  it("replays the best run over the real server and reports the goal held", () => {
    const res = run("scripts/smoke.ts", ["worlds/forge.json", "lamp:1"]);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain("world-changing calls: 22 (best run: 22)");
    expect(res.stdout).toContain("goal held: yes");
  });

  it("exits non-zero for a goal that cannot be reached", () => {
    expect(run("scripts/smoke.ts", ["worlds/forge.json", "lamp:5"]).status).not.toBe(0);
  });
});

describe("scripts/make-world.ts", () => {
  const fresh = () => mkdtempSync(join(tmpdir(), "skill-craft-"));

  it("writes a world and a goals file, identical byte for byte for the same seed", () => {
    const dir = fresh();
    for (const name of ["a", "b"]) {
      const res = run("scripts/make-world.ts", ["--seed", "7", "--out", join(dir, `${name}.json`)]);
      expect(res.status, res.stderr).toBe(0);
    }
    expect(readFileSync(join(dir, "a.json"), "utf8")).toBe(readFileSync(join(dir, "b.json"), "utf8"));
    expect(readFileSync(join(dir, "a.goals.json"), "utf8")).toBe(readFileSync(join(dir, "b.goals.json"), "utf8"));
    expect(existsSync(join(dir, "a.goals.json"))).toBe(true);
  });

  it("writes files that load and whose goals are solvable", () => {
    const dir = fresh();
    const out = join(dir, "w.json");
    expect(run("scripts/make-world.ts", ["--seed", "3", "--perturb", "--out", out]).status).toBe(0);
    const solved = run("scripts/solve.ts", ["--world", out, "--goals-file", join(dir, "w.goals.json")]);
    expect(solved.status, solved.stderr).toBe(0);
    for (const o of JSON.parse(solved.stdout) as { reachable: boolean }[]) expect(o.reachable).toBe(true);
  });

  it("changes the recipes when asked to perturb", () => {
    const dir = fresh();
    run("scripts/make-world.ts", ["--seed", "5", "--out", join(dir, "plain.json")]);
    run("scripts/make-world.ts", ["--seed", "5", "--perturb", "--out", join(dir, "perturbed.json")]);
    expect(readFileSync(join(dir, "perturbed.json"), "utf8")).not.toBe(readFileSync(join(dir, "plain.json"), "utf8"));
  });

  it("prints the world to stdout, and writes no goals file, without --out", () => {
    const res = run("scripts/make-world.ts", ["--seed", "2"]);
    expect(res.status).toBe(0);
    const world = JSON.parse(res.stdout) as { name: string; recipes: unknown[] };
    expect(world.name).toMatch(/-2$/);
    expect(world.recipes.length).toBeGreaterThan(0);
  });

  it("exits 1 with a message when the base world cannot be read", () => {
    const res = run("scripts/make-world.ts", ["--base", "worlds/none.json", "--seed", "1"]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("cannot read");
  });
});

const WORLD = "worlds/generated/forge-7.json";
const GOAL = "glirol";

/** Write a run log by playing the given calls on a fresh game; returns its path. */
function logFor(play: (g: Game) => void): string {
  const path = join(mkdtempSync(join(tmpdir(), "skill-craft-")), "run.jsonl");
  const game = new Game(loadWorld(WORLD), { log: createRunLog(path) });
  play(game);
  return path;
}

const bestCalls = (g: Game) => {
  const best = solve(loadWorld(WORLD), { item: GOAL, qty: 1 });
  if (!best.reachable) throw new Error("unreachable");
  for (const c of best.calls) c.tool === "craft" ? g.craft() : g.place(String(c.args["item"]), Number(c.args["row"]), Number(c.args["col"]));
};

describe("scripts/score.ts", () => {
  it("scores each log against the best run", () => {
    const perfect = logFor(bestCalls);
    const lost = logFor((g) => {
      g.look();
      g.place("doudrur", 0, 0);
      g.place("tepitil", 0, 1);
      g.craft();
    });
    const res = run("scripts/score.ts", ["--world", WORLD, "--goal", GOAL, "--log", perfect, "--log", lost]);
    expect(res.status, res.stderr).toBe(0);
    const out = JSON.parse(res.stdout) as Record<string, any>[];
    expect(out.map((o) => o["log"])).toEqual([perfect, lost]);
    expect(out[0]).toMatchObject({ reached: true, callsToGoal: 3, extraCalls: 0, best: { minCalls: 3 } });
    expect(out[1]).toMatchObject({ reached: false, failedCrafts: 1, extraCalls: null });
  });

  it("exits 1 for a log that does not replay, a missing log, or missing options", () => {
    const bad = logFor(bestCalls);
    writeFileSync(bad, readFileSync(bad, "utf8").replace('"ok":true', '"ok":false'));
    expect(run("scripts/score.ts", ["--world", WORLD, "--goal", GOAL, "--log", bad]).stderr).toContain("does not replay");
    expect(run("scripts/score.ts", ["--world", WORLD, "--goal", GOAL, "--log", bad]).status).toBe(1);
    expect(run("scripts/score.ts", ["--world", WORLD, "--goal", GOAL, "--log", "runs/none.jsonl"]).status).toBe(1);
    expect(run("scripts/score.ts", ["--world", WORLD, "--goal", GOAL]).status).toBe(1);
  });
});

describe("scripts/run-agent.ts", () => {
  it("prints the exact commands for a dry run and creates nothing", () => {
    const out = mkdtempSync(join(tmpdir(), "skill-craft-runs-"));
    const res = run("scripts/run-agent.ts", ["--goal", GOAL, "--runs", "2", "--out", out, "--label", "dry", "--dry-run"]);
    expect(res.status, res.stderr).toBe(0);
    const plan = JSON.parse(res.stdout) as { command: string[]; dir: string }[];
    expect(plan).toHaveLength(2);
    expect(plan[0]?.command).toEqual(expect.arrayContaining(["--strict-mcp-config", "--setting-sources", "project"]));
    expect(existsSync(join(out, "dry"))).toBe(false);
  });

  it("exits 1 for an unknown goal item or world, and for a bad number of runs", () => {
    expect(run("scripts/run-agent.ts", ["--goal", "ghost", "--dry-run"]).stderr).toContain("unknown item 'ghost'");
    expect(run("scripts/run-agent.ts", ["--goal", GOAL, "--world", "worlds/none.json", "--dry-run"]).status).toBe(1);
    expect(run("scripts/run-agent.ts", ["--goal", GOAL, "--runs", "0", "--dry-run"]).status).toBe(1);
    expect(run("scripts/run-agent.ts", []).status).toBe(1);
  });

  it("runs, scores and summarises with a stand-in claude", () => {
    const bin = join(mkdtempSync(join(tmpdir(), "skill-craft-fake-")), "claude");
    writeFileSync(bin, `#!/bin/sh\nexec node --import tsx ${resolve("test/helpers/fake-claude.ts")} "$@"\n`);
    chmodSync(bin, 0o755);
    const out = mkdtempSync(join(tmpdir(), "skill-craft-runs-"));
    const res = run("scripts/run-agent.ts", ["--goal", GOAL, "--runs", "2", "--out", out, "--label", "t", "--claude", bin], { FAKE_CLAUDE_MODE: "solve", FAKE_CLAUDE_GOAL: `${GOAL}:1` });
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain("run 001");
    expect(res.stdout).toContain("2 runs: 2 reached (100%)");
    const summary = JSON.parse(readFileSync(join(out, "t", "summary.json"), "utf8")) as { aggregate: { reached: number } };
    expect(summary.aggregate.reached).toBe(2);
  });
});
