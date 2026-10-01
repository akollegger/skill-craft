import { describe, expect, it, vi } from "vitest";
import type { DriverOptions, DriverSink } from "../src/harness/driver.js";
import { buildHooks, classifyResult, craftServer, playerResultFrom, sdkOptionsFor } from "../src/harness/sdk-options.js";

const base = (over: Partial<DriverOptions> = {}): DriverOptions => ({
  prompt: "p", world: "/w/world.json", runLog: "/r/run.jsonl", runDir: "/r", maxTurns: 20, record: false,
  signal: new AbortController().signal, ...over,
});
const sink = (): DriverSink => ({ onMessage: vi.fn(), onToolStart: vi.fn(), onToolEnd: vi.fn() });

describe("sdkOptionsFor", () => {
  it("removes built-in tools, isolates settings, and approves only the craft server", () => {
    const o = sdkOptionsFor(base(), sink());
    expect(o.tools).toEqual([]);
    expect(o.allowedTools).toEqual(["mcp__craft"]);
    expect(o.strictMcpConfig).toBe(true);
    expect(o.persistSession).toBe(false);
    expect(o.includePartialMessages).toBe(true);
    expect(o.settingSources).toEqual([]);
    expect(o.maxTurns).toBe(20);
    expect(o.cwd).toBe("/r");
  });

  it("points the craft server at the world and a fresh run log, with absolute paths", () => {
    const craft = sdkOptionsFor(base(), sink()).mcpServers?.["craft"] as { command: string; args: string[]; env: Record<string, string> };
    expect(craft.command).toMatch(/^\/.*node_modules\/\.bin\/tsx$/);
    expect(craft.args[0]).toMatch(/^\/.*src\/mcp\/server\.ts$/);
    expect(craft.env["SIM_WORLD"]).toBe("/w/world.json");
    expect(craft.env["SIM_RUN_LOG"]).toBe("/r/run.jsonl");
  });

  it("gives the running server a PATH so it can start, but craftServer alone (what is written to disk) has none", () => {
    const running = sdkOptionsFor(base(), sink()).mcpServers?.["craft"] as { env: Record<string, string> };
    expect(running.env["PATH"]).toBe(process.env["PATH"]);
    expect(craftServer("/w/world.json", "/r/run.jsonl").env).toEqual({ SIM_WORLD: "/w/world.json", SIM_RUN_LOG: "/r/run.jsonl" });
  });

  it("lets user settings (and so nams-hooks) apply only when recording is asked for", () => {
    expect(sdkOptionsFor(base({ record: true }), sink()).settingSources).toEqual(["user", "project"]);
  });

  it("passes a model only when one is given", () => {
    expect(sdkOptionsFor(base(), sink())).not.toHaveProperty("model");
    expect(sdkOptionsFor(base({ model: "m-1" }), sink()).model).toBe("m-1");
  });

  it("sets no telemetry variables and leaves the environment to be inherited", () => {
    expect(sdkOptionsFor(base(), sink())).not.toHaveProperty("env");
  });

  it("ties an abort controller to the signal", () => {
    const outer = new AbortController();
    const o = sdkOptionsFor(base({ signal: outer.signal }), sink());
    expect(o.abortController?.signal.aborted).toBe(false);
    outer.abort();
    expect(o.abortController?.signal.aborted).toBe(true);
  });

  it("starts aborted when the signal already is", () => {
    const outer = new AbortController();
    outer.abort();
    expect(sdkOptionsFor(base({ signal: outer.signal }), sink()).abortController?.signal.aborted).toBe(true);
  });
});

describe("buildHooks", () => {
  const call = async (hooks: ReturnType<typeof buildHooks>, event: "PreToolUse" | "PostToolUse" | "PostToolUseFailure", input: object) => {
    const cb = hooks[event]?.[0]?.hooks[0];
    return cb?.(input as never, undefined, { signal: new AbortController().signal });
  };

  it("forwards a tool start with its name, id and input, and returns an empty decision", async () => {
    const s = sink();
    const out = await call(buildHooks(s), "PreToolUse", { tool_name: "mcp__craft__place", tool_use_id: "t1", tool_input: { item: "a" } });
    expect(s.onToolStart).toHaveBeenCalledWith({ toolName: "mcp__craft__place", toolUseId: "t1", input: { item: "a" } });
    expect(out).toEqual({});
  });

  it("ends a call on PostToolUse", async () => {
    const s = sink();
    await call(buildHooks(s), "PostToolUse", { tool_use_id: "t1" });
    expect(s.onToolEnd).toHaveBeenCalledWith({ toolUseId: "t1" });
  });

  it("ends a call on PostToolUseFailure too, in case a refusal fires it", async () => {
    const s = sink();
    await call(buildHooks(s), "PostToolUseFailure", { tool_use_id: "t2", error: "refused" });
    expect(s.onToolEnd).toHaveBeenCalledWith({ toolUseId: "t2" });
  });
});

describe("classifyResult", () => {
  it("is stopped for a success", () => {
    expect(classifyResult({ subtype: "success" }, false)).toBe("stopped");
  });

  it("is budget for error_max_turns, even when the SDK threw after delivering it", () => {
    expect(classifyResult({ subtype: "error_max_turns" }, true)).toBe("budget");
    expect(classifyResult({ subtype: "error_max_turns" }, false)).toBe("budget");
  });

  it("is error for another error subtype", () => {
    expect(classifyResult({ subtype: "error_during_execution" }, false)).toBe("error");
  });

  it("is error for a success-shaped result that is flagged as an error, such as a login failure", () => {
    expect(classifyResult({ subtype: "success", is_error: true }, false)).toBe("error");
    expect(classifyResult({ subtype: "success", is_error: false }, false)).toBe("stopped");
  });

  it("is still budget for error_max_turns even though that result is flagged as an error", () => {
    expect(classifyResult({ subtype: "error_max_turns", is_error: true }, false)).toBe("budget");
  });

  it("is error for a throw with no result", () => {
    expect(classifyResult(null, true)).toBe("error");
  });
});

describe("playerResultFrom", () => {
  const result = {
    subtype: "success", num_turns: 4, total_cost_usd: 0.05, duration_ms: 4000, result: "I hold it.",
    usage: { input_tokens: 8, output_tokens: 40, cache_read_input_tokens: 400, cache_creation_input_tokens: 200 },
    modelUsage: { "m-b": {}, "m-a": {} },
  };

  it("maps the result's figures, sorts the models used, and carries the requested and init models", () => {
    expect(playerResultFrom(result, { requestedModel: "m-a", initModel: "m-a", threw: false })).toEqual({
      ended: "stopped", turns: 4, costUsd: 0.05, durationMs: 4000,
      usage: { inputTokens: 8, outputTokens: 40, cacheReadTokens: 400, cacheCreationTokens: 200 },
      requestedModel: "m-a", initModel: "m-a", modelsUsed: ["m-a", "m-b"], text: "I hold it.",
    });
  });

  it("gives a fixed reason, never the error text, when the player ended with an error subtype", () => {
    const r = playerResultFrom({ ...result, subtype: "error_during_execution", errors: ["/Users/someone/secret"] }, { requestedModel: null, initModel: null, threw: false });
    expect(r.ended).toBe("error");
    expect(r.reason).toBe("DriverFailed: player ended with error_during_execution");
    expect(JSON.stringify(r)).not.toContain("secret");
  });

  describe("a result flagged as an error although its subtype is success", () => {
    const failed = { subtype: "success", is_error: true, terminal_reason: "api_error", num_turns: 1, total_cost_usd: 0, duration_ms: 90, result: "Failed to authenticate: OAuth session expired and could not be refreshed", usage: { input_tokens: 0, output_tokens: 0 } };

    it("is an error with a reason that names the assistant's error code, and keeps no message text", () => {
      const r = playerResultFrom(failed, { requestedModel: null, initModel: "m-1", threw: false, assistantError: "authentication_failed" });
      expect(r.ended).toBe("error");
      expect(r.reason).toBe("DriverFailed: the player reported authentication_failed");
      expect(r.text).toBe("");
      expect(JSON.stringify(r)).not.toContain("OAuth");
    });

    it("falls back to the terminal reason when there was no assistant error", () => {
      const r = playerResultFrom(failed, { requestedModel: null, initModel: null, threw: false });
      expect(r.reason).toBe("DriverFailed: player ended with an error result (api_error)");
    });

    it("only ever embeds a code made of lowercase letters and underscores", () => {
      const r = playerResultFrom({ ...failed, terminal_reason: "/Users/someone/secret" }, { requestedModel: null, initModel: null, threw: false, assistantError: "has spaces and /paths" });
      expect(r.reason).toBe("DriverFailed: player ended with an error result");
      expect(JSON.stringify(r)).not.toContain("secret");
    });
  });

  it("tolerates a result with missing figures", () => {
    const r = playerResultFrom({ subtype: "success" }, { requestedModel: null, initModel: null, threw: false });
    expect(r).toMatchObject({ turns: null, costUsd: null, durationMs: null, usage: null, modelsUsed: [], text: "" });
  });
});
