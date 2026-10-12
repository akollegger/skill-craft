import { describe, expect, it } from "vitest";
import { delayBefore, initial, keyAction, reduce, stepTimes } from "../src/state/playback.ts";
import type { FrameData, TraceLineData } from "../../src/viz/contract.ts";

const frame = (seq: number): FrameData => ({ seq, tool: seq === 0 ? "start" : "place", args: {}, ok: true, grid: [[null]], craftable: null, held: {}, actions: seq, refusals: 0, reached: false });
const toolLine = (seq: number, startMs: number, endMs: number): TraceLineData => ({ seq, kind: "tool", toolUseId: `t${seq}`, tool: "place", args: {}, startMs, endMs });
const requestLine = (seq: number): TraceLineData => ({ seq, kind: "request", requestId: "r", model: "m", turn: 1, startMs: 0, endMs: 10, ttftMs: 5, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 });

describe("the playhead", () => {
  it("starts at the first frame, paused", () => {
    expect(initial(5)).toEqual({ index: 0, playing: false, length: 5 });
  });

  it("steps by one and stays inside the run", () => {
    let s = initial(3);
    s = reduce(s, { type: "step", by: -1 });
    expect(s.index).toBe(0);
    s = reduce(reduce(s, { type: "step", by: 1 }), { type: "step", by: 1 });
    expect(s.index).toBe(2);
    expect(reduce(s, { type: "step", by: 1 }).index).toBe(2);
  });

  it("restarts at the first frame and pauses", () => {
    const s = reduce({ index: 2, playing: true, length: 3 }, { type: "restart" });
    expect(s).toEqual({ index: 0, playing: false, length: 3 });
  });

  it("scrubs to a frame and clamps to the range", () => {
    expect(reduce(initial(5), { type: "scrub", to: 3 }).index).toBe(3);
    expect(reduce(initial(5), { type: "scrub", to: 99 }).index).toBe(4);
    expect(reduce(initial(5), { type: "scrub", to: -4 }).index).toBe(0);
    expect(reduce(initial(5), { type: "scrub", to: 2.7 }).index).toBe(2);
  });

  it("plays and pauses, and toggles", () => {
    let s = reduce(initial(3), { type: "play" });
    expect(s.playing).toBe(true);
    s = reduce(s, { type: "pause" });
    expect(s.playing).toBe(false);
    expect(reduce(s, { type: "toggle" }).playing).toBe(true);
  });

  it("stops playing on reaching the last frame", () => {
    const s = reduce({ index: 1, playing: true, length: 3 }, { type: "step", by: 1 });
    expect(s).toEqual({ index: 2, playing: false, length: 3 });
  });

  it("plays again from the start when play is pressed at the end", () => {
    const s = reduce({ index: 2, playing: false, length: 3 }, { type: "play" });
    expect(s).toEqual({ index: 0, playing: true, length: 3 });
  });

  it("scrubbing pauses playback, and a step taken while it plays leaves it playing", () => {
    expect(reduce({ index: 0, playing: true, length: 5 }, { type: "step", by: -1 }).playing).toBe(true);
    expect(reduce({ index: 0, playing: true, length: 5 }, { type: "scrub", to: 2 }).playing).toBe(false);
  });

  it("copes with a run of one frame", () => {
    expect(reduce(initial(1), { type: "play" })).toEqual({ index: 0, playing: true, length: 1 });
    expect(reduce(initial(1), { type: "step", by: 1 }).index).toBe(0);
  });
});

describe("keyboard bindings", () => {
  it("maps space, the arrows, r and Escape", () => {
    expect(keyAction(" ")).toEqual({ type: "toggle" });
    expect(keyAction("ArrowRight")).toEqual({ type: "step", by: 1 });
    expect(keyAction("ArrowLeft")).toEqual({ type: "step", by: -1 });
    expect(keyAction("r")).toEqual({ type: "restart" });
    expect(keyAction("Escape")).toEqual({ type: "close" });
    expect(keyAction("x")).toBeUndefined();
  });
});

describe("pace", () => {
  const frames = [0, 1, 2, 3].map(frame);

  it("puts each frame at the end time of the matching tool call, the start at zero", () => {
    const trace = [requestLine(0), toolLine(1, 100, 300), requestLine(2), toolLine(3, 5000, 5200), toolLine(4, 5300, 5400)];
    expect(stepTimes(frames, trace)).toEqual([0, 300, 5200, 5400]);
  });

  it("gives no times when the trace does not cover the run", () => {
    expect(stepTimes(frames, [])).toEqual([null, null, null, null]);
    expect(stepTimes(frames, [toolLine(1, 0, 10)])).toEqual([null, null, null, null]);
  });

  it("waits as long as the call took, capped at two seconds and never below a tenth of one", () => {
    const times = [0, 300, 5200, 5250];
    expect(delayBefore(times, 1)).toBe(300);
    expect(delayBefore(times, 2)).toBe(2000);
    expect(delayBefore(times, 3)).toBe(100);
  });

  it("uses a steady pace when times are unknown", () => {
    expect(delayBefore([null, null, null], 1)).toBe(600);
    expect(delayBefore([0, null, 10], 1)).toBe(600);
  });
});
