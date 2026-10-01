import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentDriver } from "../src/harness/driver.js";
import { runExperiment } from "../src/harness/run.js";
import { readTrace } from "../src/trace/lines.js";
import { fakePlayer } from "./helpers/fake-player.js";

const GOAL = { item: "c", qty: 1 };
const options = (driver: AgentDriver, over: Record<string, unknown> = {}) => ({
  world: "test/fixtures/valid/mirror-pair.json",
  goal: GOAL,
  runs: 2,
  maxTurns: 12,
  out: mkdtempSync(join(tmpdir(), "skill-craft-cancel-")),
  label: "t",
  record: false,
  driver,
  ...over,
});

describe("a run that never finishes", () => {
  it("is ended as a timeout, the driver's signal is aborted, and the trace lines already written stay on disk", async () => {
    let seen: AbortSignal | undefined;
    const driver: AgentDriver = (o, s) => {
      seen = o.signal;
      return fakePlayer({ mode: "hang", goal: GOAL })(o, s);
    };
    const out = await runExperiment(options(driver, { runs: 1, timeoutMs: 80 }));
    expect(out.reports[0]).toMatchObject({ ended: "error" });
    expect(out.reports[0]?.reason).toMatch(/^RunTimedOut: /);
    expect(seen?.aborted).toBe(true);
    expect(readTrace(join(out.reports[0]?.dir as string, "trace.jsonl")).length).toBeGreaterThan(0);
  });

  it("does not stop the experiment: the next run still starts", async () => {
    let n = 0;
    const driver: AgentDriver = (o, s) => (n++ === 0 ? fakePlayer({ mode: "hang", goal: GOAL }) : fakePlayer({ mode: "solve", goal: GOAL }))(o, s);
    const out = await runExperiment(options(driver, { timeoutMs: 80 }));
    expect(out.reports.map((r) => r.ended)).toEqual(["error", "stopped"]);
  });
});

describe("a time limit beyond what a timer can hold", () => {
  it("is clamped, so it never fires at once", async () => {
    let abortedWhenDone: boolean | undefined;
    const driver: AgentDriver = async (o, s) => {
      await new Promise((r) => setTimeout(r, 40));
      abortedWhenDone = o.signal.aborted;
      return fakePlayer({ mode: "solve", goal: GOAL })(o, s);
    };
    const out = await runExperiment(options(driver, { runs: 1, timeoutMs: Number.POSITIVE_INFINITY }));
    expect(abortedWhenDone).toBe(false);
    expect(out.reports[0]).toMatchObject({ ended: "stopped" });
  });
});

describe("cancelling the experiment", () => {
  it("ends the current run, writes its score and the summary, and starts no further run", async () => {
    const stop = new AbortController();
    const driver: AgentDriver = (o, s) => {
      setTimeout(() => stop.abort(), 50);
      return fakePlayer({ mode: "hang", goal: GOAL })(o, s);
    };
    const out = await runExperiment(options(driver, { runs: 3, signal: stop.signal }));
    expect(out.reports).toHaveLength(1);
    expect(out.cancelled).toBe(true);
    expect(out.reports[0]?.reason).toMatch(/^RunCancelled: /);
    expect(existsSync(join(out.reports[0]?.dir as string, "score.json"))).toBe(true);
    const summary = JSON.parse(readFileSync(join(out.dir, "summary.json"), "utf8")) as Record<string, any>;
    expect(summary["cancelled"]).toBe(true);
    expect(summary["runs"]).toHaveLength(1);
  });

  it("starts nothing when it is already cancelled, and still writes the summary", async () => {
    const stop = new AbortController();
    stop.abort();
    let called = 0;
    const driver: AgentDriver = (o, s) => {
      called++;
      return fakePlayer({ mode: "solve", goal: GOAL })(o, s);
    };
    const out = await runExperiment(options(driver, { signal: stop.signal }));
    expect(called).toBe(0);
    expect(out.reports).toEqual([]);
    expect(existsSync(join(out.dir, "summary.json"))).toBe(true);
  });
});
