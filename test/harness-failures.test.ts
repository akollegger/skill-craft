import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentDriver, PlayerResult } from "../src/harness/driver.js";
import { RunFolderExists } from "../src/harness/errors.js";
import { runExperiment } from "../src/harness/run.js";
import { fakePlayer, type FakePlayerOptions } from "./helpers/fake-player.js";

const GOAL = { item: "c", qty: 1 };
const options = (driver: AgentDriver, over: Record<string, unknown> = {}) => ({
  world: "test/fixtures/valid/mirror-pair.json",
  goal: GOAL,
  runs: 2,
  maxTurns: 12,
  out: mkdtempSync(join(tmpdir(), "skill-craft-fail-")),
  label: "t",
  record: false,
  driver,
  ...over,
});
const player = (p: FakePlayerOptions) => fakePlayer({ goal: GOAL, ...p });
const empty: PlayerResult = { ended: "stopped", turns: null, costUsd: null, durationMs: null, usage: null, requestedModel: null, initModel: null, modelsUsed: [], text: "" };
const scoreOf = (dir: string) => JSON.parse(readFileSync(join(dir, "score.json"), "utf8")) as Record<string, any>;

describe("one failing run does not end the experiment", () => {
  it("records a run whose log does not replay as an error, and carries on", async () => {
    let n = 0;
    const driver: AgentDriver = (o, s) => (n++ === 0 ? player({ mode: "badlog" }) : player({ mode: "solve" }))(o, s);
    const out = await runExperiment(options(driver));
    expect(out.reports).toHaveLength(2);
    expect(out.reports[0]).toMatchObject({ ended: "error" });
    expect(out.reports[0]?.reason).toMatch(/^ReplayFailed: /);
    expect(out.reports[0]?.score.totalCalls).toBe(0); // scored as an empty run
    expect(out.reports[1]).toMatchObject({ ended: "stopped" });
    expect(out.reports[1]?.score.reached).toBe(true);
    expect(out.aggregate).toMatchObject({ runs: 2, errors: 1, reached: 1 });
  });

  it("treats a malformed log line the same way", async () => {
    const out = await runExperiment(options(player({ mode: "badlog", malformedLog: true }), { runs: 1 }));
    expect(out.reports[0]).toMatchObject({ ended: "error" });
    expect(out.reports[0]?.reason).toMatch(/^ReplayFailed: /);
  });

  it("scores a missing run log as zero calls, not an error", async () => {
    const out = await runExperiment(options(async () => empty, { runs: 1 }));
    expect(out.reports[0]).toMatchObject({ ended: "stopped" });
    expect(out.reports[0]?.score).toMatchObject({ totalCalls: 0, reached: false });
  });

  it("records a driver that rejects with a non-Error value as a driver failure", async () => {
    const out = await runExperiment(options(async () => Promise.reject("oops"), { runs: 1 }));
    expect(out.reports[0]).toMatchObject({ ended: "error", reason: "DriverFailed: the player failed" });
  });

  it("never writes the wrapped error's text to disk", async () => {
    const out = await runExperiment(options(async () => { throw new Error("/Users/someone/secret-path"); }, { runs: 1 }));
    const dir = out.reports[0]?.dir as string;
    expect(JSON.stringify(scoreOf(dir))).not.toContain("secret-path");
    expect(readFileSync(join(out.dir, "summary.json"), "utf8")).not.toContain("secret-path");
  });

  it("writes the summary even when every run fails", async () => {
    const out = await runExperiment(options(player({ mode: "crash" })));
    expect(out.aggregate).toMatchObject({ runs: 2, errors: 2 });
    const summary = JSON.parse(readFileSync(join(out.dir, "summary.json"), "utf8")) as Record<string, any>;
    expect(summary["aggregate"]).toMatchObject({ errors: 2 });
    expect(summary["runs"]).toHaveLength(2);
  });
});

describe("fail fast", () => {
  it("refuses before the first run when any run folder is already taken, and spends nothing", async () => {
    let called = 0;
    const driver: AgentDriver = (o, s) => {
      called++;
      return player({ mode: "solve" })(o, s);
    };
    const o = options(driver, { runs: 3 });
    mkdirSync(join(o.out, "t", "002"), { recursive: true });
    await expect(runExperiment(o)).rejects.toBeInstanceOf(RunFolderExists);
    await expect(runExperiment(o)).rejects.toThrow(/already exists; choose a new --label/);
    expect(called).toBe(0);
    expect(existsSync(join(o.out, "t", "001"))).toBe(false);
  });
});
