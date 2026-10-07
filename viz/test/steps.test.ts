import { describe, expect, it } from "vitest";
import { actionFrameIndices, frameForCalls, scrubTarget } from "../src/state/steps.ts";
import { keyAction } from "../src/state/playback.ts";
import type { FrameData } from "../../src/viz/contract.ts";

const frame = (actions: number): FrameData => ({ seq: 0, tool: "place", args: {}, ok: true, grid: [[null]], craftable: null, held: {}, actions, refusals: 0, reached: false });

describe("the steps of a run", () => {
  // start, look (a read), place, place, inventory (a read), craft
  const frames = [frame(0), frame(0), frame(1), frame(2), frame(2), frame(3)];

  it("finds the frame each action call produced, skipping the reads between them", () => {
    expect(actionFrameIndices(frames)).toEqual([2, 3, 5]);
  });

  it("maps a count of calls made to the frame to show: the start for none, else that call's own frame", () => {
    const a = actionFrameIndices(frames);
    expect(frameForCalls(a, 0)).toBe(0);
    expect(frameForCalls(a, 1)).toBe(2);
    expect(frameForCalls(a, 3)).toBe(5);
    expect(frameForCalls(a, 99)).toBe(5);
  });

  it("has no action frames for a run with no actions", () => {
    expect(actionFrameIndices([frame(0), frame(0)])).toEqual([]);
    expect(frameForCalls([], 4)).toBe(0);
  });
});

describe("scrubbing by the counter", () => {
  it("moves with the pointer, right going forward and left going back, and stops at both ends", () => {
    expect(scrubTarget(10, 24, 50)).toBeGreaterThan(10);
    expect(scrubTarget(10, -24, 50)).toBeLessThan(10);
    expect(scrubTarget(2, -500, 50)).toBe(0);
    expect(scrubTarget(48, 500, 50)).toBe(50);
  });

  it("scales to the run: a short run takes a wide pull per call and a long one a narrow one, so one sweep crosses either", () => {
    const short = scrubTarget(0, 12, 5);
    const long = scrubTarget(0, 12, 180);
    expect(short).toBe(1); // 12 pixels is about one call of five
    expect(long).toBeGreaterThan(short);
    expect(scrubTarget(0, 500, 180)).toBeGreaterThan(150); // a sweep of about 500 pixels covers nearly the whole of a long run
  });

  it("does nothing for a run with no calls", () => {
    expect(scrubTarget(0, 100, 0)).toBe(0);
  });
});

describe("the keys that jump", () => {
  it("send Home to the start and End to the last frame", () => {
    expect(keyAction("Home")).toEqual({ type: "scrub", to: 0 });
    expect(keyAction("End")).toMatchObject({ type: "scrub" });
    expect((keyAction("End") as { to: number }).to).toBeGreaterThan(1e6); // clamped to the last frame by the reducer
  });
});

import { clockSizers, scoreSizer } from "../src/shell/clock.ts";

describe("the room reserved for the score and the clock", () => {
  // The widest digit of the pixel face stands in for every digit, so the reserved room is never too small whatever the digits are.
  it("reserves the same three digits for every run, and more only for a run of a thousand calls", () => {
    for (const calls of [0, 5, 99, 179, 999]) expect(scoreSizer(calls), `${calls}`).toBe("888");
    expect(scoreSizer(1000)).toBe("8888");
  });

  it("reserves the same clock room for every run: the widest seconds form and the widest minutes form, and more only past ten minutes", () => {
    for (const ms of [null, 0, 9_400, 37_700, 133_000, 599_000]) expect(clockSizers(ms), `${ms}`).toEqual(["88.8s", "8:88"]);
    expect(clockSizers(600_000)).toEqual(["88.8s", "8:88", "88:88"]);
  });
});

import { compactCount, spendStats } from "../src/shell/stats.ts";

describe("the small stats of a run's spend", () => {
  it("shortens big counts to a few characters", () => {
    expect(compactCount(0)).toBe("0");
    expect(compactCount(74)).toBe("74");
    expect(compactCount(9_999)).toBe("9999");
    expect(compactCount(17_045)).toBe("17.0k");
    expect(compactCount(640_963)).toBe("641k");
    expect(compactCount(1_240_000)).toBe("1.2m");
  });

  const total = { costUsd: 0.465, durationMs: 133_000, inputTokens: 74, outputTokens: 17_045, cacheReadTokens: 640_963, cacheCreationTokens: 41_475 };

  it("lists cost, time and the four token counts with no words on screen, and the words as labels", () => {
    const stats = spendStats(total);
    expect(stats.map((s) => s.text)).toEqual(["$0.465", "2:13", "74", "17.0k", "641k", "41.5k"]);
    expect(stats.map((s) => s.label)).toEqual(["Cost", "Time for the whole run", "Input tokens", "Output tokens", "Cache read tokens", "Cache write tokens"]);
    for (const s of stats) expect(s.text, s.label).not.toMatch(/[a-z]{3,}/i);
  });

  it("lists nothing for a run with no measured totals", () => {
    expect(spendStats(undefined)).toEqual([]);
  });
});
