import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { generateText, isStepCount, jsonSchema, Output, tool, wrapLanguageModel, type LanguageModel, type ModelMessage, type ToolSet } from "ai";
import { craftServer } from "./craft-server.js";
import { DriverAborted, type AgentDriver, type PlayerResult } from "./driver.js";
import { DEFAULT_MODEL, costOf, parseModelSpec, priceFor, type ModelRef, type Tokens } from "./models.js";
import { findProvider, normaliseReported } from "./providers.js";
import type { RoleDriver, RoleTokens } from "./role-driver.js";
import { addRoleTokens, addTokens, classifyEnd, countInvalid, CRAFT_TOOL_PREFIX, droppedSetting, invalidStreak, longRetryAfter, MAX_INVALID_STEPS, MAX_RETRIES, MAX_ROLE_ATTEMPTS, failureCode, NO_TOKENS, overCap, readInstalledSkill, requestStart, requestStop, requestUsage, resolveLimits, roleFailure, roleTokens, sessionInit, SKILL_TOOL, skillDescription, tokensOf, toolStop } from "./ai-options.js";

/**
 * Run the player through the AI SDK. This is the only file that imports the SDK (and the provider packages) at run
 * time. The mapping to and from the harness's types is in `ai-options.ts`, where it is tested without them.
 */

/**
 * A model on its provider, made through the provider table: the row names the package and the factory as strings, so a
 * provider is added by a row, not by an import here. The key comes from the environment (the row's `keyEnv`), never an argument.
 */
export async function languageModel(ref: ModelRef): Promise<LanguageModel> {
  const row = findProvider(ref.provider);
  if (row === undefined) throw new Error("no provider row"); // parseModelSpec has already refused an unknown provider
  const mod = (await import(row.package)) as Record<string, unknown>;
  const create = mod[row.factory] as () => (id: string) => LanguageModel;
  return create()(ref.id);
}

/**
 * What the model wrapper saw of the calls it carried. The SDK retries a failed request inside one call, so a wrapper
 * around the model sees every attempt where the call callbacks see one: it counts attempts and failures, and it holds the
 * model id the provider reported for the last response, which no call callback carries.
 */
export interface ModelProbe {
  attempts: number;
  failedAttempts: number;
  /** The model id the provider reported for the last response; undefined when it reported none. */
  last: string | undefined;
}

export const newProbe = (): ModelProbe => ({ attempts: 0, failedAttempts: 0, last: undefined });

/** Wrap a model so each attempt is counted and the reported model is kept (see `ModelProbe`). */
export function observed(model: LanguageModel, probe: ModelProbe): LanguageModel {
  return wrapLanguageModel({
    model: model as Parameters<typeof wrapLanguageModel>[0]["model"],
    middleware: {
      wrapGenerate: async ({ doGenerate }) => {
        probe.attempts++;
        try {
          const result = await doGenerate();
          probe.last = result.response?.modelId;
          return result;
        } catch (e) {
          probe.failedAttempts++;
          // The SDK retries after two seconds when a provider asks for a minute or more, which only spends requests that fail
          // again. Marking the error not retryable ends the call at once, with the status the provider gave.
          if (longRetryAfter(e)) (e as { isRetryable?: boolean }).isRetryable = false;
          throw e;
        }
      },
    },
  }) as LanguageModel;
}

/** The fixed reason for a failed call. A missing key names the variable, never a value. */
function failureReason(who: "player" | "role", e: unknown, keyEnv: string | undefined): string {
  const code = failureCode(e);
  return `DriverFailed: the ${who} reported ${code}${code === "api_key_missing" && keyEnv !== undefined ? ` (${keyEnv} is not set)` : ""}`;
}

export const aiDriver: AgentDriver = async (opts, sink) => {
  const ref = parseModelSpec(opts.model ?? DEFAULT_MODEL);
  const price = priceFor(ref.spec);
  const row = findProvider(ref.provider);
  const keyEnv = row?.keyEnv;
  const backends = new Set<string>(); // the backends a routed provider reported
  const backendOf = (): string | undefined => (backends.size === 0 ? undefined : [...backends].sort().join("+"));
  let reportedCost: number | undefined; // the sum of what the provider reported per response, when it reports any
  const started = performance.now();
  opts.signal.throwIfAborted();
  const server = craftServer(opts.world, opts.runLog);
  // The server needs a PATH to find `node`; it is added here, for the live call only.
  const client = await createMCPClient({ transport: new StdioMCPTransport({ command: server.command, args: server.args, env: { ...server.env, PATH: process.env["PATH"] ?? "" }, cwd: opts.runDir }) });
  const craftNames = new Set<string>();
  let total: Tokens = NO_TOKENS;
  const probe = newProbe();
  const reportedSpecs: string[] = []; // the model each response reported, in order, canonical
  const modelsRan = (): string[] => [...new Set(reportedSpecs)].sort();
  let calls = 0; // requests started
  let completed = 0; // requests that came back: a failed one is not a turn and has no tokens
  let craftCalls = 0;
  let skillLoadedAfterCalls: number | null = null;
  const limits = opts.limits ?? {};
  const resolved = resolveLimits(opts.limits);
  let stopCode: string | undefined; // why the run was ended from inside it: the craft server died, a tool timed out, a streak of invalid calls
  let capHit = false;
  let seenSteps: readonly { toolCalls: readonly { invalid?: boolean | undefined }[] }[] = [];
  const spent = () => ({
    turns: completed === 0 ? null : completed,
    costUsd: costOf(total, price),
    durationMs: Math.round(performance.now() - started),
    usage: completed === 0 ? null : { inputTokens: total.input, outputTokens: total.output, cacheReadTokens: total.cacheRead, cacheCreationTokens: total.cacheWrite },
    requestedModel: opts.model ?? null,
    initModel: reportedSpecs[0] ?? ref.spec,
    modelsUsed: modelsRan(),
    ...(reportedCost === undefined ? {} : { reportedCostUsd: reportedCost }),
    ...(backendOf() === undefined ? {} : { backend: backendOf() }),
    retries: { max: MAX_RETRIES, failedAttempts: probe.failedAttempts },
    invalidToolCalls: countInvalid(seenSteps),
  });
  try {
    const tools: ToolSet = await client.tools();
    for (const name of Object.keys(tools)) craftNames.add(name);
    if (opts.skill) {
      const skill = readInstalledSkill(opts.skill);
      const description = skillDescription(skill.markdown);
      tools[SKILL_TOOL] = tool({
        description: `Load the skill '${skill.name}'${description === "" ? "" : `: ${description}`}. Returns its instructions.`,
        inputSchema: jsonSchema({ type: "object", properties: {}, additionalProperties: false }),
        execute: async () => {
          skillLoadedAfterCalls ??= craftCalls;
          return skill.markdown;
        },
      });
    }

    sink.onMessage(sessionInit(ref.spec));
    let result;
    try {
      result = await generateText({
        model: observed(await languageModel(ref), probe),
        prompt: opts.prompt,
        tools,
        // Also stop after a response whose provider says a pinned setting was not applied: the run would not be the one recorded.
        stopWhen: [
          isStepCount(opts.maxTurns),
          ({ steps }) => {
            seenSteps = steps;
            if (stopCode !== undefined) return true;
            if (invalidStreak(steps) >= MAX_INVALID_STEPS) return (stopCode = "tool_loop"), true;
            if (overCap(total, costOf(total, price), limits)) return (capHit = true);
            return false;
          },
          ({ steps }) => droppedSetting(steps.at(-1)?.warnings, opts.settings) !== undefined,
        ],
        maxRetries: MAX_RETRIES,
        abortSignal: opts.signal,
        // A step or a tool call that stalls ends the run, rather than holding it to the whole time limit.
        timeout: { stepMs: resolved.stepTimeoutMs, toolMs: resolved.toolTimeoutMs },
        ...(resolved.maxOutputTokens === null ? {} : { maxOutputTokens: resolved.maxOutputTokens }),
        // The row's call options: the cache option for Anthropic, nothing for a provider that caches on its own.
        ...(row?.callOptions(opts.settings ?? {}, ref.id) ?? {}),
        onLanguageModelCallStart: (e) => {
          sink.onMessage(requestStart(`${e.callId}#${++calls}`, ref.spec));
        },
        onLanguageModelCallEnd: (e) => {
          const t = tokensOf(e.usage);
          total = addTokens(total, t);
          completed++;
          const backend = row?.backend?.(e.providerMetadata);
          if (typeof backend === "string" && backend !== "") backends.add(backend);
          const reported = row?.reportedCost?.(e.providerMetadata);
          if (typeof reported === "number" && Number.isFinite(reported)) reportedCost = (reportedCost ?? 0) + reported;
          // The model the provider reported for this response, or the one asked for when it reported none.
          const ran = probe.last === undefined ? ref.spec : normaliseReported(ref.provider, probe.last);
          reportedSpecs.push(ran);
          sink.onMessage(requestUsage(t, ran));
          sink.onMessage(requestStop());
        },
        onToolExecutionStart: (e) => {
          const isCraft = craftNames.has(e.toolCall.toolName);
          if (isCraft) craftCalls++;
          sink.onToolStart({ toolName: isCraft ? `${CRAFT_TOOL_PREFIX}${e.toolCall.toolName}` : e.toolCall.toolName, toolUseId: e.toolCall.toolCallId, input: e.toolCall.input });
        },
        onToolExecutionEnd: (e) => {
          sink.onToolEnd({ toolUseId: e.toolCall.toolCallId });
          stopCode ??= toolStop(e.toolOutput);
        },
      });
    } catch (e) {
      // A cancelled or timed-out run is the caller's to report, with what it had spent; anything else is a recorded failure with a fixed reason.
      if (opts.signal.aborted) throw new DriverAborted({ ended: "error", ...spent(), text: "" });
      return { ended: "error", reason: failureReason("player", e, keyEnv), ...spent(), text: "" };
    }

    const ignored = result.steps.map((st) => droppedSetting(st.warnings, opts.settings)).find((x) => x !== undefined);
    const finish = /^[a-z-]+$/.test(result.finishReason) ? result.finishReason : "an unknown finish";
    let ended: PlayerResult["ended"];
    let reason: string | undefined;
    if (ignored !== undefined) [ended, reason] = ["error", `DriverFailed: the player reported setting_ignored (${ignored})`];
    else if (stopCode !== undefined) [ended, reason] = ["error", `DriverFailed: the player reported ${stopCode}`];
    else if (result.finishReason === "length") [ended, reason] = ["error", "DriverFailed: the player reported output_limit"];
    else if (capHit && result.finishReason === "tool-calls") [ended, reason] = ["budget", "SpendCap: the player reached its spend cap"];
    else {
      ended = classifyEnd(result.finishReason, result.steps.length, opts.maxTurns);
      if (ended === "error") reason = `DriverFailed: player ended with ${finish}`;
    }
    seenSteps = result.steps;
    return {
      ended,
      ...(reason === undefined ? {} : { reason }),
      ...spent(),
      turns: result.steps.length,
      modelsUsed: modelsRan().length > 0 ? modelsRan() : [ref.spec],
      text: ended === "error" ? "" : result.text,
      ...(opts.skill ? { skillInvoked: skillLoadedAfterCalls !== null, skillLoadedAfterCalls } : {}),
    };
  } finally {
    await client.close().catch(() => {});
  }
};

/**
 * One critic or reviser call. It has no tools, so it can read nothing but its prompt. Only the structured answer is
 * used: the role's text and reasoning are never read, so they cannot reach a reason, a trace or a file.
 */
export const aiRoleDriver: RoleDriver = async (opts) => {
  const ref = parseModelSpec(opts.model);
  const price = priceFor(ref.spec);
  const keyEnv = findProvider(ref.provider)?.keyEnv;
  const probe = newProbe();
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  // A spend cap before each call, as a ceiling on output tokens; checked again from the real usage, over all attempts, afterwards.
  const ceiling = price === undefined ? 16_000 : Math.max(1, Math.min(32_000, Math.floor((opts.maxUsd * 1_000_000) / price.output)));
  const messages: ModelMessage[] = [{ role: "user", content: opts.prompt }];
  let spent: Tokens = NO_TOKENS;
  let tokens: RoleTokens = { input: null, output: null, cacheRead: null, cacheCreation: null };
  try {
    const model = observed(await languageModel(ref), probe);
    for (let attempt = 1; ; attempt++) {
      const result = await generateText({
        model,
        messages,
        ...(opts.system === undefined ? {} : { system: opts.system }),
        output: Output.object({ schema: jsonSchema(opts.schema) }),
        maxOutputTokens: ceiling,
        abortSignal: opts.signal,
        // The row's call options for the role's settings, as for a player (a thinking budget, effort, temperature, the cache option).
        ...(findProvider(ref.provider)?.callOptions(opts.settings ?? {}, ref.id) ?? {}),
      });
      const ignored = droppedSetting(result.warnings, opts.settings);
      if (ignored !== undefined) throw Object.assign(new Error("setting ignored"), { settingIgnored: ignored });
      spent = addTokens(spent, tokensOf(result.usage));
      tokens = addRoleTokens(tokens, roleTokens(result.usage));
      const costUsd = costOf(spent, price);
      // The SDK fills a result's model id with the one asked for when the provider reports none, so the wrapper's record is read instead.
      const reported = probe.last;
      const base = { requestedModel: opts.model, resolvedModel: reported === undefined ? ref.spec : normaliseReported(ref.provider, reported), tokens, costUsd, durationMs: elapsed() };
      // A response cut off at the output limit is never an answer, even if the text happens to parse: it may be missing its end.
      if (result.finishReason === "length") return { ok: false, reason: "DriverFailed: the role reached its output limit", ...base };
      if (costUsd !== null && costUsd > opts.maxUsd) return { ok: false, reason: "DriverFailed: the role reached its spend cap", ...base };
      const problem = opts.check?.(result.output);
      if (problem === undefined) return { ok: true, answer: result.output, ...base };
      if (attempt >= MAX_ROLE_ATTEMPTS) return { ok: false, reason: "DriverFailed: the role could not give the requested format", ...base };
      // Ask again, naming the problem by field path and limit (never by the answer's text) and keeping the earlier answer in view.
      messages.push(
        { role: "assistant", content: JSON.stringify(result.output) },
        { role: "user", content: `That answer does not meet the schema's limits: ${problem}. Answer again in full, within the limits.` },
      );
    }
  } catch (e) {
    if (opts.signal.aborted) throw e;
    const name = String((e as { name?: unknown } | null)?.name);
    const cutOff = (e as { finishReason?: unknown } | null)?.finishReason === "length";
    const ignoredName = (e as { settingIgnored?: string } | null)?.settingIgnored;
    const reason = ignoredName !== undefined ? `DriverFailed: the role reported setting_ignored (${ignoredName})` : cutOff ? "DriverFailed: the role reached its output limit" : /NoOutputGenerated|NoObjectGenerated|JSONParse|TypeValidation/.test(name) ? "DriverFailed: the role could not give the requested format" : failureReason("role", e, keyEnv);
    return roleFailure(reason, opts.model, ref.spec, elapsed());
  }
};
