import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentDriver, PlayerMessage } from "./driver.js";
import { playerResultFrom, sdkOptionsFor } from "./sdk-options.js";

/**
 * Run the player through the Claude Agent SDK. This is the only file that imports the SDK at run time.
 * The options and the result mapping are in `sdk-options.ts`, where they are tested without it.
 */
export const sdkDriver: AgentDriver = async (opts, sink) => {
  let result: Record<string, unknown> | null = null;
  let initModel: string | null = null;
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
  return playerResultFrom(result, { requestedModel: opts.model ?? null, initModel, threw });
};
