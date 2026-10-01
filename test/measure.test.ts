import { describe, expect, it } from "vitest";
import type { PlayerResult } from "../src/harness/driver.js";
import type { RunLogEntry } from "../src/sim/runlog.js";
import type { RequestLine, ToolLine, TraceLine } from "../src/trace/lines.js";
import { measureRun } from "../src/trace/measure.js";

const TOK = { inputTokens: 2, outputTokens: 10, cacheReadTokens: 100, cacheCreationTokens: 50 };

const req = (seq: number, turn: number, startMs: number, endMs: number): RequestLine => ({
  seq, kind: "request", requestId: `msg_${turn}`, model: "m", turn, startMs, endMs, ttftMs: 5, ...TOK,
});
const tool = (seq: number, name: string, args: Record<string, unknown>, startMs: number, endMs: number): ToolLine => ({
  seq, kind: "tool", toolUseId: `toolu_${seq}`, tool: name, args, startMs, endMs,
});
const entry = (seq: number, name: string, args: Record<string, unknown> = {}): RunLogEntry => ({ seq, tool: name, args, ok: true });

/** help, place, craft: three calls, four model requests (the last one is the closing message). */
const entries = [entry(1, "help"), entry(2, "place", { item: "a", row: 0, col: 0 }), entry(3, "craft")];
const lines: TraceLine[] = [
  req(0, 1, 0, 100),
  tool(1, "help", {}, 110, 120),
  req(2, 2, 130, 300),
  tool(3, "place", { item: "a", row: 0, col: 0 }, 310, 320),
  req(4, 3, 330, 500),
  tool(5, "craft", {}, 510, 530),
  req(6, 4, 540, 700),
];
const result = (over: Partial<PlayerResult> = {}): PlayerResult => ({
  ended: "stopped", turns: 4, costUsd: 0.04, durationMs: 5000,
  usage: { inputTokens: 8, outputTokens: 40, cacheReadTokens: 400, cacheCreationTokens: 200 },
  requestedModel: null, initModel: "m", modelsUsed: ["m"], text: "done", ...over,
});
const score = (reachedSeq: number | null) => ({ reachedSeq });

describe("measureRun, matched", () => {
  it("reports the result's duration and cost and the sums of the request lines", () => {
    const m = measureRun(entries, lines, result(), score(3));
    expect(m.trace).toBe("matched");
    expect(m.total).toEqual({ durationMs: 5000, inputTokens: 8, outputTokens: 40, cacheReadTokens: 400, cacheCreationTokens: 200, costUsd: 0.04 });
  });

  it("sums to the goal over requests that ended at or before the goal-reaching call, including the request that issued it", () => {
    const m = measureRun(entries, lines, result(), score(3));
    // the craft call ends at 530; requests 1 to 3 ended by then, request 4 (ends 700) did not
    expect(m.toGoal).toEqual({ durationMs: 530, inputTokens: 6, outputTokens: 30, cacheReadTokens: 300, cacheCreationTokens: 150 });
  });

  it("gives all-zero to-goal figures when the goal was held before any call", () => {
    const m = measureRun(entries, lines, result(), score(0));
    expect(m.toGoal).toEqual({ durationMs: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });
  });

  it("has a total and no to-goal figures when the goal was never reached", () => {
    const m = measureRun(entries, lines, result(), score(null));
    expect(m.total).toBeDefined();
    expect(m).not.toHaveProperty("toGoal");
  });

  it("measures up to an earlier goal-reaching call", () => {
    const m = measureRun(entries, lines, result(), score(2)); // place ends at 320: requests 1 and 2
    expect(m.toGoal).toMatchObject({ durationMs: 320, inputTokens: 4, outputTokens: 20 });
  });

  it("falls back to the last line's end when the result gives no duration", () => {
    const m = measureRun(entries, lines, result({ durationMs: null }), score(null));
    expect(m.total?.durationMs).toBe(700);
  });
});

describe("measureRun, absent", () => {
  it("is absent with no trace lines and no result", () => {
    expect(measureRun(entries, [], null, score(3))).toEqual({ trace: "absent" });
  });

  it("is absent with no trace lines and a result whose totals are all zero, since nothing was measured", () => {
    const zero = result({ usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }, costUsd: 0, durationMs: 90 });
    expect(measureRun(entries, [], zero, score(3))).toEqual({ trace: "absent" });
  });

  it("is a mismatch with no trace lines when the result states tokens that were used", () => {
    expect(measureRun(entries, [], result(), score(3)).trace).toBe("mismatch");
  });

  it("is absent with no trace lines and a result that carries no figures", () => {
    const silent = result({ usage: null, durationMs: null, costUsd: null, turns: null, modelsUsed: [], initModel: null });
    expect(measureRun(entries, [], silent, score(3))).toEqual({ trace: "absent" });
  });
});

describe("measureRun, lines that share a millisecond", () => {
  it("orders by completion, so a closing request with the same timestamp is not charged to the goal", () => {
    const flat = lines.map((l) => ({ ...l, startMs: 0, endMs: 0 }));
    const m = measureRun(entries, flat, result(), score(3));
    expect(m.toGoal).toMatchObject({ inputTokens: 6, outputTokens: 30 }); // requests 1 to 3, not the closing one
  });
});

describe("measureRun, mismatch", () => {
  const frozen = Object.freeze({ reachedSeq: 3 });
  const noFigures = (m: ReturnType<typeof measureRun>) => {
    expect(m.trace).toBe("mismatch");
    expect(m).not.toHaveProperty("total");
    expect(m).not.toHaveProperty("toGoal");
  };

  it("names both counts when the trace has a different number of calls than the log", () => {
    const missing = lines.filter((l) => !(l.kind === "tool" && l.tool === "place"));
    const m = measureRun(entries, missing, result(), frozen);
    noFigures(m);
    expect(m.reason).toBe("tool count: log 3, trace 2");
  });

  it("names the call when the tool differs", () => {
    const swapped = lines.map((l) => (l.kind === "tool" && l.tool === "place" ? { ...l, tool: "remove" } : l));
    const m = measureRun(entries, swapped, result(), frozen);
    noFigures(m);
    expect(m.reason).toBe("call 2: log place, trace remove");
  });

  it("names the call when the arguments differ", () => {
    const altered = lines.map((l) => (l.kind === "tool" && l.tool === "place" ? { ...l, args: { item: "b", row: 0, col: 0 } } : l));
    const m = measureRun(entries, altered, result(), frozen);
    noFigures(m);
    expect(m.reason).toBe("call 2 (place): arguments differ");
  });

  it("pairs two identical consecutive calls by order and does not call that a mismatch", () => {
    const twoLooks = [entry(1, "look"), entry(2, "look")];
    const trace: TraceLine[] = [req(0, 1, 0, 50), tool(1, "look", {}, 60, 70), req(2, 2, 80, 120), tool(3, "look", {}, 130, 140), req(4, 3, 150, 200)];
    const three = result({ usage: { inputTokens: 6, outputTokens: 30, cacheReadTokens: 300, cacheCreationTokens: 150 } });
    expect(measureRun(twoLooks, trace, three, { reachedSeq: null }).trace).toBe("matched");
  });

  it("ignores the order keys are written in when comparing arguments", () => {
    const reordered = lines.map((l) => (l.kind === "tool" && l.tool === "place" ? { ...l, args: { col: 0, row: 0, item: "a" } } : l));
    expect(measureRun(entries, reordered, result(), frozen).trace).toBe("matched");
  });

  it("is a mismatch when the summed request tokens differ from the result's, naming the field and both numbers", () => {
    const m = measureRun(entries, lines, result({ usage: { inputTokens: 8, outputTokens: 45, cacheReadTokens: 400, cacheCreationTokens: 200 } }), frozen);
    noFigures(m);
    expect(m.reason).toBe("output tokens: trace 40, result 45");
  });

  it("is a mismatch for trace lines with no final result", () => {
    const m = measureRun(entries, lines, null, frozen);
    noFigures(m);
    expect(m.reason).toBe("run ended without a result");
  });

  it("is a mismatch, naming the count, when the recorder skipped malformed items", () => {
    const m = measureRun(entries, lines, result(), frozen, 2);
    noFigures(m);
    expect(m.reason).toBe("2 malformed items skipped");
    expect(measureRun(entries, lines, result(), frozen, 1).reason).toBe("1 malformed item skipped");
  });

  it("is a mismatch when the request lines name different models than the result's model usage", () => {
    const m = measureRun(entries, lines, result({ modelsUsed: ["n"] }), frozen);
    noFigures(m);
    expect(m.reason).toBe("models: trace m, result n");
  });

  it("does not compare models when no line names one", () => {
    const unnamed = lines.map((l) => (l.kind === "request" ? { ...l, model: null } : l));
    expect(measureRun(entries, unnamed, result({ modelsUsed: ["n"] }), frozen).trace).toBe("matched");
  });

  it("is a mismatch when the lines name a model but the result lists none, since the check cannot be made", () => {
    const m = measureRun(entries, lines, result({ modelsUsed: [] }), frozen);
    noFigures(m);
    expect(m.reason).toBe("models: trace m, result none");
  });

  it("is a mismatch when trace lines exist but the result states no token totals, since the check cannot be made", () => {
    const m = measureRun(entries, lines, result({ usage: null }), frozen);
    noFigures(m);
    expect(m.reason).toBe("tokens: the player stated no totals to check against");
  });

  it("never changes the score it was given", () => {
    const score = Object.freeze({ reachedSeq: 3 });
    expect(() => measureRun(entries, lines.slice(1), result(), score)).not.toThrow();
    expect(score).toEqual({ reachedSeq: 3 });
  });
});
