import { resolve } from "node:path";
import type { HookCallback, HookCallbackMatcher, HookEvent, Options } from "@anthropic-ai/claude-agent-sdk";
import type { DriverOptions, DriverSink, PlayerResult } from "./driver.js";
import { REPO } from "./paths.js";

// Type-only imports above: loading this file never loads the SDK, so dry runs and tests stay light.

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Tool hooks that forward to the sink. Either post hook ends a call: a refused call is an error result and
 * may arrive through `PostToolUseFailure`, which the first real run will show.
 */
export function buildHooks(sink: DriverSink): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const start: HookCallback = async (input) => {
    const i = input as unknown as Record<string, unknown>;
    sink.onToolStart({ toolName: str(i["tool_name"]), toolUseId: str(i["tool_use_id"]), input: i["tool_input"] });
    return {};
  };
  const end: HookCallback = async (input) => {
    sink.onToolEnd({ toolUseId: str((input as unknown as Record<string, unknown>)["tool_use_id"]) });
    return {};
  };
  return { PreToolUse: [{ hooks: [start] }], PostToolUse: [{ hooks: [end] }], PostToolUseFailure: [{ hooks: [end] }] };
}

/**
 * The craft MCP server as the player starts it: absolute paths, because it runs in the run folder, not the
 * repo. This is also what `mcp.json` records, so it holds no environment beyond the two variables the server
 * reads; the operator's PATH stays in memory (see `sdkOptionsFor`) and is never written or printed.
 */
export function craftServer(world: string, runLog: string) {
  return {
    type: "stdio" as const,
    command: resolve(REPO, "node_modules/.bin/tsx"),
    args: [resolve(REPO, "src/mcp/server.ts")],
    env: { SIM_WORLD: world, SIM_RUN_LOG: runLog } as Record<string, string>,
  };
}

const withPath = (server: ReturnType<typeof craftServer>) => ({ ...server, env: { ...server.env, PATH: process.env["PATH"] ?? "" } });

/** The options the harness has always passed to the CLI, now for `query()`. */
export function sdkOptionsFor(opts: DriverOptions, sink: DriverSink): Options {
  const abortController = new AbortController();
  if (opts.signal.aborted) abortController.abort();
  else opts.signal.addEventListener("abort", () => abortController.abort(), { once: true });

  return {
    cwd: opts.runDir,
    // The server needs a PATH to find `node`; it is added here, for the live call only.
    mcpServers: { craft: withPath(craftServer(opts.world, opts.runLog)) },
    strictMcpConfig: true,
    // No built-in tools, so the agent cannot read the world file. With a skill the agent gets the Skill tool and
    // nothing else (no Read, no Bash), so it can load the skill but still cannot reach the world.
    tools: opts.skill ? ["Skill"] : [],
    allowedTools: ["mcp__craft"],
    maxTurns: opts.maxTurns,
    persistSession: false,
    includePartialMessages: true,
    // User settings carry the NAMS hooks; they load only when the run is being recorded.
    settingSources: opts.record ? ["user", "project"] : [],
    hooks: buildHooks(sink),
    abortController,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.skill ? { plugins: [{ type: "local" as const, path: opts.skill.pluginDir }], skills: [opts.skill.qualifiedName] } : {}),
  };
}

/**
 * Running out of turns is reported as an error result, and the SDK throws after it; it is a budget stop.
 * The result message is the authority, so a throw after one never changes the answer (`_threw` documents
 * that the caller knows of it); no result at all, thrown or not, is an error.
 */
export function classifyResult(result: { subtype?: string; is_error?: boolean } | null, _threw: boolean): PlayerResult["ended"] {
  if (result === null) return "error";
  if (result.subtype === "error_max_turns") return "budget";
  // A login failure arrives as subtype "success" with is_error set; the agent did not give up, it never started.
  return result.subtype === "success" && result.is_error !== true ? "stopped" : "error";
}

/** A code from the SDK's closed sets (such as `authentication_failed`); anything else is not embedded in a reason. */
const code = (v: unknown): string | undefined => (typeof v === "string" && /^[a-z][a-z_]*$/.test(v) ? v : undefined);

/** Build the harness's view of a finished run from the SDK's result message. */
export function playerResultFrom(
  result: Record<string, unknown>,
  ctx: { requestedModel: string | null; initModel: string | null; threw: boolean; assistantError?: string | undefined; skillLoadedAfterCalls?: number | null | undefined },
): PlayerResult {
  const ended = classifyResult({ subtype: str(result["subtype"]) ?? "", is_error: result["is_error"] === true }, ctx.threw);
  const assistantError = code(ctx.assistantError);
  const terminal = code(result["terminal_reason"]);
  // Always fixed text plus a code from a closed set; the player's own error message is never kept.
  const reason =
    assistantError !== undefined ? `DriverFailed: the player reported ${assistantError}`
    : result["is_error"] === true ? `DriverFailed: player ended with an error result${terminal === undefined ? "" : ` (${terminal})`}`
    : `DriverFailed: player ended with ${str(result["subtype"]) ?? "an unknown result"}`;
  const usage = result["usage"];
  const n = (v: unknown): number | null => (typeof v === "number" ? v : null);
  const modelUsage = result["modelUsage"];
  return {
    ended,
    ...(ended === "error" ? { reason } : {}),
    turns: n(result["num_turns"]),
    costUsd: n(result["total_cost_usd"]),
    durationMs: n(result["duration_ms"]),
    usage: isObject(usage)
      ? {
          inputTokens: n(usage["input_tokens"]) ?? 0,
          outputTokens: n(usage["output_tokens"]) ?? 0,
          cacheReadTokens: n(usage["cache_read_input_tokens"]) ?? 0,
          cacheCreationTokens: n(usage["cache_creation_input_tokens"]) ?? 0,
        }
      : null,
    requestedModel: ctx.requestedModel,
    initModel: ctx.initModel,
    modelsUsed: isObject(modelUsage) ? Object.keys(modelUsage).sort() : [],
    // For an error result the "result" is the player's error message, not something the agent said.
    text: ended === "error" ? "" : (str(result["result"]) ?? ""),
    ...(ctx.skillLoadedAfterCalls === undefined ? {} : { skillInvoked: ctx.skillLoadedAfterCalls !== null, skillLoadedAfterCalls: ctx.skillLoadedAfterCalls }),
  };
}
