import { basename } from "node:path";
import { parseArgs } from "node:util";
import { loadWorld } from "../sim/loader.js";
import type { AgentDriver } from "./driver.js";
import { HarnessError, isUserError, UnknownGoalItem } from "./errors.js";
import { DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, planExperiment, runExperiment, type AgentRunOptions, type RunReport } from "./run.js";

export interface CliDeps {
  /** The player. Default: the Claude Agent SDK. */
  driver?: AgentDriver | undefined;
  /** Aborting it ends the current run, writes the summary and returns 130. */
  signal?: AbortSignal | undefined;
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE =
  "usage: run-agent.ts --goal <item>[:<qty>] [--world <world.json>] [--runs n] [--max-turns n] [--timeout-minutes n]\n" +
  "       [--label name] [--out runs] [--model m] [--skill <folder>] [--prompt-note <text>] [--record] [--dry-run]";

class UsageError extends Error {}

const positive = (name: string, text: string | undefined): number => {
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1) throw new UsageError(`--${name} must be a whole number of at least 1`);
  return n;
};

function line(r: RunReport): string {
  const s = r.score;
  const calls = s.best ? `${s.callsToGoal} (best ${s.best.minCalls}${s.extraCalls === null ? "" : `, +${s.extraCalls}`})` : `${s.callsToGoal}`;
  const refusals = Object.values(s.refusals).reduce((a, b) => a + b, 0);
  const cost = r.costUsd === null ? "-" : `$${r.costUsd.toFixed(3)}`;
  const t = r.measured.total;
  const time = t ? `${(t.durationMs / 1000).toFixed(1)} s` : "- s";
  const tokens = t ? `${t.inputTokens} in / ${t.outputTokens} out / ${t.cacheReadTokens} cache read / ${t.cacheCreationTokens} cache write` : "-";
  const model = r.model.resolved.length > 0 ? r.model.resolved.join("+") : "-";
  const fit = `  prior fit ${r.priorFit}`;
  const skill = r.skill ? `  skill ${r.skill.name} (${r.skill.invoked ? `loaded after ${r.skill.loadedAfterCalls ?? "?"} calls` : "NOT loaded"})` : "";
  return (
    `run ${String(r.index).padStart(3, "0")}  ${s.reached ? "reached " : "NOT reached"}  calls ${calls}  crafts ${s.craftsMade}  failed crafts ${s.failedCrafts}  refusals ${refusals}  ` +
    `turns ${r.turns ?? "-"}  ${cost}  model ${model}${fit}${skill}  time ${time}  tokens ${tokens}  ended ${r.ended}${r.reason ? ` (${r.reason})` : ""}`
  );
}

/**
 * The `run-agent` command as a function: arguments in, lines out, an exit code back. The script is a thin
 * wrapper, so this is what the tests drive, with a scripted player and an abort signal.
 */
export async function runAgentCli(argv: string[], deps: CliDeps): Promise<number> {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        world: { type: "string", default: "worlds/generated/forge-7.json" },
        goal: { type: "string" },
        runs: { type: "string", default: "1" },
        "max-turns": { type: "string", default: "40" },
        "timeout-minutes": { type: "string", default: String(DEFAULT_TIMEOUT_MS / 60_000) },
        out: { type: "string", default: "runs" },
        label: { type: "string" },
        model: { type: "string" },
        skill: { type: "string" },
        "prompt-note": { type: "string" },
        record: { type: "boolean", default: false },
        "dry-run": { type: "boolean", default: false },
      },
    });
    if (!values.goal) throw new UsageError(USAGE);
    const [item = "", qty = "1"] = values.goal.split(":");
    const world = loadWorld(values.world as string);
    if (!world.items.some((i) => i.id === item)) throw new UnknownGoalItem(item);
    const note = values["prompt-note"];
    if (note !== undefined && note.trim() === "") throw new UsageError("--prompt-note must not be empty");
    const minutes = Number(values["timeout-minutes"]);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes * 60_000 > MAX_TIMEOUT_MS) {
      throw new UsageError(`--timeout-minutes must be a number greater than 0 and at most ${Math.floor(MAX_TIMEOUT_MS / 60_000)}`);
    }

    const options: AgentRunOptions = {
      world: values.world as string,
      goal: { item, qty: positive("goal quantity", qty) },
      runs: positive("runs", values.runs),
      maxTurns: positive("max-turns", values["max-turns"]),
      timeoutMs: minutes * 60_000,
      out: values.out as string,
      label: values.label ?? `${basename(values.world as string, ".json")}-${item}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
      ...(values.model ? { model: values.model } : {}),
      ...(values.skill ? { skill: values.skill } : {}),
      ...(note === undefined ? {} : { promptNote: note }),
      record: values.record ?? false,
      driver: deps.driver,
      signal: deps.signal,
    };

    if (values["dry-run"]) {
      deps.out(JSON.stringify(planExperiment(options), null, 2));
      return 0;
    }

    const { dir, reports, aggregate, cancelled } = await runExperiment(options);
    for (const r of reports) deps.out(line(r));
    deps.out(
      `${aggregate.runs} runs: ${aggregate.reached} reached (${Math.round(aggregate.successRate * 100)}%), ${aggregate.gaveUp} gave up, ${aggregate.outOfBudget} out of budget, ${aggregate.errors} errors; ` +
        `median calls to goal ${aggregate.medianCallsToGoal ?? "-"}; mean extra calls ${aggregate.meanExtraCalls === null ? "-" : aggregate.meanExtraCalls.toFixed(1)}; cost $${aggregate.totalCostUsd.toFixed(3)}`,
    );
    if (aggregate.mixedModels) deps.out(`warning: runs used different models (${aggregate.models.join(", ")}); their figures are not one comparable set`);
    deps.out(`files: ${dir}`);
    return cancelled ? 130 : 0;
  } catch (e) {
    if (e instanceof UsageError) deps.err(e.message);
    else if (e instanceof TypeError && /Unknown option|argument/i.test(e.message)) deps.err(`${e.message}\n${USAGE}`);
    else if (isUserError(e)) deps.err((e as Error).message);
    else deps.err(e instanceof HarnessError ? `${e.code}: ${e.message}` : "unexpected error");
    return 1;
  }
}
