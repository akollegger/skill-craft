import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DriverOptions, PlayerResult } from "../src/harness/driver.js";
import { DriverAborted } from "../src/harness/driver.js";
import { TraceRecorder } from "../src/trace/recorder.js";
import { noServersSoon, ownServers } from "./helpers/processes.js";

// Fault injection: the provider is a scripted model that fails, stalls or runs on, and the craft server is the real one.
// Each case states what a run does when the thing around the model misbehaves, so a provider problem is not mistaken
// for a model's failure in the data. No case calls a model.
const control = vi.hoisted(() => ({ model: undefined as unknown }));
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: () => () => control.model }));
vi.mock("@ai-sdk/fireworks", () => ({ createFireworks: () => () => control.model }));

const { MockLanguageModelV4 } = await import("ai/test");
const { APICallError } = await import("ai");
const { aiDriver } = await import("../src/harness/ai-driver.js");

type Result = ConstructorParameters<typeof MockLanguageModelV4>[0] extends infer O ? (O extends { doGenerate?: infer D } ? Extract<D, unknown[]>[number] : never) : never;
type Step = Result | ((options: { abortSignal?: AbortSignal }) => Promise<Result>);

const usage = (input: number, output: number, cacheRead = 0) => ({
  inputTokens: { total: input + cacheRead, noCache: input, cacheRead, cacheWrite: undefined },
  outputTokens: { total: output, text: output, reasoning: undefined },
});
const call = (id: string, toolName: string, input: object = {}): Result =>
  ({ content: [{ type: "tool-call", toolCallId: id, toolName, input: JSON.stringify(input) }], finishReason: { unified: "tool-calls", raw: undefined }, usage: usage(10, 5, 100), warnings: [] }) as Result;
const say = (text: string): Result => ({ content: [{ type: "text", text }], finishReason: { unified: "stop", raw: undefined }, usage: usage(12, 3, 110), warnings: [] }) as Result;
const cutOff = (): Result => ({ content: [{ type: "text", text: "partial" }], finishReason: { unified: "length", raw: undefined }, usage: usage(12, 3, 110), warnings: [] }) as Result;

/** A model that answers each request from the next step, a result or a function that may wait, throw or act. */
const sequence = (...steps: Step[]) => {
  let n = 0;
  return (control.model = new MockLanguageModelV4({
    modelId: "m",
    doGenerate: (async (options: { abortSignal?: AbortSignal }) => {
      const step = steps[Math.min(n++, steps.length - 1)] as Step;
      return typeof step === "function" ? step(options) : step;
    }) as never,
  }));
};
/** A request that never returns until it is aborted, as a hung provider does. */
const stalls = (): ((options: { abortSignal?: AbortSignal }) => Promise<Result>) => (options) =>
  new Promise((_, reject) => {
    const stop = () => reject(options.abortSignal?.reason ?? Object.assign(new Error("aborted"), { name: "AbortError" }));
    if (options.abortSignal?.aborted) stop();
    else options.abortSignal?.addEventListener("abort", stop);
  });
const apiError = (over: Record<string, unknown>) => new APICallError({ message: "provider said SECRET-BODY", url: "u", requestBodyValues: {}, ...over } as never);

const WORLD = resolve("worlds/generated/forge-7.json");
const setup = (over: Partial<DriverOptions> = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "ai-faults-"));
  const opts: DriverOptions = { prompt: "play", world: WORLD, runLog: join(dir, "run.jsonl"), runDir: dir, maxTurns: 8, signal: new AbortController().signal, ...over };
  return { dir, opts, recorder: new TraceRecorder({ path: join(dir, "trace.jsonl") }) };
};
const calls = () => (control.model as InstanceType<typeof MockLanguageModelV4>).doGenerateCalls;
const noText = (r: PlayerResult) => expect(JSON.stringify(r)).not.toContain("SECRET-BODY");

beforeEach(() => {
  control.model = undefined;
});

describe("a provider that fails", () => {
  it("gives up at once on a 429 that asks for a long wait, instead of retrying sooner than asked", async () => {
    sequence(() => Promise.reject(apiError({ statusCode: 429, isRetryable: true, responseHeaders: { "retry-after": "90" } })));
    const { opts, recorder } = setup();
    const r = await aiDriver(opts, recorder);
    expect(r).toMatchObject({ ended: "error", reason: "DriverFailed: the player reported rate_limited", retries: { max: 2, failedAttempts: 1 }, costUsd: null, turns: null, usage: null }); // no response came back, so there is no cost figure, not a cost of zero
    expect(calls()).toHaveLength(1);
    noText(r);
  }, 30_000);

  it("still retries a 429 that asks for a short wait", async () => {
    sequence(() => Promise.reject(apiError({ statusCode: 429, isRetryable: true, responseHeaders: { "retry-after-ms": "5" } })), say("done"));
    const { opts, recorder } = setup();
    expect(await aiDriver(opts, recorder)).toMatchObject({ ended: "stopped", retries: { max: 2, failedAttempts: 1 } });
  }, 30_000);

  it("retries a 529 and then succeeds, and keeps the failed attempts out of the trace", async () => {
    sequence(() => Promise.reject(apiError({ statusCode: 529, isRetryable: true, responseHeaders: { "retry-after-ms": "5" } })), say("done"));
    const { opts, recorder, dir } = setup();
    const r = await aiDriver(opts, recorder);
    expect(r).toMatchObject({ ended: "stopped", turns: 1, retries: { max: 2, failedAttempts: 1 } });
    expect(readFileSync(join(dir, "trace.jsonl"), "utf8").split("\n").filter((l) => l.includes('"request"'))).toHaveLength(1);
  }, 30_000);

  it("reports a dropped connection, which has no status, as the provider being unreachable", async () => {
    sequence(() => Promise.reject(apiError({ isRetryable: true, cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }), responseHeaders: { "retry-after-ms": "5" } })));
    const { opts, recorder } = setup();
    const r = await aiDriver(opts, recorder);
    expect(r).toMatchObject({ ended: "error", reason: "DriverFailed: the player reported provider_unreachable", retries: { max: 2, failedAttempts: 3 } });
    noText(r);
  }, 30_000);

  it("reports a 408 as the provider being unavailable", async () => {
    sequence(() => Promise.reject(apiError({ statusCode: 408, isRetryable: true, responseHeaders: { "retry-after-ms": "5" } })));
    const { opts, recorder } = setup();
    expect(await aiDriver(opts, recorder)).toMatchObject({ ended: "error", reason: "DriverFailed: the player reported provider_unavailable" });
  }, 30_000);

  it("reports a prompt over the context window as that, not as a generic rejection, and does not retry it", async () => {
    sequence(() => Promise.reject(apiError({ statusCode: 400, isRetryable: false, message: "prompt is too long: 250000 tokens > 200000 maximum" })));
    const { opts, recorder } = setup();
    const r = await aiDriver(opts, recorder);
    expect(r).toMatchObject({ ended: "error", reason: "DriverFailed: the player reported context_length_exceeded", retries: { max: 2, failedAttempts: 1 } });
    expect(r.reason).not.toContain("250000");
  }, 30_000);

  it("keeps the usage of the steps that finished when a later step fails", async () => {
    sequence(call("c1", "look"), () => Promise.reject(apiError({ statusCode: 401, isRetryable: false })));
    const { opts, recorder } = setup();
    const r = await aiDriver(opts, recorder);
    expect(r).toMatchObject({ ended: "error", reason: "DriverFailed: the player reported authentication_failed", turns: 1, usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 100, cacheCreationTokens: 0 } });
  }, 30_000);
});

describe("a response that is cut off", () => {
  it("ends the run as an error with its own code, and leaves the output ceiling to the provider unless one is set", async () => {
    sequence(cutOff());
    const { opts, recorder } = setup();
    const r = await aiDriver(opts, recorder);
    expect(r).toMatchObject({ ended: "error", reason: "DriverFailed: the player reported output_limit", text: "" });
    expect(calls()[0]?.maxOutputTokens).toBeUndefined(); // a thinking budget needs a ceiling above it, so no default is imposed
  }, 30_000);

  it("uses the ceiling the caller set", async () => {
    sequence(say("done"));
    const { opts, recorder } = setup({ limits: { maxOutputTokens: 777 } });
    await aiDriver(opts, recorder);
    expect(calls()[0]?.maxOutputTokens).toBe(777);
  }, 30_000);
});

describe("a call that stalls", () => {
  it("ends the run as a step timeout, keeps the finished step's usage, and is not retried", async () => {
    sequence(call("c1", "look"), stalls());
    const { opts, recorder } = setup({ limits: { stepTimeoutMs: 400 } });
    const r = await aiDriver(opts, recorder);
    expect(r).toMatchObject({ ended: "error", reason: "DriverFailed: the player reported step_timeout", turns: 1, usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 100, cacheCreationTokens: 0 } });
    expect(calls()).toHaveLength(2);
    expect(await noServersSoon()).toEqual([]);
  }, 30_000);

  it("records no cost, and not a cost of zero, for a first step that stalls, on a model that has a price", async () => {
    sequence(stalls());
    const { opts, recorder } = setup({ model: "claude-haiku-4-5-20251001", limits: { stepTimeoutMs: 300 } });
    expect(await aiDriver(opts, recorder)).toMatchObject({ ended: "error", reason: "DriverFailed: the player reported step_timeout", turns: null, usage: null, costUsd: null });
  }, 30_000);

  it("ends the run when a craft tool does not answer in time", async () => {
    // One call can beat a 1 ms timer on a fast machine; thirty at once cannot all do so, and any one timing out ends the run.
    const many: Result = { ...call("c0", "look"), content: Array.from({ length: 30 }, (_, i) => ({ type: "tool-call" as const, toolCallId: `c${i}`, toolName: "look", input: "{}" })) } as Result;
    sequence(many, say("never reached"));
    const { opts, recorder } = setup({ limits: { toolTimeoutMs: 1 } });
    const r = await aiDriver(opts, recorder);
    expect(r).toMatchObject({ ended: "error", reason: "DriverFailed: the player reported tool_timeout" });
    expect(await noServersSoon()).toEqual([]);
  }, 30_000);
});

describe("a run that is aborted", () => {
  it("rejects with the usage of the steps that finished, so the cost of a timed-out run is not lost", async () => {
    const stop = new AbortController();
    sequence(call("c1", "look"), call("c2", "inventory"), () => {
      stop.abort();
      return stalls()({ abortSignal: stop.signal });
    });
    const { opts, recorder } = setup({ signal: stop.signal });
    const error = await aiDriver(opts, recorder).then(() => undefined, (e: unknown) => e);
    expect(error).toBeInstanceOf(DriverAborted);
    expect((error as DriverAborted).partial).toMatchObject({ ended: "error", turns: 2, usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 200, cacheCreationTokens: 0 } });
    expect(await noServersSoon()).toEqual([]);
  }, 30_000);
});

describe("a run with a spend cap", () => {
  it("stops after the step that crosses a token cap, and says so", async () => {
    sequence(call("c1", "look"), call("c2", "look"), call("c3", "look"), say("done")); // 115 tokens a step
    const { opts, recorder } = setup({ limits: { maxTotalTokens: 200 } });
    const r = await aiDriver(opts, recorder);
    expect(r).toMatchObject({ ended: "budget", reason: "SpendCap: the player reached its spend cap", turns: 2 });
    expect(calls()).toHaveLength(2);
  }, 30_000);

  it("stops at a dollar cap when a price was given", async () => {
    sequence(call("c1", "look"), call("c2", "look"), say("done"));
    const price = { source: "market-quote" as const, openRouterId: "anthropic/claude-haiku-4.5", fetchedAt: "2026-10-12T12:00:00.000Z", perMillion: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 } };
    const { opts, recorder } = setup({ model: "claude-haiku-4-5-20251001", price, limits: { maxUsd: 0.00001 } });
    const r = await aiDriver(opts, recorder);
    expect(r).toMatchObject({ ended: "budget", reason: "SpendCap: the player reached its spend cap", turns: 1 });
  }, 30_000);

  it("does not call a normal finish a budget stop, even over the cap", async () => {
    sequence(say("done"));
    const { opts, recorder } = setup({ limits: { maxTotalTokens: 10 } });
    expect(await aiDriver(opts, recorder)).toMatchObject({ ended: "stopped" });
  }, 30_000);
});

describe("a craft server that dies", () => {
  it("ends the run as server_lost after the first call that cannot reach it, instead of spending turns on doomed calls", async () => {
    sequence(call("c1", "look"), async () => {
      for (const s of ownServers()) process.kill(s.pid, "SIGKILL");
      await new Promise((r) => setTimeout(r, 300));
      return call("c2", "look");
    }, call("c3", "look"), say("never reached"));
    const { opts, recorder } = setup();
    const r = await aiDriver(opts, recorder);
    expect(r).toMatchObject({ ended: "error", reason: "DriverFailed: the player reported server_lost", turns: 2 });
    expect(calls()).toHaveLength(2);
    expect(await noServersSoon()).toEqual([]);
  }, 30_000);
});

describe("tool calls that are not valid", () => {
  it("end the run as tool_loop after a streak of steps with only invalid calls, and count them", async () => {
    sequence(call("n1", "no-such-tool"), call("n2", "no-such-tool"), call("n3", "no-such-tool"), call("n4", "no-such-tool"), call("n5", "no-such-tool"), say("never reached"));
    const { opts, recorder } = setup();
    const r = await aiDriver(opts, recorder);
    expect(r).toMatchObject({ ended: "error", reason: "DriverFailed: the player reported tool_loop", turns: 5, invalidToolCalls: 5 });
    expect(calls()).toHaveLength(5);
  }, 30_000);

  it("do not end a run that goes back to valid calls, but are still counted", async () => {
    sequence(call("n1", "no-such-tool"), call("n2", "no-such-tool"), call("c1", "look"), say("done"));
    const { opts, recorder } = setup();
    expect(await aiDriver(opts, recorder)).toMatchObject({ ended: "stopped", turns: 4, invalidToolCalls: 2 });
  }, 30_000);

  it("are reported as zero for a run that made none", async () => {
    sequence(call("c1", "look"), say("done"));
    const { opts, recorder } = setup();
    expect(await aiDriver(opts, recorder)).toMatchObject({ invalidToolCalls: 0 });
  }, 30_000);
});
