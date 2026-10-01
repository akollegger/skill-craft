import { existsSync, readFileSync } from "node:fs";
import type { RunLogEntry } from "../sim/runlog.js";
import type { ReplayError } from "../sim/score.js";
import { ReplayFailed } from "./errors.js";

/** A `ReplayError` as the typed error the harness records, with the same wording everywhere. */
export function replayFailure(e: ReplayError): ReplayFailed {
  const m = /entry (\d+) \((\w+)\) does not replay: (.*)$/.exec(e.message);
  return new ReplayFailed(m ? `entry ${m[1]} (${m[2]}): ${m[3]}` : e.message, e);
}

/**
 * Read a run log. A missing file is an empty run; a line that is not JSON is a failed replay, and so is a
 * sequence that does not run 1, 2, 3 and so on: the server writes it that way, and frames and the goal-reaching
 * tool line are found by position.
 */
export function readLog(path: string): RunLogEntry[] {
  if (!existsSync(path)) return [];
  const entries = readFileSync(path, "utf8")
    .split("\n")
    .flatMap((line, i) => {
      if (line === "") return [];
      try {
        return [JSON.parse(line) as RunLogEntry];
      } catch {
        throw new ReplayFailed(`line ${i + 1} is not valid JSON`);
      }
    });
  entries.forEach((e, i) => {
    if (e.seq !== i + 1) throw new ReplayFailed(`sequence breaks at entry ${i + 1} (found seq ${String(e.seq)})`);
  });
  return entries;
}
