import { describe, expect, it } from "vitest";
import type { LanguageModelUsage } from "ai";
import { classifyEnd, failureCode, roleTokens, skillDescription, tokensOf } from "../src/harness/ai-options.js";
import { UnknownModel } from "../src/harness/errors.js";
import { canonicalSpec, costOf, loadPrices, parseModelSpec, priceFor } from "../src/harness/models.js";

const usage = (over: Partial<LanguageModelUsage> = {}, details: Partial<LanguageModelUsage["inputTokenDetails"]> = {}): LanguageModelUsage => ({
  inputTokens: 100,
  inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined, ...details },
  outputTokens: 20,
  outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
  totalTokens: 120,
  ...over,
});

describe("canonicalSpec", () => {
  it("reads a bare Claude id as anthropic/<id> and leaves a canonical spec unchanged", () => {
    expect(canonicalSpec("claude-haiku-4-5-20251001")).toBe("anthropic/claude-haiku-4-5-20251001");
    expect(canonicalSpec("anthropic/claude-sonnet-5-5")).toBe("anthropic/claude-sonnet-5-5");
    expect(canonicalSpec("fireworks/gpt-oss-120b")).toBe("fireworks/gpt-oss-120b");
  });

  it("never throws: an unknown name is returned as it was found", () => {
    expect(canonicalSpec("mystery-model")).toBe("mystery-model");
    expect(canonicalSpec("")).toBe("");
  });
});

describe("parseModelSpec still refuses a non-Claude bare name with UnknownModel", () => {
  it("is the same error class as before", () => {
    expect(() => parseModelSpec("gpt-4o")).toThrow(UnknownModel);
  });
});

describe("the price table keys", () => {
  it("are canonical, and a bare Claude id finds the canonical entry", () => {
    const t = loadPrices();
    expect(Object.keys(t).every((k) => k.includes("/"))).toBe(true);
    expect(priceFor("claude-sonnet-5-5")).toEqual(priceFor("anthropic/claude-sonnet-5-5"));
    expect(priceFor("anthropic/claude-sonnet-5-5")).toBeDefined();
    expect(priceFor("fireworks/gpt-oss-120b")).toBeUndefined();
  });

  it("reads a bare key in a price file as anthropic/<id>", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "prices-"));
    const file = join(dir, "prices.json");
    writeFileSync(file, JSON.stringify({ _note: "x", "claude-opus-5-5": { input: 4, output: 20 }, "fireworks/x": { input: 1, output: 2 } }));
    expect(Object.keys(loadPrices(file)).sort()).toEqual(["anthropic/claude-opus-5-5", "fireworks/x"]);
  });
});

describe("tokensOf", () => {
  it("uses the provider's non-cached count when it gives one", () => {
    expect(tokensOf(usage({}, { noCacheTokens: 10, cacheReadTokens: 80, cacheWriteTokens: 10 }))).toEqual({ input: 10, output: 20, cacheRead: 80, cacheWrite: 10 });
  });

  it("derives non-cached input from the total when it does not", () => {
    expect(tokensOf(usage({}, { cacheReadTokens: 60 }))).toEqual({ input: 40, output: 20, cacheRead: 60, cacheWrite: 0 });
  });

  it("is zero for what the provider did not report, but roleTokens keeps null", () => {
    const u = usage({ inputTokens: undefined, outputTokens: undefined });
    expect(tokensOf(u)).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    expect(roleTokens(u)).toEqual({ input: null, output: null, cacheRead: null, cacheCreation: null });
  });
});

describe("costOf", () => {
  it("is null with no price, and priced per million tokens with one", () => {
    const t = { input: 1_000_000, output: 500_000, cacheRead: 2_000_000, cacheWrite: 0 };
    expect(costOf(t, undefined)).toBeNull();
    expect(costOf(t, { input: 3, output: 15, cacheRead: 0.3 })).toBeCloseTo(3 + 7.5 + 0.6, 6);
  });

  it("counts cache tokens at the input rate when the table has no cache rate", () => {
    expect(costOf({ input: 0, output: 0, cacheRead: 1_000_000, cacheWrite: 1_000_000 }, { input: 2, output: 8 })).toBeCloseTo(4, 6);
  });
});

describe("classifyEnd", () => {
  it("is stopped on a plain stop, budget when the turns ran out on a tool call, and error otherwise", () => {
    expect(classifyEnd("stop", 3, 10)).toBe("stopped");
    expect(classifyEnd("tool-calls", 10, 10)).toBe("budget");
    expect(classifyEnd("tool-calls", 4, 10)).toBe("error");
    expect(classifyEnd("length", 2, 10)).toBe("error");
    expect(classifyEnd(undefined, 0, 10)).toBe("error");
  });
});

describe("failureCode", () => {
  it("is a code from a closed set and never the error's text", () => {
    expect(failureCode({ statusCode: 401, message: "secret sk-123" })).toBe("authentication_failed");
    expect(failureCode({ statusCode: 429 })).toBe("rate_limited");
    expect(failureCode({ statusCode: 503 })).toBe("provider_unavailable");
    expect(failureCode({ statusCode: 400 })).toBe("request_rejected");
    expect(failureCode({ name: "LoadAPIKeyError", message: "FIREWORKS_API_KEY is missing" })).toBe("api_key_missing");
    expect(failureCode(new Error("anything"))).toBe("unexpected");
  });
});

describe("skillDescription", () => {
  it("reads the front matter's description, quoted or not, and is empty without one", () => {
    expect(skillDescription('---\nname: x\ndescription: "Do the thing"\n---\nbody')).toBe("Do the thing");
    expect(skillDescription("---\nname: x\n---\nbody")).toBe("");
    expect(skillDescription("no front matter")).toBe("");
  });
});

describe("the price table", () => {
  it("ships rates for the Claude models the harness defaults to, and none for a model it cannot price", async () => {
    const { DEFAULT_MODEL } = await import("../src/harness/models.js");
    const t = loadPrices();
    expect(t[DEFAULT_MODEL]).toMatchObject({ input: expect.any(Number), output: expect.any(Number) });
    expect(t["fireworks/gpt-oss-120b"]).toBeUndefined();
    expect(Object.keys(t).some((k) => k.startsWith("_"))).toBe(false); // notes are not models
  });
});
