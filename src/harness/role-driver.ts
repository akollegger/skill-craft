import type { PriceQuote } from "./pricing.js";
import type { ModelSettings } from "./providers.js";

/**
 * The seam between the critic loop and whatever runs a role (the critic or the reviser). Types only: the loop is
 * tested against a scripted role, and only `ai-driver.ts` imports the SDK. A role is one session with no tools:
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
  /** The settings pinned for this role's model (thinking, effort, temperature); an unset one is left to the provider's default. */
  settings?: ModelSettings | undefined;
  /** The price the role is costed with, resolved before the call (a pin or a market quote). Absent: no cost figure, and the spend cap is a token ceiling only. */
  price?: PriceQuote | undefined;
  /** Spend cap for this one call, over all the attempts it makes. */
  maxUsd: number;
  /**
   * Tests an answer against the caller's own schema, which can say more than the JSON Schema the provider is given (string
   * lengths, for one: Anthropic's structured output does not enforce them). Returns undefined when the answer is valid, or a
   * short problem description made of field paths and limits, never any of the answer's text, which the driver may show the
   * model in a follow-up. The driver asks again, up to a fixed number of attempts, when it finds a problem.
   */
  check?: ((answer: unknown) => string | undefined) | undefined;
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
