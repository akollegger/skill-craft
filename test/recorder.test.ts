import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DriverOptions } from "../src/harness/driver.js";
import { linesAfter, readTrace, type RequestLine, type ToolLine } from "../src/trace/lines.js";
import { TraceRecorder } from "../src/trace/recorder.js";
import { fakePlayer, type FakePlayerOptions } from "./helpers/fake-player.js";

/** A recorder with a clock the test moves by hand. */
function setup() {
  const path = join(mkdtempSync(join(tmpdir(), "rec-")), "trace.jsonl");
  const clock = { t: 0 };
  const recorder = new TraceRecorder({ path, now: () => clock.t });
  const at = (t: number) => {
    clock.t = t;
    return recorder;
  };
  return { path, recorder, at };
}

const init = { type: "system", subtype: "init", model: "m-1" };
const start = (id: string | null, ttft = 120, model: string | null = "m-1") => ({
  type: "stream_event",
  ttft_ms: ttft,
  event: { type: "message_start", message: { ...(id === null ? {} : { id }), ...(model === null ? {} : { model }) } },
});
const USAGE = { input_tokens: 2, output_tokens: 61, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 };
const delta = (usage: Record<string, number> | null = USAGE) => ({
  type: "stream_event",
  event: { type: "message_delta", ...(usage === null ? {} : { usage }) },
});
const stop = { type: "stream_event", event: { type: "message_stop" } };

/** A whole model request arriving between two times. */
function request(at: (t: number) => TraceRecorder, id: string, from: number, to: number, ttft = 120) {
  at(from).onMessage(start(id, ttft));
  at(to - 1).onMessage(delta());
  at(to).onMessage(stop);
}

describe("request lines", () => {
  it("write a request at message_stop, with offsets from init and the start moved back by the first-token wait", () => {
    const { path, at } = setup();
    at(1000).onMessage(init);
    request(at, "msg_1", 1130, 1500);
    const [line] = readTrace(path) as RequestLine[];
    expect(line).toEqual({
      seq: 0, kind: "request", requestId: "msg_1", model: "m-1", turn: 1,
      startMs: 10, // 1130 - 120 - 1000
      endMs: 500,
      ttftMs: 120,
      inputTokens: 2, outputTokens: 61, cacheReadTokens: 3, cacheCreationTokens: 4,
    });
  });

  it("clamp a start that would fall before the session was ready to 0", () => {
    const { path, at } = setup();
    at(1000).onMessage(init);
    request(at, "msg_1", 1050, 1200, 200);
    expect((readTrace(path)[0] as RequestLine).startMs).toBe(0);
  });

  it("count turns across requests", () => {
    const { path, at } = setup();
    at(0).onMessage(init);
    request(at, "msg_1", 200, 400);
    request(at, "msg_2", 600, 800);
    expect((readTrace(path) as RequestLine[]).map((l) => l.turn)).toEqual([1, 2]);
  });

  it("keep the line with a null model when the message names none", () => {
    const { path, at } = setup();
    at(0).onMessage(init);
    at(200).onMessage(start("msg_1", 100, null));
    at(300).onMessage(delta());
    at(400).onMessage(stop);
    expect((readTrace(path)[0] as RequestLine).model).toBeNull();
  });

  it("take offsets from the first message when there is no init", () => {
    const { path, at } = setup();
    at(500).onMessage(start("msg_1", 0));
    at(550).onMessage(delta());
    at(600).onMessage(stop);
    expect((readTrace(path)[0] as RequestLine).endMs).toBe(100);
  });

  it("ignore the result message and everything else it does not read", () => {
    const { path, at } = setup();
    at(0).onMessage(init);
    at(10).onMessage({ type: "result", subtype: "success", duration_ms: 5, total_cost_usd: 1, usage: {} });
    at(20).onMessage({ type: "assistant", message: { content: [{ type: "text", text: "hello" }] } });
    at(30).onMessage({ type: "rate_limit_event" });
    expect(readTrace(path)).toEqual([]);
  });
});

describe("tool lines", () => {
  it("write a tool line when a craft call ends, with the prefix removed and times from start and end", () => {
    const { path, at } = setup();
    at(1000).onMessage(init);
    at(1200).onToolStart({ toolName: "mcp__craft__place", toolUseId: "toolu_1", input: { item: "a", row: 0, col: 1 } });
    at(1211).onToolEnd({ toolUseId: "toolu_1" });
    expect(readTrace(path)).toEqual([
      { seq: 0, kind: "tool", toolUseId: "toolu_1", tool: "place", args: { item: "a", row: 0, col: 1 }, startMs: 200, endMs: 211 },
    ]);
  });

  it("write nothing for a tool outside the craft server, and do not count it as malformed", () => {
    const { path, at, recorder } = setup();
    at(0).onMessage(init);
    at(10).onToolStart({ toolName: "Bash", toolUseId: "toolu_x", input: {} });
    at(20).onToolEnd({ toolUseId: "toolu_x" });
    expect(readTrace(path)).toEqual([]);
    expect(recorder.skipped).toBe(0);
  });

  it("write the same line whichever hook ended the call, because the sink has one end", () => {
    const a = setup();
    const b = setup();
    for (const { at } of [a, b]) {
      at(0).onMessage(init);
      at(5).onToolStart({ toolName: "mcp__craft__craft", toolUseId: "t", input: {} });
      at(9).onToolEnd({ toolUseId: "t" });
    }
    expect(readTrace(a.path)).toEqual(readTrace(b.path));
  });

  it("write nothing for a call that started and never ended, and report it as open", () => {
    const { path, at, recorder } = setup();
    at(0).onMessage(init);
    at(5).onToolStart({ toolName: "mcp__craft__look", toolUseId: "t", input: {} });
    expect(readTrace(path)).toEqual([]);
    expect(recorder.openCalls).toBe(1);
  });
});

describe("malformed items", () => {
  it("skips and counts a message_start with no id, and writes no line for that request", () => {
    const { path, at, recorder } = setup();
    at(0).onMessage(init);
    request(at, "unused", 100, 200); // a good request first
    at(300).onMessage(start(null));
    at(350).onMessage(delta());
    at(400).onMessage(stop);
    expect(readTrace(path)).toHaveLength(1);
    expect(recorder.skipped).toBe(1);
  });

  it("skips and counts a message_delta with no usage, and writes no line for that request", () => {
    const { path, at, recorder } = setup();
    at(0).onMessage(init);
    at(100).onMessage(start("msg_1"));
    at(150).onMessage(delta(null));
    at(200).onMessage(stop);
    expect(readTrace(path)).toEqual([]);
    expect(recorder.skipped).toBe(1);
  });

  it("skips and counts a tool start with no tool_use_id", () => {
    const { path, at, recorder } = setup();
    at(0).onMessage(init);
    at(10).onToolStart({ toolName: "mcp__craft__look", input: {} });
    at(20).onToolEnd({ toolUseId: "toolu_unknown" });
    expect(readTrace(path)).toEqual([]);
    expect(recorder.skipped).toBe(1);
  });
});

describe("numbering and order", () => {
  it("numbers lines 0, 1, 2 in completion order, a request before the tools it issued", () => {
    const { path, at } = setup();
    at(0).onMessage(init);
    request(at, "msg_1", 200, 400);
    at(410).onToolStart({ toolName: "mcp__craft__help", toolUseId: "t1", input: {} });
    at(420).onToolEnd({ toolUseId: "t1" });
    request(at, "msg_2", 600, 800);
    const lines = readTrace(path);
    expect(lines.map((l) => l.seq)).toEqual([0, 1, 2]);
    expect(lines.map((l) => l.kind)).toEqual(["request", "tool", "request"]);
  });

  it("appends each line to the file as it completes", () => {
    const { path, at } = setup();
    at(0).onMessage(init);
    at(100).onMessage(start("msg_1"));
    expect(readTrace(path)).toHaveLength(0);
    at(200).onMessage(delta());
    at(300).onMessage(stop);
    expect(readTrace(path)).toHaveLength(1);
    at(310).onToolStart({ toolName: "mcp__craft__look", toolUseId: "t", input: {} });
    at(320).onToolEnd({ toolUseId: "t" });
    expect(readTrace(path)).toHaveLength(2);
  });
});

/** A whole scripted session recorded for real, with the real clock. */
async function recordSession(player: FakePlayerOptions = {}, pause?: () => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "rec-live-"));
  const tracePath = join(dir, "trace.jsonl");
  const recorder = new TraceRecorder({ path: tracePath });
  const opts: DriverOptions = { prompt: "p", world: "test/fixtures/valid/mirror-pair.json", runLog: join(dir, "run.jsonl"), runDir: dir, maxTurns: 12, record: false, signal: new AbortController().signal };
  await fakePlayer({ mode: "solve", goal: { item: "c", qty: 1 }, ...player, ...(pause ? { pause } : {}) })(opts, recorder);
  return { tracePath, recorder, dir, opts };
}

describe("a recorded session", () => {
  it("numbers lines contiguously from 0, and a reader can resume after any seq", async () => {
    const { tracePath } = await recordSession();
    const lines = readTrace(tracePath);
    expect(lines.length).toBeGreaterThan(4);
    expect(lines.map((l) => l.seq)).toEqual(lines.map((_, i) => i));
    const n = Math.floor(lines.length / 2);
    expect(linesAfter(readTrace(tracePath), n)).toEqual(lines.slice(n + 1));
  });

  it("holds offsets only: small integers, and no date or wall-clock value anywhere", async () => {
    const { tracePath } = await recordSession();
    const lines = readTrace(tracePath);
    for (const l of lines) for (const v of [l.startMs, l.endMs]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(60_000); // a wall-clock time in ms would be around 1.8e12
    }
    const text = lines.map((l) => JSON.stringify(l)).join("\n");
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(text).not.toMatch(/\d{13}/);
  });

  it("puts each line on disk as it completes, before the run is over", async () => {
    let counts: number[] = [];
    let path = "";
    const dir = mkdtempSync(join(tmpdir(), "rec-grow-"));
    path = join(dir, "trace.jsonl");
    const recorder = new TraceRecorder({ path });
    const opts: DriverOptions = { prompt: "p", world: "test/fixtures/valid/mirror-pair.json", runLog: join(dir, "run.jsonl"), runDir: dir, maxTurns: 12, record: false, signal: new AbortController().signal };
    await fakePlayer({ mode: "solve", goal: { item: "c", qty: 1 }, pause: async () => { counts.push(readTrace(path).length); } })(opts, recorder);
    const final = readTrace(path).length;
    expect(counts.some((c) => c > 0 && c < final)).toBe(true); // lines existed while the run was still going
    expect([...counts].sort((a, b) => a - b)).toEqual(counts); // and only ever grew
  });

  it("keeps two recorders fed in turn independent: separate files, separate numbering, separate turns", () => {
    const a = setup();
    const b = setup();
    a.at(0).onMessage(init);
    b.at(0).onMessage(init);
    request(a.at, "a_1", 100, 200);
    request(b.at, "b_1", 100, 200);
    request(a.at, "a_2", 300, 400);
    const la = readTrace(a.path) as RequestLine[];
    const lb = readTrace(b.path) as RequestLine[];
    expect(la.map((l) => [l.seq, l.turn, l.requestId])).toEqual([[0, 1, "a_1"], [1, 2, "a_2"]]);
    expect(lb.map((l) => [l.seq, l.turn, l.requestId])).toEqual([[0, 1, "b_1"]]);
  });
});
