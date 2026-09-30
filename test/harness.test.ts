import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { aggregate, buildPrompt, claudeArgs, mcpConfigFor, parseClaudeResult, planExperiment, runExperiment, type RunReport } from "../src/harness/run.js";

describe("buildPrompt", () => {
  it("gives the goal, forbids questions, states the budget, and names no world detail", () => {
    const p = buildPrompt({ item: "glirol", qty: 1 }, 40);
    expect(p).toContain("glirol");
    expect(p).toMatch(/do not ask/i);
    expect(p).toContain("40 turns");
    expect(p).toMatch(/irreversible/);
    expect(p).not.toMatch(/recipe|shapeless|shaped|lugli/i);
  });

  it("states the quantity when it is more than one", () => {
    expect(buildPrompt({ item: "x", qty: 3 }, 10)).toContain("3 of x");
  });
});

describe("claudeArgs", () => {
  const base = { prompt: "go", mcpConfig: "cfg.json", maxTurns: 25, record: false };

  it("removes built-in tools, isolates settings and pre-approves only the craft server", () => {
    const args = claudeArgs(base);
    expect(args.slice(0, 2)).toEqual(["-p", "go"]);
    expect(args).toEqual(expect.arrayContaining(["--strict-mcp-config", "--no-session-persistence", "--output-format", "json"]));
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args[args.indexOf("--allowedTools") + 1]).toBe("mcp__craft");
    expect(args[args.indexOf("--mcp-config") + 1]).toBe("cfg.json");
    expect(args[args.indexOf("--max-turns") + 1]).toBe("25");
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("project");
  });

  it("lets user settings (and so nams-hooks) apply only when recording is asked for", () => {
    expect(claudeArgs({ ...base, record: true })).not.toContain("--setting-sources");
  });

  it("passes a model only when one is given", () => {
    expect(claudeArgs(base)).not.toContain("--model");
    const args = claudeArgs({ ...base, model: "sonnet" });
    expect(args[args.indexOf("--model") + 1]).toBe("sonnet");
  });
});

describe("mcpConfigFor", () => {
  it("points the craft server at a world and a fresh run log", () => {
    const cfg = mcpConfigFor("worlds/x.json", "/abs/run.jsonl") as { mcpServers: { craft: { env: Record<string, string> } } };
    expect(cfg.mcpServers.craft.env).toEqual({ SIM_WORLD: "worlds/x.json", SIM_RUN_LOG: "/abs/run.jsonl" });
  });
});

describe("parseClaudeResult", () => {
  it("reads a normal finish", () => {
    expect(parseClaudeResult('{"subtype":"success","is_error":false,"num_turns":7,"total_cost_usd":0.02,"result":"done"}')).toEqual({
      ended: "stopped", turns: 7, costUsd: 0.02, text: "done",
    });
  });

  it("recognises a spent budget, which the real CLI reports as an error result", () => {
    expect(parseClaudeResult('{"subtype":"error_max_turns","is_error":false,"num_turns":40}').ended).toBe("budget");
    expect(parseClaudeResult('{"subtype":"error_max_turns","is_error":true,"num_turns":11,"terminal_reason":"max_turns"}').ended).toBe("budget");
  });

  it("skips a warning line before the JSON", () => {
    const out = 'Warning: no stdin data received in 3s\n{"subtype":"success","num_turns":2,"result":"ok"}';
    expect(parseClaudeResult(out)).toMatchObject({ ended: "stopped", turns: 2 });
  });

  it("reports an error for output it cannot read or an error result", () => {
    expect(parseClaudeResult("not json").ended).toBe("error");
    expect(parseClaudeResult('{"subtype":"success","is_error":true}').ended).toBe("error");
    expect(parseClaudeResult("").ended).toBe("error");
  });
});

const report = (over: Partial<RunReport> & { reached: boolean; callsToGoal: number; extraCalls: number | null }): RunReport => ({
  index: 1,
  dir: "d",
  ended: "stopped",
  turns: 5,
  costUsd: 0.01,
  text: "",
  score: {
    goal: { item: "x", qty: 1 },
    reached: over.reached,
    totalCalls: 10,
    actionCalls: over.callsToGoal,
    callsToGoal: over.callsToGoal,
    craftsMade: 1,
    failedCrafts: 0,
    refusals: { cell_occupied: 1 },
    best: { minCrafts: 1, minCalls: 3, slack: 2 },
    extraCalls: over.extraCalls,
    extraCrafts: over.reached ? 0 : null,
  },
  ...over,
});

describe("aggregate", () => {
  it("separates success, giving up, running out of budget and errors", () => {
    const a = aggregate([
      report({ reached: true, callsToGoal: 3, extraCalls: 0 }),
      report({ reached: true, callsToGoal: 9, extraCalls: 6 }),
      report({ reached: false, callsToGoal: 20, extraCalls: null, ended: "stopped" }),
      report({ reached: false, callsToGoal: 40, extraCalls: null, ended: "budget" }),
      report({ reached: false, callsToGoal: 0, extraCalls: null, ended: "error" }),
    ]);
    expect(a).toMatchObject({ runs: 5, reached: 2, successRate: 0.4, gaveUp: 1, outOfBudget: 1, errors: 1 });
    expect(a.medianCallsToGoal).toBe(6);
    expect(a.meanExtraCalls).toBe(3);
    expect(a.totalCostUsd).toBeCloseTo(0.05);
  });

  it("handles no successes and no runs", () => {
    expect(aggregate([report({ reached: false, callsToGoal: 5, extraCalls: null })])).toMatchObject({ reached: 0, medianCallsToGoal: null, meanExtraCalls: null });
    expect(aggregate([])).toMatchObject({ runs: 0, successRate: 0 });
  });
});

/** An executable that stands in for `claude`, running test/helpers/fake-claude.ts. */
function fakeClaude(): string {
  const path = join(mkdtempSync(join(tmpdir(), "skill-craft-fake-")), "claude");
  writeFileSync(path, `#!/bin/sh\nexec node --import tsx ${resolve("test/helpers/fake-claude.ts")} "$@"\n`);
  chmodSync(path, 0o755);
  return path;
}

const options = (over: Record<string, unknown> = {}) => ({
  world: "test/fixtures/valid/mirror-pair.json",
  goal: { item: "c", qty: 1 },
  runs: 2,
  maxTurns: 12,
  out: mkdtempSync(join(tmpdir(), "skill-craft-runs-")),
  label: "t",
  record: false,
  claudeBin: fakeClaude(),
  ...over,
});

describe("runExperiment with a stand-in claude", () => {
  it("runs, scores and aggregates a run that reaches the goal", () => {
    process.env["FAKE_CLAUDE_MODE"] = "solve";
    process.env["FAKE_CLAUDE_GOAL"] = "c:1";
    const o = options();
    const out = runExperiment(o);
    expect(out.reports).toHaveLength(2);
    expect(out.aggregate).toMatchObject({ runs: 2, reached: 2, successRate: 1, gaveUp: 0 });
    for (const r of out.reports) {
      expect(r.score).toMatchObject({ reached: true, extraCalls: 0 });
      for (const f of ["mcp.json", "run.jsonl", "claude.json", "prompt.txt", "score.json", "argv.json"]) {
        expect(existsSync(join(r.dir, f)), `${r.dir}/${f}`).toBe(true);
      }
      const argv = JSON.parse(readFileSync(join(r.dir, "argv.json"), "utf8")) as string[];
      expect(argv).toContain("--strict-mcp-config");
      expect(argv[argv.indexOf("--tools") + 1]).toBe("");
      expect(readFileSync(join(r.dir, "prompt.txt"), "utf8")).toContain("c");
    }
    expect(new Set(out.reports.map((r) => r.dir)).size).toBe(2); // each run has its own directory and log
    expect(existsSync(join(out.dir, "summary.json"))).toBe(true);
  });

  it("scores a run that gives up as not reached, and says it stopped", () => {
    process.env["FAKE_CLAUDE_MODE"] = "wander";
    const out = runExperiment(options({ runs: 1 }));
    expect(out.reports[0]).toMatchObject({ ended: "stopped" });
    expect(out.reports[0]?.score.reached).toBe(false);
    expect(out.aggregate).toMatchObject({ reached: 0, gaveUp: 1, outOfBudget: 0 });
  });

  it("marks a run that spent its whole budget", () => {
    process.env["FAKE_CLAUDE_MODE"] = "budget";
    const out = runExperiment(options({ runs: 1 }));
    expect(out.reports[0]?.ended).toBe("budget");
    expect(out.aggregate).toMatchObject({ outOfBudget: 1, gaveUp: 0 });
  });

  it("records a crashed run as an error and keeps going", () => {
    process.env["FAKE_CLAUDE_MODE"] = "crash";
    const out = runExperiment(options({ runs: 2 }));
    expect(out.aggregate).toMatchObject({ runs: 2, errors: 2, reached: 0 });
    expect(out.reports[0]?.score.totalCalls).toBe(0);
  });

  it("rejects a goal item the world does not define", () => {
    expect(() => runExperiment(options({ goal: { item: "ghost", qty: 1 } }))).toThrow(/unknown item 'ghost'/);
  });
});

describe("planExperiment (dry run)", () => {
  it("lists the exact commands and creates nothing", () => {
    const o = options({ runs: 2 });
    const plan = planExperiment(o);
    expect(plan).toHaveLength(2);
    expect(plan[0]?.command[0]).toBe(o.claudeBin);
    expect(plan[0]?.command).toContain("--strict-mcp-config");
    expect(plan[0]?.runLog).not.toBe(plan[1]?.runLog);
    expect(existsSync(plan[0]?.dir as string)).toBe(false);
  });
});
