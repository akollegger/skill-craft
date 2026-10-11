import type { ModelSettings } from "./providers.js";

/**
 * The seam between the harness and whatever runs the agent. Types only: the recorder, the join and the
 * export are tested against a scripted driver, and only `ai-driver.ts` imports the SDK.
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

/** Where a driver sends what it observes. */
export interface DriverSink {
  onMessage(message: PlayerMessage): void;
  onToolStart(call: ToolStart): void;
  onToolEnd(call: ToolEnd): void;
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
  model?: string | undefined;
  /** The settings pinned for this model (thinking, effort, temperature); an unset one is left to the provider's default. */
  settings?: ModelSettings | undefined;
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
  /** A per-run cost the provider itself reported, in US dollars, kept beside the computed one. Absent when it reports none. */
  reportedCostUsd?: number | undefined;
  /** For a routed provider: the backend (or, sorted and joined by `+`, backends) the responses reported. Absent otherwise. */
  backend?: string | undefined;
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
  /** Whether the agent loaded the installed skill at least once. Absent when no skill was installed. */
  skillInvoked?: boolean | undefined;
  /** How many craft calls the agent had made when it first loaded the skill; null if it never did. */
  skillLoadedAfterCalls?: number | null | undefined;
}

/** Run the player once. Resolves with the result; a driver reports failures by returning `ended: "error"` or by rejecting. */
export type AgentDriver = (options: DriverOptions, sink: DriverSink) => Promise<PlayerResult>;
