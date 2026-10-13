import type { PriceQuote } from "./pricing.js";
import type { ModelSettings } from "./providers.js";

/**
 * The seam between the harness and whatever runs the agent. Only `ai-driver.ts` imports the SDK; the recorder, the
 * join and the export are tested against a scripted driver. The one runtime value here is `DriverAborted`.
 */

/**
 * A message streamed by the player. Only `type` is promised; the recorder reads the few fields it needs
 * defensively, so a malformed message is skipped and counted instead of crashing a run.
 */
export interface PlayerMessage {
  readonly type: string;
  readonly [field: string]: unknown;
}

/** The start of a tool call, from the SDK's tool-start event. Fields are optional so malformed input is representable. */
export interface ToolStart {
  toolName?: string | undefined;
  toolUseId?: string | undefined;
  input?: unknown;
}

/** The end of a tool call, from the SDK's tool-end event. */
export interface ToolEnd {
  toolUseId?: string | undefined;
}

/**
 * One model turn as the model lived it: what it wrote, the reasoning the provider returned for it (empty when none
 * came back) and the calls it made, by the id and name the model used. It is kept in `conversation.jsonl` for the
 * memory service's recording and nowhere else (ADR-003 §2.4, amended 2026-10-12).
 */
export interface TurnReport {
  text: string;
  reasoning: string;
  calls: { id: string; tool: string }[];
}

/** Where a driver sends what it observes. */
export interface DriverSink {
  onMessage(message: PlayerMessage): void;
  onToolStart(call: ToolStart): void;
  onToolEnd(call: ToolEnd): void;
  /** A model turn finished. Optional: a sink that does not keep turns ignores them. */
  onTurn?(turn: TurnReport): void;
}

/** Per-run limits on one model step, one tool call and what a run may spend. An unset one is left to the provider (or, for a timeout, to the default). */
export interface RunLimits {
  stepTimeoutMs?: number | undefined;
  toolTimeoutMs?: number | undefined;
  /** A ceiling on the output of one model step. Unset by default: a thinking budget needs a ceiling above it. */
  maxOutputTokens?: number | undefined;
  /** Stop after the step that takes the run's tokens (all kinds) to this. */
  maxTotalTokens?: number | undefined;
  /** Stop after the step that takes the run's computed cost to this; needs a priced model. */
  maxUsd?: number | undefined;
}

export interface DriverOptions {
  prompt: string;
  /** Path of the world file the craft server plays. */
  world: string;
  /** Fresh path for the craft server's run log. */
  runLog: string;
  /** The run folder; the player's working directory. */
  runDir: string;
  maxTurns: number;
  /** A budget of craft-tool calls (ADR-007). When set, a call past it is not run and the run ends after that response; `maxTurns` is then the same number. */
  callBudget?: number | undefined;
  /** The skill tool's description as a template (`{name}`, `{described}`); absent: the driver uses version 1. */
  skillToolTemplate?: string | undefined;
  model?: string | undefined;
  /** The settings pinned for this model (thinking, effort, temperature); an unset one is left to the provider's default. */
  settings?: ModelSettings | undefined;
  /** Limits on a step, a tool call and spend; see `RunLimits`. */
  limits?: RunLimits | undefined;
  /** The price the run is costed with, resolved before it started (a pin or a market quote). Absent: the driver uses the pin for the model, if any. */
  price?: PriceQuote | undefined;
  /** Aborting it must end the run promptly. */
  signal: AbortSignal;
  /** A skill to make available to the agent: a local plugin folder, and the skill's `plugin:skill` name. */
  skill?: { pluginDir: string; qualifiedName: string } | undefined;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/** What a driver returns when the player has finished, failed or been stopped. */
export interface PlayerResult {
  /** `stopped`: the agent ended its turn; `budget`: it hit its turn limit; `error`: anything else. */
  ended: "stopped" | "budget" | "error";
  /** For `error`: `code: fixed message`. Never the text of a wrapped error. */
  reason?: string | undefined;
  turns: number | null;
  costUsd: number | null;
  /** Where `costUsd` came from: the provider's own figure, a pin or a market quote; null when there is none. Absent for a player that does not say. */
  costSource?: "provider" | "pin" | "market-quote" | null | undefined;
  /** The rates `costUsd` was computed with, for a pin or a quote. Absent when the cost is the provider's or there is none. */
  priceQuote?: PriceQuote | undefined;
  /** A per-run cost the provider itself reported, in US dollars, kept beside the computed one. Absent when it reports none. */
  reportedCostUsd?: number | undefined;
  /** For a routed provider: the backend (or, sorted and joined by `+`, backends) the responses reported. Absent otherwise. */
  backend?: string | undefined;
  /** The retry setting, and how many request attempts failed (and were retried or gave up). Absent for a player that does not count them. */
  retries?: { max: number; failedAttempts: number } | undefined;
  durationMs: number | null;
  usage: TokenUsage | null;
  /** What the harness asked for; null when it left the choice to the default. */
  requestedModel: string | null;
  /** The model in the session's init message. */
  initModel: string | null;
  /** The keys of the result's per-model usage. */
  modelsUsed: string[];
  /** The agent's final message. Kept in score.json, never in a trace or a bundle. */
  text: string;
  /** How many tool calls the model made that were not valid (malformed arguments, an unknown tool). Absent for a player that does not count them. */
  invalidToolCalls?: number | undefined;
  /** Calls refused for being over a call budget, which are not in the run log. 0 for a run with no call budget; absent for a player that does not count them. */
  budgetRefused?: number | undefined;
  /** Whether the agent loaded the installed skill at least once. Absent when no skill was installed. */
  skillInvoked?: boolean | undefined;
  /** How many craft calls the agent had made when it first loaded the skill; null if it never did. */
  skillLoadedAfterCalls?: number | null | undefined;
}

/** Run the player once. Resolves with the result; a driver reports failures by returning `ended: "error"` or by rejecting. */
export type AgentDriver = (options: DriverOptions, sink: DriverSink) => Promise<PlayerResult>;

/**
 * What a driver rejects with when the run's signal aborted it (a timeout or a cancellation). It carries what the run had
 * spent by then, so the harness can record that under its own fixed reason instead of losing the cost.
 */
export class DriverAborted extends Error {
  constructor(readonly partial: PlayerResult) {
    super("the player was aborted");
    this.name = "DriverAborted";
  }
}
