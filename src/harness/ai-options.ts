import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LanguageModelUsage } from "ai";
import type { PlayerMessage } from "./driver.js";
import type { PlayerResult, RunLimits } from "./driver.js";
import type { RoleResult, RoleTokens } from "./role-driver.js";
import type { Tokens } from "./models.js";
import type { ModelSettings } from "./providers.js";

// Type-only imports from `ai`: loading this file never loads the SDK, so dry runs and tests stay light.

/** The prefix the recorder keys on, kept so `trace.jsonl` is the same whichever SDK drives the player. */
export const CRAFT_TOOL_PREFIX = "mcp__craft__";

/** How many times the SDK may retry a failed request. Stated, not inherited, so a run can record it (spec 007, research R5). */
export const MAX_RETRIES = 2;

/** How long one model step, and one craft tool call, may take before the run is ended. A hung provider would otherwise hold a run to its whole time limit. */
export const STEP_TIMEOUT_MS = 5 * 60 * 1000;
export const TOOL_TIMEOUT_MS = 60 * 1000;

/** The SDK honours a provider's `retry-after` only below this, and otherwise retries after two seconds; a wait this long is not retried. */
export const LONG_RETRY_AFTER_MS = 60 * 1000;

/** Consecutive steps whose tool calls were all invalid (malformed arguments, an unknown tool) that end a run. */
export const MAX_INVALID_STEPS = 5;

/** The limits a run ran under, with the defaults filled in; `null` is "not set", which leaves the choice to the provider. */
export interface ResolvedLimits {
  stepTimeoutMs: number;
  toolTimeoutMs: number;
  maxOutputTokens: number | null;
  maxTotalTokens: number | null;
  maxUsd: number | null;
}

export const resolveLimits = (l: RunLimits | undefined): ResolvedLimits => ({
  stepTimeoutMs: l?.stepTimeoutMs ?? STEP_TIMEOUT_MS,
  toolTimeoutMs: l?.toolTimeoutMs ?? TOOL_TIMEOUT_MS,
  maxOutputTokens: l?.maxOutputTokens ?? null,
  maxTotalTokens: l?.maxTotalTokens ?? null,
  maxUsd: l?.maxUsd ?? null,
});

/** Whether what a run has spent is over a cap it was given. A dollar cap never trips for a run with no cost figure. */
export function overCap(total: Tokens, costUsd: number | null, limits: RunLimits): boolean {
  if (limits.maxTotalTokens !== undefined && total.input + total.output + total.cacheRead + total.cacheWrite >= limits.maxTotalTokens) return true;
  return limits.maxUsd !== undefined && costUsd !== null && costUsd >= limits.maxUsd;
}

type StepCalls = { toolCalls: readonly { invalid?: boolean | undefined }[] };

/** How many steps at the end of a run had tool calls and every one invalid. A step with a valid call, or none, breaks the streak. */
export function invalidStreak(steps: readonly StepCalls[]): number {
  let n = 0;
  for (let i = steps.length - 1; i >= 0; i--) {
    const calls = (steps[i] as StepCalls).toolCalls;
    if (calls.length === 0 || !calls.every((c) => c.invalid === true)) break;
    n++;
  }
  return n;
}

export const countInvalid = (steps: readonly StepCalls[]): number => steps.reduce((sum, st) => sum + st.toolCalls.filter((c) => c.invalid === true).length, 0);

/** True when a provider's error asks the caller to wait a minute or more before trying again. */
export function longRetryAfter(error: unknown): boolean {
  const h = (error as { responseHeaders?: Record<string, string> } | null)?.responseHeaders;
  if (h === undefined || h === null) return false;
  const ms = Number(h["retry-after-ms"]);
  if (Number.isFinite(ms) && h["retry-after-ms"] !== undefined) return ms >= LONG_RETRY_AFTER_MS;
  const seconds = Number(h["retry-after"]);
  return h["retry-after"] !== undefined && Number.isFinite(seconds) && seconds * 1000 >= LONG_RETRY_AFTER_MS;
}

/**
 * Why a failed tool call should end the run, or undefined: the craft server's connection is closed (it died), or the
 * call hit its time limit. Any other tool error is an ordinary one the model sees and may recover from.
 */
export function toolStop(output: unknown): "server_lost" | "tool_timeout" | undefined {
  const o = output as { type?: unknown; error?: { name?: unknown; message?: unknown; cause?: { name?: unknown } } } | null;
  if (o?.type !== "tool-error") return undefined;
  // The MCP client reports an aborted request as its own error with the signal's reason as the cause, a TimeoutError for a time limit.
  if (o.error?.name === "TimeoutError" || o.error?.cause?.name === "TimeoutError") return "tool_timeout";
  if (o.error?.name === "MCPClientError" && /closed/i.test(String(o.error.message))) return "server_lost";
  return undefined;
}

/**
 * The first pinned setting that a provider's warning says it did not apply, or undefined. The SDK does not fail a call for
 * a setting a model does not support: it drops it and warns (a pinned temperature on a model that takes none is ignored),
 * so a run could go on without a setting it recorded as pinned. The warning's feature name varies by provider
 * (`temperature`, `providerOptions.anthropic.thinking`), so it is matched by the setting's name.
 */
export function droppedSetting(warnings: readonly { type: string; feature?: string }[] | undefined, settings: ModelSettings | undefined): keyof ModelSettings | undefined {
  if (settings === undefined) return undefined;
  for (const w of warnings ?? []) {
    if (w.type !== "unsupported" || typeof w.feature !== "string") continue;
    for (const name of ["temperature", "thinking", "effort"] as const) {
      if (settings[name] !== undefined && w.feature.toLowerCase().includes(name)) return name;
    }
  }
  return undefined;
}

/** How many times a role is asked for an answer that passes its caller's check, the first time included. */
export const MAX_ROLE_ATTEMPTS = 3;

/** Add two role token figures; a figure either side reports counts, and one neither reports stays null. */
export function addRoleTokens(a: RoleTokens, b: RoleTokens): RoleTokens {
  const add = (x: number | null, y: number | null): number | null => (x === null && y === null ? null : (x ?? 0) + (y ?? 0));
  return { input: add(a.input, b.input), output: add(a.output, b.output), cacheRead: add(a.cacheRead, b.cacheRead), cacheCreation: add(a.cacheCreation, b.cacheCreation) };
}

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
  if (typeof status === "number") {
    if (status === 401 || status === 403) return "authentication_failed";
    if (status === 429) return "rate_limited";
    if (status === 408 || status >= 500) return "provider_unavailable";
    // The message is read to tell a prompt over the window from other rejections; only the code is kept.
    if ((status === 400 || status === 413) && /too long|too large|context (length|window)|maximum (context|prompt)|exceeds? .*(limit|maximum)/i.test(String((e as { message?: unknown }).message))) return "context_length_exceeded";
    return "request_rejected";
  }
  const name = (e as { name?: unknown } | null)?.name;
  if (typeof name === "string" && /LoadAPIKeyError$/.test(name)) return "api_key_missing"; // the SDK prefixes its error names
  if (name === "TimeoutError") return "step_timeout";
  if (name === "AbortError") return "aborted";
  const cause = (e as { cause?: { code?: unknown } } | null)?.cause?.code;
  if (typeof cause === "string" && /^(ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR)/.test(cause)) return "provider_unreachable";
  if ((e as { isRetryable?: unknown } | null)?.isRetryable === true) return "provider_unreachable"; // the SDK marks a dropped connection retryable
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
