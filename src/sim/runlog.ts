import { appendFileSync, statSync } from "node:fs";

/** One tool call in a run. No timestamps, so replaying the same calls gives an identical log. */
export interface RunLogEntry {
  seq: number;
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  /** The refusal code, present when `ok` is false. */
  error?: string;
  /** What a successful `craft` made. */
  crafted?: { item: string; qty: number };
}

/** Thrown when a run is started against a log file that already holds data. */
export class RunLogInUseError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`run log ${path} already holds data; give each run its own SIM_RUN_LOG path`);
    this.name = "RunLogInUseError";
    this.path = path;
  }
}

/** The ordered record of every tool call in one run, in memory and optionally as JSONL on disk. */
export class RunLog {
  readonly entries: RunLogEntry[] = [];
  private readonly path: string | undefined;

  constructor(path?: string) {
    this.path = path;
  }

  append(entry: Omit<RunLogEntry, "seq">): RunLogEntry {
    // Keys are written in a fixed order so a replayed run is byte-identical.
    const full: RunLogEntry = {
      seq: this.entries.length + 1,
      tool: entry.tool,
      args: entry.args,
      ok: entry.ok,
      ...(entry.error === undefined ? {} : { error: entry.error }),
      ...(entry.crafted === undefined ? {} : { crafted: entry.crafted }),
    };
    this.entries.push(full);
    if (this.path !== undefined) appendFileSync(this.path, `${JSON.stringify(full)}\n`);
    return full;
  }

  toJsonl(): string {
    return this.entries.map((e) => `${JSON.stringify(e)}\n`).join("");
  }
}

/**
 * Start a run log. With a path, calls are also appended to that file, which must not already hold
 * data (a restarted server must not mix two runs). Without a path the log is in memory only.
 */
export function createRunLog(path?: string): RunLog {
  if (path !== undefined) {
    let size = 0;
    try {
      size = statSync(path).size;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (size > 0) throw new RunLogInUseError(path);
  }
  return new RunLog(path);
}

export interface RunSummary {
  /** Every logged call. */
  calls: number;
  /** Calls that change the world: `place` and `craft`, refused or not. */
  worldChanging: number;
  craftsMade: number;
  failedCrafts: number;
  /** Refusals grouped by code. */
  refusals: Record<string, number>;
}

/** Counts derived from a run log, as described in contracts/run-log.md. */
export function summarize(entries: readonly RunLogEntry[]): RunSummary {
  const refusals: Record<string, number> = {};
  for (const e of entries) {
    if (!e.ok && e.error) refusals[e.error] = (refusals[e.error] ?? 0) + 1;
  }
  return {
    calls: entries.length,
    worldChanging: entries.filter((e) => e.tool === "place" || e.tool === "craft").length,
    craftsMade: entries.filter((e) => e.tool === "craft" && e.ok).length,
    failedCrafts: entries.filter((e) => e.tool === "craft" && !e.ok).length,
    refusals,
  };
}
