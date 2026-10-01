import { existsSync, readFileSync } from "node:fs";

/** One model request, written when its message stops. Times are ms offsets from the session's `init`. */
export interface RequestLine {
  seq: number;
  kind: "request";
  requestId: string;
  model: string | null;
  turn: number;
  startMs: number;
  endMs: number;
  ttftMs: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/** One craft-tool round trip, written when either post hook fires. */
export interface ToolLine {
  seq: number;
  kind: "tool";
  toolUseId: string;
  /** Without the server prefix: `place`, not `mcp__craft__place`. */
  tool: string;
  args: Record<string, unknown>;
  startMs: number;
  endMs: number;
}

export type TraceLine = RequestLine | ToolLine;

/** Read a trace file. A missing or empty file is an empty trace; a malformed line is an error. */
export function readTrace(path: string): TraceLine[] {
  if (!existsSync(path)) return [];
  const lines: TraceLine[] = [];
  readFileSync(path, "utf8")
    .split("\n")
    .forEach((text, i) => {
      if (text === "") return;
      try {
        lines.push(JSON.parse(text) as TraceLine);
      } catch {
        throw new Error(`trace line ${i + 1} is not valid JSON`);
      }
    });
  return lines;
}

/** The lines a consumer that has read up to `n` has not seen yet; everything when `n` is negative. */
export function linesAfter<T extends { seq: number }>(lines: readonly T[], n: number): T[] {
  return lines.filter((l) => l.seq > n);
}
