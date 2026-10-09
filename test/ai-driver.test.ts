import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DriverOptions } from "../src/harness/driver.js";
import { installSkill } from "../src/harness/skill.js";
import { readTrace, type RequestLine, type ToolLine } from "../src/trace/lines.js";
import { TraceRecorder } from "../src/trace/recorder.js";

// The providers are replaced by a scripted model from the SDK's own test kit, so the driver's wiring (the craft
// server over stdio, the tool loop, the trace, the result) runs for real while no model is called.
const control = vi.hoisted(() => ({ model: undefined as unknown }));
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: () => () => control.model }));
vi.mock("@ai-sdk/fireworks", () => ({ createFireworks: () => () => control.model }));

const { MockLanguageModelV4 } = await import("ai/test");
const { aiDriver, aiRoleDriver } = await import("../src/harness/ai-driver.js");

type Result = ConstructorParameters<typeof MockLanguageModelV4>[0] extends infer O ? (O extends { doGenerate?: infer D } ? Extract<D, unknown[]>[number] : never) : never;

const usage = (input: number, output: number, cacheRead = 0) => ({
  inputTokens: { total: input + cacheRead, noCache: input, cacheRead, cacheWrite: undefined },
  outputTokens: { total: output, text: output, reasoning: undefined },
});
const call = (id: string, toolName: string, input: object = {}): Result =>
  ({ content: [{ type: "tool-call", toolCallId: id, toolName, input: JSON.stringify(input) }], finishReason: { unified: "tool-calls", raw: undefined }, usage: usage(10, 5, 100), warnings: [] }) as Result;
const say = (text: string): Result => ({ content: [{ type: "text", text }], finishReason: { unified: "stop", raw: undefined }, usage: usage(12, 3, 110), warnings: [] }) as Result;
const scripted = (...results: Result[]) => (control.model = new MockLanguageModelV4({ modelId: "m", doGenerate: results }));

const WORLD = resolve("worlds/generated/forge-7.json");
const setup = (over: Partial<DriverOptions> = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "ai-driver-"));
  const trace = join(dir, "trace.jsonl");
  const opts: DriverOptions = { prompt: "play", world: WORLD, runLog: join(dir, "run.jsonl"), runDir: dir, maxTurns: 5, signal: new AbortController().signal, ...over };
  return { dir, trace, opts, recorder: new TraceRecorder({ path: trace }) };
};

beforeEach(() => {
  control.model = undefined;
});

describe("aiDriver", () => {
  it("plays through the craft server and records requests and tool calls whose tokens add up to the result", async () => {
    scripted(call("c1", "look"), call("c2", "inventory"), say("done"));
    const { opts, recorder, trace } = setup({ model: "claude-haiku-4-5-20251001" });
    const r = await aiDriver(opts, recorder);

    expect(r).toMatchObject({ ended: "stopped", turns: 3, requestedModel: "claude-haiku-4-5-20251001", initModel: "claude-haiku-4-5-20251001", modelsUsed: ["claude-haiku-4-5-20251001"], text: "done" });
    expect(r.costUsd).toBeCloseTo(0.000128, 9); // from prices.json: 32 in, 13 out, 310 cached at the haiku rates
    expect(r.usage).toEqual({ inputTokens: 32, outputTokens: 13, cacheReadTokens: 310, cacheCreationTokens: 0 });
    const lines = readTrace(trace);
    const requests = lines.filter((l): l is RequestLine => l.kind === "request");
    const tools = lines.filter((l): l is ToolLine => l.kind === "tool");
    expect(requests).toHaveLength(3);
    expect(requests.reduce((a, q) => a + q.inputTokens, 0)).toBe(r.usage?.inputTokens);
    expect(requests.reduce((a, q) => a + q.cacheReadTokens, 0)).toBe(r.usage?.cacheReadTokens);
    expect(tools.map((t) => t.tool)).toEqual(["look", "inventory"]);
    expect(readFileSync(opts.runLog, "utf8").trim().split("\n")).toHaveLength(2); // the server's own log agrees
  }, 30_000);

  it("calls a Fireworks model through its provider and records the spec that ran", async () => {
    scripted(say("done"));
    const { opts, recorder } = setup({ model: "fireworks/gpt-oss-120b" });
    expect(await aiDriver(opts, recorder)).toMatchObject({ ended: "stopped", initModel: "fireworks/gpt-oss-120b", modelsUsed: ["fireworks/gpt-oss-120b"] });
  }, 30_000);

  it("reports the turn budget as spent when the agent still wants a tool", async () => {
    scripted(call("c1", "look"), call("c2", "look"), call("c3", "look"));
    const { opts, recorder } = setup({ maxTurns: 2 });
    expect(await aiDriver(opts, recorder)).toMatchObject({ ended: "budget", turns: 2 });
  }, 30_000);

  it("records a refused call as a tool line too", async () => {
    scripted(call("c1", "place", { item: "zz-no-such-item", row: 0, col: 0 }), say("done"));
    const { opts, recorder, trace } = setup();
    await aiDriver(opts, recorder);
    expect(readTrace(trace).filter((l) => l.kind === "tool")).toHaveLength(1);
    expect(readFileSync(opts.runLog, "utf8")).toContain('"ok":false');
  }, 30_000);

  it("turns a provider failure into an error with a fixed reason and no text of the error", async () => {
    control.model = new MockLanguageModelV4({
      modelId: "m",
      doGenerate: async () => {
        throw Object.assign(new Error("secret sk-live-123 leaked"), { statusCode: 429 });
      },
    });
    const { opts, recorder } = setup();
    const r = await aiDriver(opts, recorder);
    expect(r).toMatchObject({ ended: "error", reason: "DriverFailed: the player reported rate_limited", turns: null, usage: null });
    expect(JSON.stringify(r)).not.toContain("sk-live");
  }, 30_000);

  it("rejects when the run is cancelled, so the harness reports a cancellation", async () => {
    scripted(say("done"));
    const stop = new AbortController();
    stop.abort();
    const { opts, recorder } = setup({ signal: stop.signal });
    await expect(aiDriver(opts, recorder)).rejects.toBeDefined();
  }, 30_000);

  it("gives the agent the skill as a tool, and reports when it loaded it", async () => {
    scripted(call("s1", "Skill"), call("c1", "look"), say("done"));
    const { dir, opts, recorder } = setup();
    const skill = installSkill(dir, resolve("spikes/skill-pilot/craft-glirol"));
    const r = await aiDriver({ ...opts, skill: { pluginDir: resolve(skill.pluginDir), qualifiedName: skill.qualifiedName } }, recorder);
    expect(r).toMatchObject({ ended: "stopped", skillInvoked: true, skillLoadedAfterCalls: 0 });
    const model = control.model as InstanceType<typeof MockLanguageModelV4>;
    expect(JSON.stringify(model.doGenerateCalls[0]?.tools)).toContain("Skill");
  }, 30_000);

  it("has no skill tool, and reports nothing about one, when none is installed", async () => {
    scripted(say("done"));
    const { opts, recorder } = setup();
    const r = await aiDriver(opts, recorder);
    expect(r).not.toHaveProperty("skillInvoked");
    const model = control.model as InstanceType<typeof MockLanguageModelV4>;
    expect(JSON.stringify(model.doGenerateCalls[0]?.tools)).not.toContain("Skill");
  }, 30_000);
});

describe("aiRoleDriver", () => {
  const schema = { type: "object", properties: { n: { type: "number" } }, required: ["n"], additionalProperties: false };
  const role = (over: object = {}) => ({ prompt: "p", model: "claude-opus-5-5", schema, maxUsd: 1, signal: new AbortController().signal, ...over });

  it("returns the schema-checked answer with tokens, and sends no tools", async () => {
    scripted(say('{"n":7}'));
    const r = await aiRoleDriver(role());
    expect(r).toMatchObject({ ok: true, answer: { n: 7 }, requestedModel: "claude-opus-5-5", resolvedModel: "claude-opus-5-5" });
    expect(r.costUsd).toBeCloseTo(0.00013, 9);
    expect(r.tokens).toEqual({ input: 12, output: 3, cacheRead: 110, cacheCreation: null });
    const model = control.model as InstanceType<typeof MockLanguageModelV4>;
    expect(model.doGenerateCalls[0]?.tools ?? []).toEqual([]);
  });

  it("fails with fixed text when the answer does not match the schema", async () => {
    scripted(say("not json at all"));
    const r = await aiRoleDriver(role());
    expect(r).toMatchObject({ ok: false, reason: "DriverFailed: the role could not give the requested format" });
    expect(JSON.stringify(r)).not.toContain("not json");
  });

  it("fails with a code on a provider error", async () => {
    control.model = new MockLanguageModelV4({ modelId: "m", doGenerate: async () => { throw Object.assign(new Error("boom"), { statusCode: 500 }); } });
    expect(await aiRoleDriver(role())).toMatchObject({ ok: false, reason: "DriverFailed: the role reported provider_unavailable" });
  });
});
