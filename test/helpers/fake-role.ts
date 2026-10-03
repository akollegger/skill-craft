/**
 * A scripted `RoleDriver` for tests. It returns a queue of answers (or failures), keeps every call it was given so
 * a test can look at the exact prompts, and honours the abort signal.
 */
import type { RoleDriver, RoleOptions, RoleResult } from "../../src/harness/role-driver.js";

export type ScriptedAnswer = unknown | { fail: string } | { hang: true } | ((options: RoleOptions, call: number) => unknown);

export interface FakeRole {
  driver: RoleDriver;
  /** Every call, in order. */
  calls: RoleOptions[];
}

const NULL_TOKENS = { input: null, output: null, cacheRead: null, cacheCreation: null };

export function fakeRole(script: ScriptedAnswer[], defaults: { tokens?: RoleResult["tokens"]; costUsd?: number | null; resolvedModel?: string | null } = {}): FakeRole {
  const calls: RoleOptions[] = [];
  const driver: RoleDriver = async (options) => {
    const n = calls.length;
    calls.push(options);
    if (options.signal.aborted) return failure(options, "RunCancelled: the run was cancelled");
    const item = script[n];
    if (item === undefined) return failure(options, "DriverFailed: the scripted role ran out of answers");
    if (typeof item === "object" && item !== null && "hang" in item) {
      await new Promise<void>((resolve) => options.signal.addEventListener("abort", () => resolve(), { once: true }));
      return failure(options, "RunCancelled: the run was cancelled");
    }
    if (typeof item === "object" && item !== null && "fail" in item) return failure(options, String((item as { fail: string }).fail));
    const answer = typeof item === "function" ? (item as (o: RoleOptions, c: number) => unknown)(options, n) : item;
    return {
      ok: true,
      answer,
      requestedModel: options.model,
      resolvedModel: defaults.resolvedModel === undefined ? options.model : defaults.resolvedModel,
      tokens: defaults.tokens ?? { input: 100, output: 50, cacheRead: 0, cacheCreation: 0 },
      costUsd: defaults.costUsd === undefined ? 0.01 : defaults.costUsd,
      durationMs: 5,
    };
  };
  return { driver, calls };
}

function failure(options: RoleOptions, reason: string): RoleResult {
  return { ok: false, reason, requestedModel: options.model, resolvedModel: null, tokens: NULL_TOKENS, costUsd: null, durationMs: null };
}
