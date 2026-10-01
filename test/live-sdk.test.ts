/**
 * Runs the real Claude Agent SDK. It spends real Claude usage, so it only runs with LIVE_SDK=1:
 *   LIVE_SDK=1 pnpm vitest run test/live-sdk.test.ts
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { DriverOptions, PlayerResult } from "../src/harness/driver.js";
import { sdkDriver } from "../src/harness/sdk-driver.js";
import type { RunLogEntry } from "../src/sim/runlog.js";
import { readTrace, type RequestLine, type ToolLine } from "../src/trace/lines.js";
import { TraceRecorder } from "../src/trace/recorder.js";

const live = process.env["LIVE_SDK"] === "1";
const WORLD = resolve("worlds/generated/forge-7.json");

async function session(prompt: string, maxTurns: number) {
  const dir = mkdtempSync(join(tmpdir(), "skill-craft-live-"));
  const tracePath = join(dir, "trace.jsonl");
  const options: DriverOptions = { prompt, world: WORLD, runLog: join(dir, "run.jsonl"), runDir: dir, maxTurns, record: false, signal: new AbortController().signal };
  const result: PlayerResult = await sdkDriver(options, new TraceRecorder({ path: tracePath }));
  const log = readFileSync(options.runLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RunLogEntry);
  const lines = readTrace(tracePath);
  return { result, log, requests: lines.filter((l): l is RequestLine => l.kind === "request"), tools: lines.filter((l): l is ToolLine => l.kind === "tool") };
}

describe.skipIf(!live)("the real SDK", () => {
  it("records a short session: request and tool lines whose token sums equal the result's usage", async () => {
    const { result, log, requests, tools } = await session("Call the craft help tool once, then say done in one word.", 5);
    expect(result.usage).not.toBeNull();
    expect(requests.length).toBeGreaterThan(0);
    expect(tools.length).toBe(log.length);
    const sum = (k: "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheCreationTokens") => requests.reduce((a, r) => a + r[k], 0);
    expect(sum("inputTokens")).toBe(result.usage?.inputTokens);
    expect(sum("outputTokens")).toBe(result.usage?.outputTokens);
    expect(sum("cacheReadTokens")).toBe(result.usage?.cacheReadTokens);
    expect(sum("cacheCreationTokens")).toBe(result.usage?.cacheCreationTokens);
    expect(result.modelsUsed.length).toBeGreaterThan(0);
    expect(requests.every((r) => r.model !== null)).toBe(true);
  }, 300_000);

  it("records a refused call: the trace has a tool line for every log entry, refusals included", async () => {
    // Whichever post hook a refusal fires, the count must match; the recorder cannot tell them apart.
    const { log, tools } = await session("Call the craft place tool exactly once with item 'zz-no-such-item', row 0, column 0. Then say done in one word.", 6);
    expect(log.some((e) => !e.ok)).toBe(true);
    expect(tools.length).toBe(log.length);
  }, 300_000);
});
