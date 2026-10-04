import { describe, expect, it } from "vitest";
import { roleOptionsFor, roleResultFrom } from "../src/harness/sdk-options.js";

const opts = { prompt: "P", system: "S", model: "claude-test-1", schema: { type: "object" }, maxUsd: 0.75, signal: new AbortController().signal };

describe("roleOptionsFor", () => {
  const o = roleOptionsFor(opts);

  it("gives the role no tools, no servers, no plugins and no settings", () => {
    expect(o.tools).toEqual([]);
    expect(o.mcpServers).toBeUndefined();
    expect(o.plugins).toBeUndefined();
    expect(o.skills).toBeUndefined();
    expect(o.settingSources).toEqual([]);
    expect(o.hooks).toBeUndefined();
    expect(o.persistSession).toBe(false);
  });

  it("asks for a structured answer under a spend cap, on the pinned model", () => {
    expect(o.outputFormat).toEqual({ type: "json_schema", schema: { type: "object" } });
    expect(o.maxBudgetUsd).toBe(0.75);
    expect(o.model).toBe("claude-test-1");
    expect(o.systemPrompt).toBe("S");
  });

  it("ends the call when the signal aborts", () => {
    const ctl = new AbortController();
    const out = roleOptionsFor({ ...opts, signal: ctl.signal });
    expect(out.abortController?.signal.aborted).toBe(false);
    ctl.abort();
    expect(out.abortController?.signal.aborted).toBe(true);
  });
});

const ctx = { requestedModel: "claude-test-1", initModel: "claude-test-1" };

describe("roleResultFrom", () => {
  it("returns the structured answer with tokens, cost and duration", () => {
    const r = roleResultFrom(
      { subtype: "success", is_error: false, structured_output: { a: 1 }, total_cost_usd: 0.2, duration_ms: 1500, usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 }, modelUsage: { "claude-test-1": {} } },
      ctx,
    );
    expect(r).toMatchObject({ ok: true, answer: { a: 1 }, costUsd: 0.2, durationMs: 1500, requestedModel: "claude-test-1", resolvedModel: "claude-test-1" });
    expect(r.tokens).toEqual({ input: 10, output: 20, cacheRead: 30, cacheCreation: 40 });
  });

  it("reports figures the player did not give as null, not zero", () => {
    const r = roleResultFrom({ subtype: "success", is_error: false, structured_output: {} }, { requestedModel: "m", initModel: null });
    expect(r.tokens).toEqual({ input: null, output: null, cacheRead: null, cacheCreation: null });
    expect(r.costUsd).toBeNull();
    expect(r.durationMs).toBeNull();
    expect(r.resolvedModel).toBeNull();
  });

  it.each([
    ["a spend stop", { subtype: "error_max_budget_usd", is_error: true }, "DriverFailed: the role reached its spend cap"],
    ["a structured-output failure", { subtype: "error_max_structured_output_retries", is_error: true }, "DriverFailed: the role could not give the requested format"],
    ["an error result", { subtype: "error_during_execution", is_error: true, terminal_reason: "api_error" }, "DriverFailed: the role ended with an error result (api_error)"],
    ["a success with no structured answer", { subtype: "success", is_error: false, result: "AGENT TEXT SECRET" }, "DriverFailed: the role gave no structured answer"],
  ])("maps %s to a fixed reason that holds no agent text", (_why, result, reason) => {
    const r = roleResultFrom(result as Record<string, unknown>, ctx);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(reason);
    expect(JSON.stringify(r)).not.toContain("SECRET");
  });
});
