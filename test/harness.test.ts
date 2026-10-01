import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentDriver } from "../src/harness/driver.js";
import { aggregate, buildPrompt, planExperiment, runExperiment, type RunReport } from "../src/harness/run.js";
import { readTrace, type RequestLine, type ToolLine } from "../src/trace/lines.js";
import { FAKE_TOKENS, fakePlayer, type FakePlayerOptions } from "./helpers/fake-player.js";

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

const report = (over: Partial<RunReport> & { reached: boolean; callsToGoal: number; extraCalls: number | null }): RunReport => ({
  index: 1,
  dir: "d",
  ended: "stopped",
  turns: 5,
  costUsd: 0.01,
  durationMs: 1000,
  usage: null,
  requestedModel: null,
  initModel: "m",
  modelsUsed: ["m"],
  text: "",
  measured: { trace: "absent" },
  model: { requested: null, resolved: ["m"] },
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
    reachedSeq: over.reached ? over.callsToGoal : null,
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

  it("lists the models runs used and flags a label that mixes them", () => {
    const same = aggregate([report({ reached: true, callsToGoal: 3, extraCalls: 0 }), report({ reached: true, callsToGoal: 3, extraCalls: 0 })]);
    expect(same).toMatchObject({ models: ["m"], mixedModels: false });
    const mixed = aggregate([
      report({ reached: true, callsToGoal: 3, extraCalls: 0 }),
      report({ reached: true, callsToGoal: 3, extraCalls: 0, model: { requested: null, resolved: ["n"] } }),
    ]);
    expect(mixed).toMatchObject({ models: ["m", "n"], mixedModels: true });
  });

  it("does not count a run with no model as a different model", () => {
    const a = aggregate([report({ reached: true, callsToGoal: 3, extraCalls: 0 }), report({ reached: false, callsToGoal: 0, extraCalls: null, ended: "error", model: { requested: null, resolved: [] } })]);
    expect(a).toMatchObject({ models: ["m"], mixedModels: false });
  });
});

const WORLD = "test/fixtures/valid/mirror-pair.json";
const GOAL = { item: "c", qty: 1 };

const options = (player: FakePlayerOptions = {}, over: Record<string, unknown> = {}) => ({
  world: WORLD,
  goal: GOAL,
  runs: 2,
  maxTurns: 12,
  out: mkdtempSync(join(tmpdir(), "skill-craft-runs-")),
  label: "t",
  record: false,
  driver: fakePlayer({ goal: GOAL, ...player }),
  ...over,
});

const scoreOf = (dir: string) => JSON.parse(readFileSync(join(dir, "score.json"), "utf8")) as Record<string, any>;

describe("runExperiment with a scripted player", () => {
  it("runs, scores, measures and aggregates runs that reach the goal", async () => {
    const out = await runExperiment(options({ mode: "solve" }));
    expect(out.reports).toHaveLength(2);
    expect(out.aggregate).toMatchObject({ runs: 2, reached: 2, successRate: 1, gaveUp: 0 });
    for (const r of out.reports) {
      expect(r.score).toMatchObject({ reached: true, extraCalls: 0 });
      for (const f of ["mcp.json", "run.jsonl", "prompt.txt", "score.json", "trace.jsonl"]) expect(existsSync(join(r.dir, f)), `${r.dir}/${f}`).toBe(true);
      for (const f of ["claude.json", "stderr.txt"]) expect(existsSync(join(r.dir, f)), f).toBe(false);
      const mcp = JSON.parse(readFileSync(join(r.dir, "mcp.json"), "utf8")) as { mcpServers: { craft: { env: Record<string, string> } } };
      expect(mcp.mcpServers.craft.env["SIM_WORLD"]).toContain("mirror-pair.json");
      expect(Object.keys(mcp.mcpServers.craft.env).sort()).toEqual(["SIM_RUN_LOG", "SIM_WORLD"]); // no PATH or other environment in a shareable folder
      expect(readFileSync(join(r.dir, "prompt.txt"), "utf8")).toContain("c");
    }
    expect(new Set(out.reports.map((r) => r.dir)).size).toBe(2); // each run has its own directory, log and trace
    expect(existsSync(join(out.dir, "summary.json"))).toBe(true);
  });

  it("measures the run: a matched trace whose figures equal the scripted tokens", async () => {
    const out = await runExperiment(options({ mode: "solve" }, { runs: 1 }));
    const r = out.reports[0] as RunReport;
    const lines = readTrace(join(r.dir, "trace.jsonl"));
    const requests = lines.filter((l): l is RequestLine => l.kind === "request");
    const tools = lines.filter((l): l is ToolLine => l.kind === "tool");
    expect(tools).toHaveLength(r.score.totalCalls);
    expect(r.measured.trace).toBe("matched");
    expect(r.measured.total).toMatchObject({
      inputTokens: requests.length * FAKE_TOKENS.input,
      outputTokens: requests.length * FAKE_TOKENS.output,
      cacheReadTokens: requests.length * FAKE_TOKENS.cacheRead,
      cacheCreationTokens: requests.length * FAKE_TOKENS.cacheCreation,
      costUsd: 0.01 * requests.length,
    });
    expect(r.measured.toGoal?.inputTokens).toBeLessThan(r.measured.total?.inputTokens ?? 0); // the closing request is not charged to the goal
    expect(scoreOf(r.dir)["measured"]).toEqual(JSON.parse(JSON.stringify(r.measured)));
  });

  it("scores a run that gives up as not reached, and says it stopped", async () => {
    const out = await runExperiment(options({ mode: "wander" }, { runs: 1 }));
    expect(out.reports[0]).toMatchObject({ ended: "stopped" });
    expect(out.reports[0]?.score.reached).toBe(false);
    expect(out.aggregate).toMatchObject({ reached: 0, gaveUp: 1, outOfBudget: 0 });
  });

  it("marks a run that spent its whole budget", async () => {
    const out = await runExperiment(options({ mode: "budget" }, { runs: 1 }));
    expect(out.reports[0]?.ended).toBe("budget");
    expect(out.aggregate).toMatchObject({ outOfBudget: 1, gaveUp: 0 });
  });

  it("records a crashed run as an error with a fixed reason and keeps going", async () => {
    const out = await runExperiment(options({ mode: "crash" }, { runs: 2 }));
    expect(out.aggregate).toMatchObject({ runs: 2, errors: 2, reached: 0 });
    expect(out.reports[0]?.score.totalCalls).toBe(0);
    expect(out.reports[0]).toMatchObject({ ended: "error", reason: "DriverFailed: the player failed" });
    expect(out.reports[0]?.measured.trace).toBe("absent");
    expect(scoreOf(out.reports[0]?.dir as string)["reason"]).toBe("DriverFailed: the player failed");
  });

  it("rejects a goal item the world does not define, before doing anything", async () => {
    const o = options({}, { goal: { item: "ghost", qty: 1 } });
    await expect(runExperiment(o)).rejects.toThrow(/unknown item 'ghost'/);
    expect(existsSync(join(o.out, "t"))).toBe(false);
  });
});

describe("the model a run used", () => {
  it("records no request and the model that ran when none was asked for", async () => {
    const out = await runExperiment(options({ mode: "solve", models: ["fake-a"] }, { runs: 1 }));
    expect(out.reports[0]?.model).toEqual({ requested: null, resolved: ["fake-a"] });
    expect(scoreOf(out.reports[0]?.dir as string)["model"]).toEqual({ requested: null, resolved: ["fake-a"] });
  });

  it("records the requested model beside the one that ran", async () => {
    const out = await runExperiment(options({ mode: "solve", models: ["fake-a"] }, { runs: 1, model: "alias-a" }));
    expect(out.reports[0]?.model).toEqual({ requested: "alias-a", resolved: ["fake-a"] });
  });

  it("lists both models for a run that used two", async () => {
    const out = await runExperiment(options({ mode: "solve", models: ["fake-a", "fake-b"] }, { runs: 1 }));
    expect(out.reports[0]?.model.resolved).toEqual(["fake-a", "fake-b"]);
  });

  it("flags a label whose runs used different models, in the summary and the aggregate", async () => {
    let n = 0;
    const alternating: AgentDriver = (o, s) => fakePlayer({ mode: "solve", goal: GOAL, models: [n++ % 2 === 0 ? "fake-a" : "fake-b"] })(o, s);
    const out = await runExperiment(options({}, { driver: alternating }));
    expect(out.aggregate).toMatchObject({ models: ["fake-a", "fake-b"], mixedModels: true });
    const summary = JSON.parse(readFileSync(join(out.dir, "summary.json"), "utf8")) as Record<string, any>;
    expect(summary["mixedModels"]).toBe(true);
    expect(summary["models"]).toEqual(["fake-a", "fake-b"]);
  });

  it("still records the requested model and no resolved model for a crashed run", async () => {
    const out = await runExperiment(options({ mode: "crash" }, { runs: 1, model: "alias-a" }));
    expect(out.reports[0]?.model).toEqual({ requested: "alias-a", resolved: [] });
  });
});

describe("planExperiment (dry run)", () => {
  it("lists the exact options for each run and creates nothing", () => {
    const o = options({}, { runs: 2 });
    const plan = planExperiment(o);
    expect(plan).toHaveLength(2);
    expect(plan[0]?.options.tools).toEqual([]);
    expect(plan[0]?.options.allowedTools).toEqual(["mcp__craft"]);
    expect(plan[0]?.options.strictMcpConfig).toBe(true);
    expect(plan[0]?.options).not.toHaveProperty("hooks");
    expect(JSON.stringify(plan)).not.toContain(process.env["PATH"] as string); // the operator's PATH is never printed
    const craft = plan[0]?.options.mcpServers?.["craft"] as { env: Record<string, string> };
    expect(Object.keys(craft.env).sort()).toEqual(["SIM_RUN_LOG", "SIM_WORLD"]);
    expect(plan[0]?.options).not.toHaveProperty("abortController");
    expect(plan[0]?.runLog).not.toBe(plan[1]?.runLog);
    expect(existsSync(plan[0]?.dir as string)).toBe(false);
  });
});

describe("what the trace says about a run, at the harness level", () => {
  it("scores a silent run on calls alone, with an absent trace and no error", async () => {
    const out = await runExperiment(options({ mode: "silent" }, { runs: 1 }));
    const r = out.reports[0] as RunReport;
    expect(r).toMatchObject({ ended: "stopped" });
    expect(r.measured).toEqual({ trace: "absent" });
    expect(r.score.totalCalls).toBeGreaterThan(0);
    expect(r.score.reached).toBe(false);
  });

  it("marks a run whose player lost one tool hook as a mismatch, and leaves the score alone", async () => {
    const good = await runExperiment(options({ mode: "solve" }, { runs: 1 }));
    const lossy = await runExperiment(options({ mode: "solve", dropToolEnd: 1 }, { runs: 1 }));
    const r = lossy.reports[0] as RunReport;
    expect(r.measured.trace).toBe("mismatch");
    expect(r.measured.reason).toMatch(/^tool count: log \d+, trace \d+$/);
    expect(r.measured).not.toHaveProperty("total");
    expect(r.score).toEqual(good.reports[0]?.score); // every call-based figure is unchanged
  });

  it("marks a run that timed out after writing some lines as an error with a mismatch trace", async () => {
    const out = await runExperiment(options({ mode: "hang" }, { runs: 1, timeoutMs: 80 }));
    const r = out.reports[0] as RunReport;
    expect(r).toMatchObject({ ended: "error" });
    expect(r.reason).toMatch(/^RunTimedOut/);
    expect(r.measured).toEqual({ trace: "mismatch", reason: "run ended without a result" });
  });

  it("counts malformed messages from the player and flags the trace", async () => {
    const noisy: AgentDriver = async (o, sink) => {
      const done = await fakePlayer({ mode: "solve", goal: GOAL })(o, sink);
      sink.onMessage({ type: "stream_event", event: { type: "message_start", message: {} } }); // no id: malformed
      return done;
    };
    const out = await runExperiment(options({}, { driver: noisy, runs: 1 }));
    expect(out.reports[0]?.measured).toEqual({ trace: "mismatch", reason: "1 malformed item skipped" });
  });
});
