import type { BundleData, CatalogEntry, FrameData, TraceLineData } from "../../../src/viz/contract.ts";

const grid = (...rows: string[]): (string | null)[][] => rows.map((r) => [...r].map((c) => (c === "." ? null : c)));
const frame = (seq: number, tool: string, over: Partial<FrameData> = {}): FrameData => ({
  seq, tool, args: {}, ok: true, grid: grid("..", ".."), craftable: null, held: {}, actions: 0, refusals: 0, reached: false, ...over,
});

/**
 * A small run to open in tests: place, a refused place, a look, a craft, a place of the made item (goal), then a
 * take-back. `best` is 3 calls, so the run is two over.
 *   seq 1 place a   2 place zz (refused)   3 look   4 craft -> d   5 place d (goal e? no: d is the goal)   6 remove
 */
export function sampleBundle(over: { ended?: "stopped" | "budget" | "error"; reached?: boolean; trace?: boolean } = {}): BundleData {
  const reached = over.reached ?? true;
  const frames: FrameData[] = [
    frame(0, "start", { held: { a: 2 } }),
    frame(1, "place", { args: { item: "a", row: 0, col: 0 }, grid: grid("a.", ".."), held: { a: 1 }, actions: 1 }),
    frame(2, "place", { args: { item: "zz", row: 1, col: 1 }, ok: false, error: "unknown_item", grid: grid("a.", ".."), held: { a: 1 }, actions: 2, refusals: 1 }),
    frame(3, "look", { grid: grid("a.", ".."), held: { a: 1 }, actions: 2, refusals: 1, craftable: "d" }),
    frame(4, "craft", { crafted: { item: "d", qty: 1 }, grid: grid("..", ".."), held: { a: 1, d: 1 }, actions: 3, refusals: 1, reached }),
    frame(5, "place", { args: { item: "d", row: 1, col: 0 }, grid: grid("..", "d."), held: { a: 1 }, actions: 4, refusals: 1, reached }),
    frame(6, "remove", { args: { row: 1, col: 0 }, grid: grid("..", ".."), held: { a: 1, d: 1 }, actions: 5, refusals: 1, reached }),
  ];
  const trace: TraceLineData[] = over.trace === false ? [] : frames.slice(1).map((f, i) => ({
    seq: i + 1, kind: "tool" as const, toolUseId: `t${i}`, tool: f.tool, args: f.args, startMs: i * 1000 + 100, endMs: 4200 + i * 1000,
  }));
  const best = { minCrafts: 1, minCalls: 3, slack: 0 };
  return {
    manifest: { format: 1, label: "lab / 001", world: { name: "w", rows: 2, cols: 2 }, goal: { item: "d", qty: 1 }, best, frames: frames.length, trace: trace.length > 0 ? "matched" : "absent", model: { requested: null, resolved: ["claude-x"] } },
    frames,
    trace,
    result: {
      ended: over.ended ?? "stopped", turns: 9,
      score: { goal: { item: "d", qty: 1 }, reached, totalCalls: 6, actionCalls: 5, callsToGoal: 3, craftsMade: 1, failedCrafts: 0, refusals: { unknown_item: 1 }, best, extraCalls: reached ? 0 : null, extraCrafts: reached ? 0 : null, reachedSeq: reached ? 4 : null },
      measured: trace.length > 0
        ? { trace: "matched", total: { durationMs: 65_000, costUsd: 0.0583, inputTokens: 100, outputTokens: 50, cacheReadTokens: 2000, cacheCreationTokens: 300 } }
        : { trace: "absent" },
    },
  };
}

export const sampleEntry: CatalogEntry = {
  id: "0123456789abcdef", kind: "run", status: "ready",
  attributes: { label: "lab", run: "001", world: "w", goalItem: "d", goalQty: 1, outcome: "reached", actionCalls: 5, bestCalls: 3, modelRan: "claude-x", priorFit: "faithful" },
  preview: { strip: "prcpt", table: grid("..", "..") }, bundle: "bundles/0123456789abcdef/",
};

/** A run that called nothing. */
export function emptyBundle(): BundleData {
  const b = sampleBundle({ ended: "stopped", reached: false, trace: false });
  return { ...b, frames: [b.frames[0]!], manifest: { ...b.manifest, frames: 1 }, result: { ...b.result, score: { ...b.result.score, totalCalls: 0, actionCalls: 0, callsToGoal: 0, craftsMade: 0, refusals: {}, reachedSeq: null } } };
}
