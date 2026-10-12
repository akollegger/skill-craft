import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentDriver } from "../src/harness/driver.js";
import { runAgentCli } from "../src/harness/cli.js";
import { fakePlayer } from "./helpers/fake-player.js";

const GOAL = { item: "c", qty: 1 };
const WORLD = "test/fixtures/valid/mirror-pair.json";

function harness(driver: AgentDriver = fakePlayer({ mode: "solve", goal: GOAL }), signal?: AbortSignal) {
  const out: string[] = [];
  const err: string[] = [];
  const dir = mkdtempSync(join(tmpdir(), "skill-craft-cli-"));
  // No test reaches the network for a price: a model has none unless a test gives it one.
  const run = (argv: string[]) => runAgentCli(["--world", WORLD, "--out", dir, ...argv], { driver, pricing: async () => undefined, ...(signal ? { signal } : {}), out: (s) => out.push(s), err: (s) => err.push(s) });
  return { run, out, err, dir };
}

describe("runAgentCli", () => {
  it("runs, prints one line per run with the model, time and tokens, and returns 0", async () => {
    const h = harness(fakePlayer({ mode: "solve", goal: GOAL, models: ["fake-a"] }));
    expect(await h.run(["--goal", "c", "--runs", "1", "--label", "a"])).toBe(0);
    const text = h.out.join("\n");
    expect(text).toMatch(/run 001\s+reached/);
    expect(text).toContain("fake-a");
    expect(text).toMatch(/\d+(\.\d+)? s/);
    expect(text).toMatch(/tokens/);
    expect(text).toContain("files:");
    expect(h.err).toEqual([]);
  });

  it("passes --timeout-minutes to the run", async () => {
    const h = harness(fakePlayer({ mode: "hang", goal: GOAL }));
    expect(await h.run(["--goal", "c", "--runs", "1", "--label", "t", "--timeout-minutes", "0.001"])).toBe(0);
    expect(h.out.join("\n")).toMatch(/ended error/);
    const summary = JSON.parse(readFileSync(join(h.dir, "t", "summary.json"), "utf8")) as { runs: { reason: string }[] };
    expect(summary.runs[0]?.reason).toMatch(/^RunTimedOut/);
  });

  it("rejects a timeout that is not finite, is not positive, or is beyond what a timer can hold", async () => {
    const h = harness();
    for (const bad of ["Infinity", "-1", "0", "abc", "1e9"]) {
      expect(await h.run(["--goal", "c", "--runs", "1", "--label", "t", "--timeout-minutes", bad, "--dry-run"]), bad).toBe(1);
    }
    expect(h.err.join("\n")).toMatch(/--timeout-minutes must be/);
    expect(await h.run(["--goal", "c", "--runs", "1", "--label", "ok", "--timeout-minutes", "35000", "--dry-run"])).toBe(0);
  });

  it("passes the limit options to the driver and shows them in the dry-run plan", async () => {
    let seen: unknown;
    const h = harness((o, sink) => {
      seen = o.limits;
      return fakePlayer({ mode: "solve", goal: GOAL })(o, sink);
    });
    const argv = ["--goal", "c", "--runs", "1", "--step-timeout-seconds", "90", "--tool-timeout-seconds", "10", "--max-output-tokens", "4000", "--max-total-tokens", "250000"];
    expect(await h.run([...argv, "--label", "l"])).toBe(0);
    expect(seen).toEqual({ stepTimeoutMs: 90_000, toolTimeoutMs: 10_000, maxOutputTokens: 4000, maxTotalTokens: 250_000 });
    const plan = harness();
    expect(await plan.run([...argv, "--dry-run"])).toBe(0);
    expect(JSON.parse(plan.out.join("\n"))[0].options.limits).toMatchObject({ stepTimeoutMs: 90_000, toolTimeoutMs: 10_000, maxTotalTokens: 250_000, maxUsd: null });
  });

  it("refuses a limit that is not a positive number, and a dollar cap for a model with no price, before any run", async () => {
    for (const bad of [["--max-usd", "0"], ["--max-total-tokens", "1.5"], ["--step-timeout-seconds=-1"], ["--max-output-tokens", "abc"]]) {
      const h = harness();
      expect(await h.run(["--goal", "c", "--label", "b", ...bad])).toBe(1);
      expect(h.err.join("\n")).toMatch(/must be/);
    }
    const h = harness();
    expect(await h.run(["--goal", "c", "--label", "u", "--model", "fireworks/gpt-oss-120b", "--max-usd", "1"])).toBe(1);
    expect(h.err.join("\n")).toContain("has no price");
    expect(existsSync(join(h.dir, "u"))).toBe(false);
  });

  it("passes --skill to the runs and says on each line when the agent loaded it", async () => {
    const driver: AgentDriver = async (o, s) => ({ ...(await fakePlayer({ mode: "solve", goal: GOAL })(o, s)), skillInvoked: true, skillLoadedAfterCalls: 7 });
    const h = harness(driver);
    expect(await h.run(["--goal", "c", "--runs", "1", "--label", "sk", "--skill", "spikes/skill-pilot/craft-glirol"])).toBe(0);
    expect(h.out.join("\n")).toMatch(/skill craft-glirol \(loaded after 7 calls\)/);
    expect(await h.run(["--goal", "c", "--runs", "1", "--label", "sk2", "--skill", "test/fixtures"])).toBe(1);
    expect(h.err.join("\n")).toMatch(/cannot use the skill/);
  });

  it("prints the dry-run plan and creates nothing", async () => {
    const h = harness();
    expect(await h.run(["--goal", "c", "--runs", "2", "--label", "d", "--dry-run"])).toBe(0);
    const plan = JSON.parse(h.out.join("\n")) as unknown[];
    expect(plan).toHaveLength(2);
    expect(existsSync(join(h.dir, "d"))).toBe(false);
  });

  it("reports a user error by class, not by text: a used label returns 1 and prints the message", async () => {
    const h = harness();
    expect(await h.run(["--goal", "c", "--runs", "1", "--label", "x"])).toBe(0);
    expect(await h.run(["--goal", "c", "--runs", "1", "--label", "x"])).toBe(1);
    expect(h.err.join("\n")).toContain("already exists; choose a new --label");
  });

  it("returns 1 for an unknown goal item, a missing goal and a bad option", async () => {
    const h = harness();
    expect(await h.run(["--goal", "ghost", "--dry-run"])).toBe(1);
    expect(h.err.join("\n")).toContain("unknown item 'ghost'");
    expect(await h.run([])).toBe(1);
    expect(h.err.join("\n")).toMatch(/usage/i);
    expect(await h.run(["--goal", "c", "--runs", "0", "--dry-run"])).toBe(1);
    expect(await h.run(["--goal", "c", "--nonsense"])).toBe(1);
  });

  it("returns 1 for a world that does not exist", async () => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runAgentCli(["--world", "worlds/none.json", "--goal", "c", "--dry-run"], { driver: fakePlayer(), out: (s) => out.push(s), err: (s) => err.push(s) });
    expect(code).toBe(1);
    expect(err.length).toBeGreaterThan(0);
  });

  it("prints only the code for an unexpected error", async () => {
    const h = harness(fakePlayer({ mode: "solve", goal: GOAL }));
    const code = await runAgentCli(["--world", WORLD, "--out", h.dir, "--goal", "c", "--label", "u"], {
      driver: fakePlayer({ mode: "solve", goal: GOAL }),
      out: () => { throw new Error("/Users/someone/secret-path"); },
      err: (s) => h.err.push(s),
    });
    expect(code).toBe(1);
    expect(h.err.join("\n")).not.toContain("secret-path");
  });

  it("records the current run, writes the summary and returns 130 when cancelled mid-run", async () => {
    const stop = new AbortController();
    const driver: AgentDriver = (o, s) => {
      setTimeout(() => stop.abort(), 50);
      return fakePlayer({ mode: "hang", goal: GOAL })(o, s);
    };
    const h = harness(driver, stop.signal);
    expect(await h.run(["--goal", "c", "--runs", "3", "--label", "c"])).toBe(130);
    expect(existsSync(join(h.dir, "c", "summary.json"))).toBe(true);
    expect(existsSync(join(h.dir, "c", "002"))).toBe(false);
  });

  it("warns when a label mixes models", async () => {
    let n = 0;
    const driver: AgentDriver = (o, s) => fakePlayer({ mode: "solve", goal: GOAL, models: [n++ % 2 === 0 ? "fake-a" : "fake-b"] })(o, s);
    const h = harness(driver);
    expect(await h.run(["--goal", "c", "--runs", "2", "--label", "m"])).toBe(0);
    expect(h.out.join("\n")).toMatch(/warning.*different models.*fake-a.*fake-b/i);
  });
});

describe("the price, resolved before any run (spec 007 FR-048)", () => {
  const QUOTE = { source: "market-quote" as const, openRouterId: "anthropic/claude-haiku-4.5", fetchedAt: "2026-10-12T12:00:00.000Z", perMillion: { input: 1, output: 5 } };
  const cli = (driver: AgentDriver, pricing: (spec: string) => Promise<typeof QUOTE | undefined>) => {
    const out: string[] = [];
    const err: string[] = [];
    const dir = mkdtempSync(join(tmpdir(), "skill-craft-cli-"));
    const run = (argv: string[]) => runAgentCli(["--world", WORLD, "--out", dir, ...argv], { driver, pricing, out: (s) => out.push(s), err: (s) => err.push(s) });
    return { run, out, err, dir };
  };

  it("hands the player the price it resolved for the model, by its canonical spec", async () => {
    let seen: unknown;
    let asked = "";
    const h = cli((o, s) => { seen = o.price; return fakePlayer({ mode: "solve", goal: GOAL })(o, s); }, async (spec) => { asked = spec; return QUOTE; });
    expect(await h.run(["--goal", "c", "--runs", "1", "--label", "p", "--model", "claude-haiku-4-5-20251001"])).toBe(0);
    expect(asked).toBe("anthropic/claude-haiku-4-5-20251001");
    expect(seen).toEqual(QUOTE);
  });

  it("runs with no price at all when none can be resolved, and a dollar limit is then refused before any run", async () => {
    let called = 0;
    const h = cli((o, s) => { called++; return fakePlayer({ mode: "solve", goal: GOAL })(o, s); }, async () => undefined);
    expect(await h.run(["--goal", "c", "--runs", "1", "--label", "a", "--model", "fireworks/gpt-oss-120b"])).toBe(0);
    expect(called).toBe(1);
    const g = cli((o, s) => { called++; return fakePlayer({ mode: "solve", goal: GOAL })(o, s); }, async () => undefined);
    expect(await g.run(["--goal", "c", "--runs", "1", "--label", "b", "--model", "fireworks/gpt-oss-120b", "--max-usd", "1"])).toBe(1);
    expect(g.err.join("\n")).toContain("has no price");
    expect(called).toBe(1); // the second command never reached the player
    expect(existsSync(join(g.dir, "b"))).toBe(false);
  });

  it("accepts a dollar limit when a price was resolved, even for a model with no pin", async () => {
    const h = cli(fakePlayer({ mode: "solve", goal: GOAL }), async () => QUOTE);
    expect(await h.run(["--goal", "c", "--runs", "1", "--label", "m", "--model", "fireworks/gpt-oss-120b", "--max-usd", "1"])).toBe(0);
  });

  it("shows the price source in the dry-run plan, and null when there is none", async () => {
    const priced = cli(fakePlayer({ mode: "solve", goal: GOAL }), async () => QUOTE);
    expect(await priced.run(["--goal", "c", "--runs", "1", "--dry-run", "--model", "claude-haiku-4-5-20251001"])).toBe(0);
    expect(JSON.parse(priced.out.join("\n"))[0].options.price).toMatchObject({ source: "market-quote", openRouterId: "anthropic/claude-haiku-4.5" });
    const none = cli(fakePlayer({ mode: "solve", goal: GOAL }), async () => undefined);
    expect(await none.run(["--goal", "c", "--runs", "1", "--dry-run", "--model", "fireworks/gpt-oss-120b"])).toBe(0);
    expect(JSON.parse(none.out.join("\n"))[0].options.price).toBeNull();
  });
});
