import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { linesAfter, readTrace, type TraceLine } from "../src/trace/lines.js";

const request = (seq: number): TraceLine => ({
  seq, kind: "request", requestId: `msg_${seq}`, model: "m", turn: 1, startMs: 0, endMs: 10, ttftMs: 5,
  inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheCreationTokens: 4,
});
const tool = (seq: number): TraceLine => ({ seq, kind: "tool", toolUseId: `toolu_${seq}`, tool: "help", args: {}, startMs: 11, endMs: 12 });

const fileWith = (text: string | undefined): string => {
  const path = join(mkdtempSync(join(tmpdir(), "trace-")), "trace.jsonl");
  if (text !== undefined) writeFileSync(path, text);
  return path;
};

describe("readTrace", () => {
  it("returns no lines for a missing file", () => {
    expect(readTrace(fileWith(undefined))).toEqual([]);
  });

  it("returns no lines for an empty file", () => {
    expect(readTrace(fileWith(""))).toEqual([]);
  });

  it("reads a valid two-line file in order", () => {
    const lines = [request(0), tool(1)];
    expect(readTrace(fileWith(lines.map((l) => JSON.stringify(l)).join("\n") + "\n"))).toEqual(lines);
  });

  it("names the line number of a malformed line", () => {
    const text = `${JSON.stringify(request(0))}\n{not json}\n`;
    expect(() => readTrace(fileWith(text))).toThrow(/line 2/);
  });
});

describe("linesAfter", () => {
  const lines = [request(0), tool(1), request(2)];

  it("returns everything for n = -1", () => {
    expect(linesAfter(lines, -1)).toEqual(lines);
  });

  it("returns exactly the later lines for a middle n", () => {
    expect(linesAfter(lines, 0).map((l) => l.seq)).toEqual([1, 2]);
  });

  it("returns nothing when n is the last seq", () => {
    expect(linesAfter(lines, 2)).toEqual([]);
  });
});
