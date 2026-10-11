import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DriverAborted, type AgentDriver, type PlayerResult } from "../src/harness/driver.js";
import { LimitRefused, isUserError } from "../src/harness/errors.js";
import { planExperiment, runExperiment } from "../src/harness/run.js";
import { fakePlayer } from "./helpers/fake-player.js";

const GOAL = { item: "c", qty: 1 };
const options = (driver: AgentDriver, over: Record<string, unknown> = {}) => ({
  world: "test/fixtures/valid/mirror-pair.json",
  goal: GOAL,
  runs: 1,
  maxTurns: 12,
  out: mkdtempSync(join(tmpdir(), "skill-craft-limits-")),
  label: "t",
  driver,
  ...over,
});
const scoreOf = (dir: string) => JSON.parse(readFileSync(join(dir, "score.json"), "utf8")) as Record<string, unknown>;

const partial: PlayerResult = {
  ended: "error", reason: "x", turns: 7, costUsd: 0.42, durationMs: 90, usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 5000, cacheCreationTokens: 0 },
  requestedModel: "claude-haiku-4-5-20251001", initModel: "anthropic/claude-haiku-4-5-20251001", modelsUsed: ["anthropic/claude-haiku-4-5-20251001"], text: "", retries: { max: 2, failedAttempts: 1 },
};
const abortsWith = (p: PlayerResult): AgentDriver => (o) => new Promise((_, reject) => o.signal.addEventListener("abort", () => reject(new DriverAborted(p))));

describe("a run that times out or is cancelled after spending", () => {
  it("keeps the turns, tokens, cost and retries it had, under the fixed timeout reason", async () => {
    const out = await runExperiment(options(abortsWith(partial), { timeoutMs: 80 }));
    const r = out.reports[0];
    expect(r).toMatchObject({ ended: "error", turns: 7, costUsd: 0.42, usage: { inputTokens: 1000 }, retries: { max: 2, failedAttempts: 1 } });
    expect(r?.reason).toMatch(/^RunTimedOut: /);
    expect(scoreOf(r?.dir as string)).toMatchObject({ turns: 7, costUsd: 0.42, retries: { failedAttempts: 1 } });
    expect(out.aggregate).toMatchObject({ totalCostUsd: 0.42, pricedRuns: 1, unpricedRuns: 0 }); // the spend is in the totals
    expect(r?.model.resolved).toEqual(["anthropic/claude-haiku-4-5-20251001"]);
  });

  it("does the same for a cancelled experiment, under the cancellation reason", async () => {
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 50);
    const out = await runExperiment(options(abortsWith(partial), { signal: stop.signal }));
    expect(out.reports[0]).toMatchObject({ turns: 7, costUsd: 0.42 });
    expect(out.reports[0]?.reason).toMatch(/^RunCancelled: /);
  });

  it("still records nothing for a driver that rejects without a partial, as before", async () => {
    const driver: AgentDriver = (o, s) => fakePlayer({ mode: "hang", goal: GOAL })(o, s);
    const out = await runExperiment(options(driver, { timeoutMs: 80 }));
    expect(out.reports[0]).toMatchObject({ turns: null, costUsd: null });
  });
});

describe("limits", () => {
  it("are passed to the driver and written to score.json, with the defaults filled in", async () => {
    let seen: unknown;
    const driver: AgentDriver = (o, s) => {
      seen = o.limits;
      return fakePlayer({ mode: "solve", goal: GOAL })(o, s);
    };
    const out = await runExperiment(options(driver, { limits: { maxTotalTokens: 5000 } }));
    expect(seen).toMatchObject({ maxTotalTokens: 5000 });
    expect(scoreOf(out.reports[0]?.dir as string)).toMatchObject({ limits: { maxTotalTokens: 5000, maxUsd: null, maxOutputTokens: null, stepTimeoutMs: 300_000, toolTimeoutMs: 60_000 } });
  });

  it("refuse a dollar cap for a model with no price, before anything is created", async () => {
    const o = options(fakePlayer({ mode: "solve", goal: GOAL }), { model: "fireworks/gpt-oss-120b", limits: { maxUsd: 1 } });
    await expect(runExperiment(o)).rejects.toBeInstanceOf(LimitRefused);
    expect(existsSync(join(o.out, o.label))).toBe(false);
    expect(() => planExperiment(o)).toThrow(LimitRefused);
    expect(isUserError(new LimitRefused("fireworks/gpt-oss-120b", "maxUsd"))).toBe(true);
  });

  it("accept a token cap for a model with no price, and a dollar cap for one with a price", async () => {
    const solve = fakePlayer({ mode: "solve", goal: GOAL });
    await expect(runExperiment(options(solve, { model: "fireworks/gpt-oss-120b", limits: { maxTotalTokens: 1000 } }))).resolves.toBeDefined();
    await expect(runExperiment(options(solve, { model: "claude-haiku-4-5-20251001", limits: { maxUsd: 1 } }))).resolves.toBeDefined();
  });

  it("record the invalid tool calls a player counted, and nothing for one that did not count", async () => {
    const counting: AgentDriver = async (o, s) => ({ ...(await fakePlayer({ mode: "solve", goal: GOAL })(o, s)), invalidToolCalls: 3 });
    const a = await runExperiment(options(counting));
    expect(scoreOf(a.reports[0]?.dir as string)).toMatchObject({ invalidToolCalls: 3 });
    const b = await runExperiment(options(fakePlayer({ mode: "solve", goal: GOAL })));
    expect(scoreOf(b.reports[0]?.dir as string)).not.toHaveProperty("invalidToolCalls");
  });
});
