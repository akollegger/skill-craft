/**
 * A scripted `AgentDriver` for tests. It plays the real engine against the world it is given, writes the
 * run log where the harness says, and reports what it did through the sink in the shape the real SDK
 * streams it, so the recorder, the join and the export run without an agent.
 */
import { appendFileSync } from "node:fs";
import type { AgentDriver, DriverOptions, DriverSink, PlayerResult } from "../../src/harness/driver.js";
import { Game } from "../../src/sim/engine.js";
import { loadWorld } from "../../src/sim/loader.js";
import { createRunLog } from "../../src/sim/runlog.js";
import { solve, type SolverGoal } from "../../src/sim/solver.js";

export type FakeMode =
  | "solve" //   the best run for the goal, then stop
  | "wander" //  look around, try a pairing, stop without the goal
  | "refuse" //  calls the world refuses: an unknown item, out of bounds, a craft with nothing to make
  | "budget" //  wander, then report the turn budget as spent
  | "crash" //   announce the session, then reject with no result
  | "silent" //  play the engine but report nothing at all
  | "badlog" //  play the engine, then leave a run-log line that cannot replay
  | "hang"; //   report a little, then wait until the signal aborts

export interface FakePersonal {
  email: string;
  userId: string;
  accountIds: string[];
  organizationId: string;
  sessionId: string;
}

export interface FakePlayerOptions {
  mode?: FakeMode;
  /** The goal `solve` mode works towards. */
  goal?: SolverGoal;
  /** Models the requests alternate between. Default: one model. */
  models?: string[];
  /** Tokens reported for every model request. */
  tokens?: { input: number; output: number; cacheRead: number; cacheCreation: number };
  /** Invented identifying values placed in the messages the recorder must not keep. */
  personal?: FakePersonal;
  /** Chatter and reasoning placed in assistant messages, which must never reach the trace. */
  agentText?: string;
  /** Awaited after each reported message, so a test can look at files mid-run. */
  pause?: () => Promise<void>;
  /** Index (from 0) of a tool call whose end is never reported. */
  dropToolEnd?: number;
  /** With `badlog`: leave a line that is not valid JSON instead of one that does not replay. */
  malformedLog?: boolean;
  /** Leave the model out of the init message and the usage keys. */
  omitModel?: boolean;
}

export const FAKE_TOKENS = { input: 2, output: 10, cacheRead: 100, cacheCreation: 50 };

interface Step {
  tool: string;
  args: Record<string, unknown>;
}

export function fakePlayer(options: FakePlayerOptions = {}): AgentDriver {
  const mode = options.mode ?? "solve";
  const models = options.models ?? ["fake-model"];
  const tokens = options.tokens ?? FAKE_TOKENS;

  return async (opts: DriverOptions, sink: DriverSink): Promise<PlayerResult> => {
    const world = loadWorld(opts.world);
    const game = new Game(world, { log: createRunLog(opts.runLog) });
    let requests = 0;
    let toolCalls = 0;

    const say = async (message: Record<string, unknown> & { type: string }) => {
      sink.onMessage(message);
      await options.pause?.();
    };

    const initModel = options.omitModel ? null : (models[0] ?? null);
    const p = options.personal;
    if (mode !== "silent") {
      await say({
        type: "system",
        subtype: "init",
        ...(initModel === null ? {} : { model: initModel }),
        ...(p ? { session_id: p.sessionId, user: { email: p.email, id: p.userId, accounts: p.accountIds, organization: p.organizationId } } : {}),
      });
    }
    if (mode === "crash") throw new Error(`fake player crashed ${p?.email ?? ""}`.trim());

    /** One model request: start, usage, stop, with chatter the recorder must ignore. */
    const request = async () => {
      if (mode === "silent") return;
      const i = requests++;
      const model = options.omitModel ? undefined : models[i % models.length];
      await say({ type: "stream_event", ttft_ms: 120 + i, event: { type: "message_start", message: { id: `msg_${i}`, ...(model ? { model } : {}) } } });
      if (options.agentText !== undefined || p) {
        await say({
          type: "assistant",
          message: { content: [{ type: "text", text: `${options.agentText ?? ""} ${p?.email ?? ""}` }, { type: "thinking", thinking: `${options.agentText ?? ""} ${p?.userId ?? ""}` }] },
        });
      }
      await say({
        type: "stream_event",
        event: {
          type: "message_delta",
          usage: { input_tokens: tokens.input, output_tokens: tokens.output, cache_read_input_tokens: tokens.cacheRead, cache_creation_input_tokens: tokens.cacheCreation },
        },
      });
      await say({ type: "stream_event", event: { type: "message_stop" } });
    };

    const callTool = async (step: Step) => {
      const n = toolCalls++;
      const id = `toolu_${n}`;
      if (mode !== "silent") sink.onToolStart({ toolName: `mcp__craft__${step.tool}`, toolUseId: id, input: step.args });
      const a = step.args;
      if (step.tool === "help") game.record("help", {}, { ok: true });
      else if (step.tool === "inventory") game.inventory();
      else if (step.tool === "look") game.look();
      else if (step.tool === "place") game.place(String(a["item"]), Number(a["row"]), Number(a["col"]));
      else if (step.tool === "remove") game.remove(Number(a["row"]), Number(a["col"]));
      else if (step.tool === "clear") game.clear();
      else game.craft();
      if (mode !== "silent" && n !== options.dropToolEnd) sink.onToolEnd({ toolUseId: id });
      await options.pause?.();
    };

    const held = Object.keys(world.stock); // read from the world, so the run log holds only scripted calls
    const plan: Step[] = [{ tool: "help", args: {} }];
    if (mode === "solve") {
      const best = solve(world, options.goal ?? { item: "", qty: 1 });
      if (best.reachable) for (const c of best.calls) plan.push({ tool: c.tool, args: c.args });
    } else if (mode === "refuse") {
      plan.push(
        { tool: "place", args: { item: "no-such-item", row: 0, col: 0 } },
        { tool: "place", args: { item: held[0] ?? "x", row: 99, col: 0 } },
        { tool: "craft", args: {} },
      );
    } else {
      plan.push({ tool: "look", args: {} }, { tool: "place", args: { item: held[0] ?? "x", row: 0, col: 0 } }, { tool: "place", args: { item: held[1] ?? held[0] ?? "x", row: 0, col: 1 } }, { tool: "craft", args: {} });
    }

    for (const step of plan) {
      await request();
      await callTool(step);
    }
    await request();

    if (mode === "hang") {
      await new Promise<never>((_, reject) => {
        const stop = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (opts.signal.aborted) stop();
        else opts.signal.addEventListener("abort", stop, { once: true });
      });
    }

    if (mode === "badlog") {
      const line = options.malformedLog ? "{not json\n" : `${JSON.stringify({ seq: game.log.entries.length + 1, tool: "craft", args: {}, ok: true })}\n`;
      appendFileSync(opts.runLog, line);
    }

    const used = [...new Set(Array.from({ length: requests }, (_, i) => models[i % models.length] as string))];
    const reported = mode !== "silent";
    return {
      ended: mode === "budget" ? "budget" : "stopped",
      turns: reported ? requests : null,
      costUsd: reported ? 0.01 * requests : null,
      durationMs: reported ? 1000 + 100 * requests : null,
      usage: reported
        ? {
            inputTokens: tokens.input * requests,
            outputTokens: tokens.output * requests,
            cacheReadTokens: tokens.cacheRead * requests,
            cacheCreationTokens: tokens.cacheCreation * requests,
          }
        : null,
      requestedModel: opts.model ?? null,
      initModel,
      modelsUsed: reported && !options.omitModel ? used : [],
      text: mode === "solve" ? "I hold it." : "I could not find it.",
    };
  };
}
