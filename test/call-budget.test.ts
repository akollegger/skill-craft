// The call budget as a run states, records and ends it (spec 008, FR-009 to FR-014).
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAgentCli } from "../src/harness/cli.js";
import type { AgentDriver } from "../src/harness/driver.js";
import { runExperiment, settleEnd } from "../src/harness/run.js";
import { fakePlayer } from "./helpers/fake-player.js";

const GOAL = { item: "c", qty: 1 };
const WORLD = "test/fixtures/valid/mirror-pair.json";
const TEMPLATE = "Hold {what} ({item}). You have {budget} tool calls in total.";
const score = (dir: string) => JSON.parse(readFileSync(join(dir, "score.json"), "utf8"));
const options = (over: Record<string, unknown> = {}) => ({
  world: WORLD, goal: GOAL, runs: 1, maxTurns: 100, callBudget: 100, promptTemplate: TEMPLATE,
  out: mkdtempSync(join(tmpdir(), "skill-craft-budget-")), label: "b", ...over,
});
const asBudget = (inner: AgentDriver, refused: number): AgentDriver => async (o, s) => ({ ...(await inner(o, s)), ended: "budget", budgetRefused: refused });

describe("how a call-budget run ends (FR-013)", () => {
  it("is stopped when the goal is held, budget when it is not, and an error stays an error", () => {
    expect(settleEnd("budget", "calls", true)).toBe("stopped");
    expect(settleEnd("budget", "calls", false)).toBe("budget");
    expect(settleEnd("error", "calls", true)).toBe("error");
    expect(settleEnd("stopped", "calls", false)).toBe("stopped");
    expect(settleEnd("budget", "steps", true)).toBe("budget"); // a step budget is as it was
  });
});

describe("a run under a call budget", () => {
  it("states the budget in the prompt, records it and the refusals, and reads a goal reached on the last call as stopped", async () => {
    const out = await runExperiment(options({ driver: asBudget(fakePlayer({ mode: "solve", goal: GOAL }), 2) }));
    const r = out.reports[0]!;
    expect(r.ended).toBe("stopped");
    expect(readFileSync(join(r.dir, "prompt.txt"), "utf8")).toContain("You have 100 tool calls in total.");
    expect(score(r.dir)).toMatchObject({ ended: "stopped", budget: { kind: "calls", limit: 100 }, budgetRefused: 2 });
    expect(score(r.dir).prompt.version).toBe("custom");
    const summary = JSON.parse(readFileSync(join(out.dir, "summary.json"), "utf8"));
    expect(summary).toMatchObject({ budget: { kind: "calls", limit: 100 }, callBudget: 100 });
    expect(summary).not.toHaveProperty("maxTurns");
  });

  it("stays a budget end when the goal is not held", async () => {
    const out = await runExperiment(options({ driver: asBudget(fakePlayer({ mode: "wander", goal: GOAL }), 0) }));
    expect(out.reports[0]!.ended).toBe("budget");
  });

  it("keeps a score's call counts as they were: the total and the table-changing calls", async () => {
    const out = await runExperiment(options({ driver: fakePlayer({ mode: "solve", goal: GOAL }) }));
    const s = score(out.reports[0]!.dir).score;
    expect(s.totalCalls).toBeGreaterThan(0);
    expect(s.actionCalls).toBeLessThanOrEqual(s.totalCalls);
  });

  it("is refused before any call when the prompt states steps, or states calls and none is given", async () => {
    await expect(runExperiment(options({ promptTemplate: "Hold {what} in {turns}." }))).rejects.toThrow(/step budget/);
    await expect(runExperiment(options({ callBudget: undefined }))).rejects.toThrow(/call budget/);
  });
});

describe("the command (FR-009)", () => {
  const harness = () => {
    const out: string[] = [];
    const err: string[] = [];
    const dir = mkdtempSync(join(tmpdir(), "skill-craft-budget-cli-"));
    const run = (argv: string[]) => runAgentCli(["--world", WORLD, "--out", dir, "--goal", "c", ...argv], { driver: fakePlayer({ mode: "solve", goal: GOAL }), pricing: async () => undefined, out: (s) => out.push(s), err: (s) => err.push(s) });
    return { run, out, err, dir };
  };
  const template = (text: string) => {
    const path = join(mkdtempSync(join(tmpdir(), "skill-craft-tpl-")), "t.txt");
    writeFileSync(path, text);
    return path;
  };

  it("runs a {budget} prompt with --call-budget, and shows the budget on the run's line", async () => {
    const h = harness();
    expect(await h.run(["--label", "a", "--prompt-file", template(TEMPLATE), "--call-budget", "50"])).toBe(0);
    expect(h.out.join("\n")).toMatch(/budget calls 50/);
  });

  it("refuses a {budget} prompt with only --max-turns, a {turns} prompt with --call-budget, and both flags", async () => {
    const h = harness();
    expect(await h.run(["--label", "a", "--prompt-file", template(TEMPLATE), "--max-turns", "20"])).toBe(1);
    expect(h.err.join("\n")).toMatch(/call budget/);
    expect(await h.run(["--label", "b", "--call-budget", "50"])).toBe(1);
    expect(h.err.join("\n")).toMatch(/step budget/);
    expect(await h.run(["--label", "c", "--prompt-file", template(TEMPLATE), "--call-budget", "50", "--max-turns", "20"])).toBe(1);
    expect(h.err.join("\n")).toMatch(/not both/);
  });
});
