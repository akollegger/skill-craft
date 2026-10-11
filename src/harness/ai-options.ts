import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LanguageModelUsage } from "ai";
import type { PlayerMessage } from "./driver.js";
import type { PlayerResult } from "./driver.js";
import type { RoleResult, RoleTokens } from "./role-driver.js";
import type { Tokens } from "./models.js";

// Type-only imports from `ai`: loading this file never loads the SDK, so dry runs and tests stay light.

/** The prefix the recorder keys on, kept so `trace.jsonl` is the same whichever SDK drives the player. */
export const CRAFT_TOOL_PREFIX = "mcp__craft__";

/** How many times the SDK may retry a failed request. Stated, not inherited, so a run can record it (spec 007, research R5). */
export const MAX_RETRIES = 2;

/** What the skill tool is called. The harness reads a skill load from this name, in order, and from nothing the agent wrote. */
export const SKILL_TOOL = "Skill";

const n = (v: number | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * The four token counts the harness has always kept, from one model call's usage: input is what was not cached, so
 * the sum of a run's calls is comparable to what the Claude Agent SDK reported. A figure the provider did not give
 * is zero here (the recorder needs numbers) and null in `roleTokens`.
 */
export function tokensOf(u: LanguageModelUsage): Tokens {
  const cacheRead = n(u.inputTokenDetails.cacheReadTokens) ?? 0;
  const cacheWrite = n(u.inputTokenDetails.cacheWriteTokens) ?? 0;
  const input = n(u.inputTokenDetails.noCacheTokens) ?? Math.max(0, (n(u.inputTokens) ?? 0) - cacheRead - cacheWrite);
  return { input, output: n(u.outputTokens) ?? 0, cacheRead, cacheWrite };
}

export function addTokens(a: Tokens, b: Tokens): Tokens {
  return { input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite };
}

export const NO_TOKENS: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** For a role: null where the provider reported nothing, never zero for "unknown". */
export function roleTokens(u: LanguageModelUsage): RoleTokens {
  return { input: n(u.inputTokenDetails.noCacheTokens) ?? n(u.inputTokens), output: n(u.outputTokens), cacheRead: n(u.inputTokenDetails.cacheReadTokens), cacheCreation: n(u.inputTokenDetails.cacheWriteTokens) };
}

/**
 * The stream events the recorder reads, for one model call: it keys on `message_start`, `message_delta` and
 * `message_stop`, as the Claude Agent SDK streams them. They carry an id, a model and counts, never any text.
 * A call has no time to first token here (the call is not streamed), so none is given.
 */
export function requestStart(id: string, model: string): PlayerMessage {
  return { type: "stream_event", event: { type: "message_start", message: { id, model } } };
}

export function requestUsage(t: Tokens, model?: string): PlayerMessage {
  return { type: "stream_event", event: { type: "message_delta", ...(model === undefined ? {} : { model }), usage: { input_tokens: t.input, output_tokens: t.output, cache_read_input_tokens: t.cacheRead, cache_creation_input_tokens: t.cacheWrite } } };
}

export function requestStop(): PlayerMessage {
  return { type: "stream_event", event: { type: "message_stop" } };
}

/** The session's start, which the recorder treats as time zero. */
export function sessionInit(model: string): PlayerMessage {
  return { type: "system", subtype: "init", model };
}

/**
 * Stopped, budget or error, from how the last step ended. A run that used its turns and still wanted a tool is a
 * budget stop, whatever else it said; any other finish than a plain stop (a length cut-off, a filter) is an error.
 */
export function classifyEnd(lastFinish: string | undefined, steps: number, maxTurns: number): PlayerResult["ended"] {
  if (lastFinish === "tool-calls" && steps >= maxTurns) return "budget";
  return lastFinish === "stop" ? "stopped" : "error";
}

/** A code from a closed set for a failed call; the error's own text is never kept. */
export function failureCode(error: unknown): string {
  // When the SDK gives up after its retries it wraps the last failure; the code comes from that one.
  const e = (error as { lastError?: unknown } | null)?.lastError ?? error;
  const status = (e as { statusCode?: unknown } | null)?.statusCode;
  if (typeof status === "number") return status === 401 || status === 403 ? "authentication_failed" : status === 429 ? "rate_limited" : status >= 500 ? "provider_unavailable" : "request_rejected";
  const name = (e as { name?: unknown } | null)?.name;
  if (typeof name === "string" && /LoadAPIKeyError$/.test(name)) return "api_key_missing"; // the SDK prefixes its error names
  if (name === "AbortError" || name === "TimeoutError") return "aborted";
  return "unexpected";
}

/** The skill's one-line description from its front matter, for the skill tool's description; empty if it has none. */
export function skillDescription(markdown: string): string {
  const front = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1] ?? "";
  return /^description:\s*(.+)$/m.exec(front)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
}

/** The installed skill's text. `qualifiedName` is `plugin:skill`; the skill lives where `installSkill` put it. */
export function readInstalledSkill(skill: { pluginDir: string; qualifiedName: string }): { name: string; markdown: string } {
  const name = skill.qualifiedName.slice(skill.qualifiedName.indexOf(":") + 1);
  return { name, markdown: readFileSync(join(skill.pluginDir, "skills", name, "SKILL.md"), "utf8") };
}

/** A role's result for a failure: fixed text only. */
export function roleFailure(reason: string, requestedModel: string, resolvedModel: string | null, durationMs: number | null): RoleResult {
  return { ok: false, reason, requestedModel, resolvedModel, tokens: { input: null, output: null, cacheRead: null, cacheCreation: null }, costUsd: null, durationMs };
}
