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
  const run = (argv: string[]) => runAgentCli(["--world", WORLD, "--out", dir, ...argv], { driver, ...(signal ? { signal } : {}), out: (s) => out.push(s), err: (s) => err.push(s) });
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
