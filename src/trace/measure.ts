import type { PlayerResult } from "../harness/driver.js";
import type { RunLogEntry } from "../sim/runlog.js";
import type { RequestLine, ToolLine, TraceLine } from "./lines.js";

export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface TotalFigures extends TokenTotals {
  durationMs: number;
  costUsd: number;
}

/** Up to and including the goal-reaching call. No cost: the player states cost as a run total only. */
export interface GoalFigures extends TokenTotals {
  durationMs: number;
}

export interface Measured {
  trace: "matched" | "mismatch" | "absent";
  /** For a mismatch: the first disagreement. Contains no personal data. */
  reason?: string;
  total?: TotalFigures;
  toGoal?: GoalFigures;
}

const zero = (): TokenTotals => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });

function sum(requests: readonly RequestLine[]): TokenTotals {
  const t = zero();
  for (const r of requests) {
    t.inputTokens += r.inputTokens;
    t.outputTokens += r.outputTokens;
    t.cacheReadTokens += r.cacheReadTokens;
    t.cacheCreationTokens += r.cacheCreationTokens;
  }
  return t;
}

/** JSON with object keys in a fixed order, so two argument objects compare equal whatever order they were written in. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

/** The first way the trace's tool lines disagree with the run log, or null when they pair up exactly. */
function joinProblem(entries: readonly RunLogEntry[], tools: readonly ToolLine[]): string | null {
  if (tools.length !== entries.length) return `tool count: log ${entries.length}, trace ${tools.length}`;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i] as RunLogEntry;
    const t = tools[i] as ToolLine;
    if (e.tool !== t.tool) return `call ${i + 1}: log ${e.tool}, trace ${t.tool}`;
    if (canonical(e.args) !== canonical(t.args)) return `call ${i + 1} (${e.tool}): arguments differ`;
  }
  return null;
}

const FIELDS = [
  ["input tokens", "inputTokens"],
  ["output tokens", "outputTokens"],
  ["cache read tokens", "cacheReadTokens"],
  ["cache creation tokens", "cacheCreationTokens"],
] as const;

/**
 * Decide what the trace says about a finished run. The run log is the ground truth of what the world did;
 * the trace is trusted only as far as it agrees with it.
 */
export function measureRun(
  entries: readonly RunLogEntry[],
  lines: readonly TraceLine[],
  result: PlayerResult | null,
  score: { reachedSeq: number | null },
  /** Malformed items the recorder left out. */
  skipped = 0,
): Measured {
  if (lines.length === 0 && (result === null || result.usage === null)) return { trace: "absent" };
  if (result === null) return { trace: "mismatch", reason: "run ended without a result" };
  if (skipped > 0) return { trace: "mismatch", reason: `${skipped} malformed item${skipped === 1 ? "" : "s"} skipped` };

  const requests = lines.filter((l): l is RequestLine => l.kind === "request");
  // The agent calls tools one at a time, so start order is call order.
  const tools = lines.filter((l): l is ToolLine => l.kind === "tool").sort((a, b) => a.startMs - b.startMs || a.seq - b.seq);

  const joined = joinProblem(entries, tools);
  if (joined) return { trace: "mismatch", reason: joined };

  // The player's own totals are a second opinion: any difference means lost or duplicated lines, and with no
  // totals to check against the trace cannot be called a match.
  if (result.usage === null) return { trace: "mismatch", reason: "tokens: the player stated no totals to check against" };
  const summed = sum(requests);
  for (const [label, key] of FIELDS) {
    if (summed[key] !== result.usage[key]) return { trace: "mismatch", reason: `${label}: trace ${summed[key]}, result ${result.usage[key]}` };
  }
  // The same for models: lines that name a model must agree with what the result says was used, and a result
  // that says nothing cannot confirm them. Lines that name none leave nothing to compare.
  const traceModels = [...new Set(requests.flatMap((r) => (r.model === null ? [] : [r.model])))].sort();
  const stated = [...result.modelsUsed].sort();
  if (traceModels.length > 0 && traceModels.join("+") !== stated.join("+")) {
    return { trace: "mismatch", reason: `models: trace ${traceModels.join("+")}, result ${stated.join("+") || "none"}` };
  }

  const lastEnd = lines.reduce((m, l) => Math.max(m, l.endMs), 0);
  const total: TotalFigures = { durationMs: result.durationMs ?? lastEnd, ...sum(requests), costUsd: result.costUsd ?? 0 };
  const measured: Measured = { trace: "matched", total };

  if (score.reachedSeq === 0) {
    measured.toGoal = { durationMs: 0, ...zero() };
  } else if (score.reachedSeq !== null) {
    // By completion order, not by time: a request is always written before the tool calls it issued, and
    // several lines can share a millisecond. Time would charge the closing request to the goal.
    const goalTool = tools[score.reachedSeq - 1];
    const goalEnd = goalTool?.endMs ?? lastEnd;
    measured.toGoal = { durationMs: goalEnd, ...sum(goalTool ? requests.filter((r) => r.seq < goalTool.seq) : requests) };
  }
  return measured;
}
