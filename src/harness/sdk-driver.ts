import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentDriver, PlayerMessage } from "./driver.js";
import type { RoleDriver } from "./role-driver.js";
import { playerResultFrom, roleOptionsFor, roleResultFrom, sdkOptionsFor } from "./sdk-options.js";

/**
 * Run the player through the Claude Agent SDK. This is the only file that imports the SDK at run time.
 * The options and the result mapping are in `sdk-options.ts`, where they are tested without it.
 */
export const sdkDriver: AgentDriver = async (opts, sink) => {
  let result: Record<string, unknown> | null = null;
  let initModel: string | null = null;
  let assistantError: string | undefined;
  let craftCalls = 0;
  let skillLoadedAfterCalls: number | null = null;
  let threw = false;
  let thrown: unknown;

  // The signal reaches the query two ways: through the option's abort controller (see `sdkOptionsFor`), and by
  // interrupting the query itself, so a cancelled or timed-out run stops the session and not just the stream.
  const q = query({ prompt: opts.prompt, options: sdkOptionsFor(opts, sink) });
  const interrupt = () => void Promise.resolve(q.interrupt()).catch(() => {});
  if (opts.signal.aborted) interrupt();
  else opts.signal.addEventListener("abort", interrupt, { once: true });

  try {
    for await (const message of q) {
      sink.onMessage(message as unknown as PlayerMessage);
      const m = message as unknown as Record<string, unknown>;
      if (m["type"] === "system" && m["subtype"] === "init" && typeof m["model"] === "string") initModel = m["model"];
      if (m["type"] === "assistant" && typeof m["error"] === "string") assistantError = m["error"];
      // When the agent first loaded the skill is read from tool names only, in order; nothing it wrote is kept.
      if (m["type"] === "assistant") {
        const content = (m["message"] as { content?: { type?: string; name?: string }[] } | undefined)?.content;
        for (const b of content ?? []) {
          if (b.type !== "tool_use") continue;
          if (b.name === "Skill") skillLoadedAfterCalls ??= craftCalls;
          else if (b.name?.startsWith("mcp__craft__")) craftCalls++;
        }
      }
      if (m["type"] === "result") result = m;
    }
  } catch (e) {
    // The SDK throws after delivering an error_max_turns result; that result still stands.
    threw = true;
    thrown = e;
  } finally {
    opts.signal.removeEventListener("abort", interrupt);
  }

  if (result === null) throw threw ? thrown : new Error("the player ended without a result");
  return playerResultFrom(result, { requestedModel: opts.model ?? null, initModel, threw, assistantError, ...(opts.skill ? { skillLoadedAfterCalls } : {}) });
};

/**
 * One critic or reviser call through the SDK. The session has no tools (see `roleOptionsFor`), so it can read nothing
 * but its prompt. Only the result message is used: the role's own text is never read, so it cannot reach a reason, a
 * trace or a file.
 */
export const sdkRoleDriver: RoleDriver = async (opts) => {
  let result: Record<string, unknown> | null = null;
  let initModel: string | null = null;
  const q = query({ prompt: opts.prompt, options: roleOptionsFor(opts) });
  const interrupt = () => void Promise.resolve(q.interrupt()).catch(() => {});
  if (opts.signal.aborted) interrupt();
  else opts.signal.addEventListener("abort", interrupt, { once: true });
  try {
    for await (const message of q) {
      const m = message as unknown as Record<string, unknown>;
      if (m["type"] === "system" && m["subtype"] === "init" && typeof m["model"] === "string") initModel = m["model"];
      if (m["type"] === "result") result = m;
    }
  } catch {
    // The SDK throws after some error results; a delivered result still stands.
  } finally {
    opts.signal.removeEventListener("abort", interrupt);
  }
  if (result === null) {
    return { ok: false, reason: "DriverFailed: the role ended without a result", requestedModel: opts.model, resolvedModel: initModel, tokens: { input: null, output: null, cacheRead: null, cacheCreation: null }, costUsd: null, durationMs: null };
  }
  return roleResultFrom(result, { requestedModel: opts.model, initModel });
};
