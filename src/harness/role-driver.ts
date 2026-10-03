/**
 * The seam between the critic loop and whatever runs a role (the critic or the reviser). Types only: the loop is
 * tested against a scripted role, and only `sdk-driver.ts` imports the SDK. A role is one session with no tools:
 * everything it may see is in its prompt, and everything it returns is a schema-checked answer.
 */

export interface RoleOptions {
  prompt: string;
  /** Standing instructions for the role. */
  system?: string | undefined;
  /** Always pinned by id; a role never runs on a default model. */
  model: string;
  /** JSON Schema for the answer. */
  schema: Record<string, unknown>;
  /** Spend cap for this one call. */
  maxUsd: number;
  /** Aborting it must end the call promptly. */
  signal: AbortSignal;
}

export interface RoleTokens {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheCreation: number | null;
}

export interface RoleResult {
  ok: boolean;
  /** For `ok`: the answer as returned, for the caller's own schema to parse. */
  answer?: unknown;
  /** For a failure: `code: fixed message`. Never the player's own text. */
  reason?: string | undefined;
  requestedModel: string;
  /** The model that ran, when the player reported one. */
  resolvedModel: string | null;
  /** Null for a figure the player did not report; never zero for "unknown". */
  tokens: RoleTokens;
  costUsd: number | null;
  durationMs: number | null;
}

export type RoleDriver = (options: RoleOptions) => Promise<RoleResult>;
