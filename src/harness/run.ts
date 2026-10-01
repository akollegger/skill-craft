import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadWorld } from "../sim/loader.js";
import { priorFitOf, type DeclaredPriorFit } from "../sim/notes.js";
import type { RunLogEntry } from "../sim/runlog.js";
import { ReplayError, scoreRun, type RunScore } from "../sim/score.js";
import type { SolverGoal } from "../sim/solver.js";
import type { World } from "../sim/schema.js";
import { readTrace } from "../trace/lines.js";
import { measureRun, type Measured } from "../trace/measure.js";
import { TraceRecorder } from "../trace/recorder.js";
import type { AgentDriver, DriverSink, PlayerResult } from "./driver.js";
import { DriverFailed, HarnessError, RunCancelled, RunFailed, RunFolderExists, RunTimedOut, SkillNotFound, UnknownGoalItem, reasonOf } from "./errors.js";
import { toRepoPath } from "./paths.js";
import { readLog, replayFailure } from "./read-log.js";
import { installSkill, SKILL_PLUGIN, skillName } from "./skill.js";
import { craftServer, sdkOptionsFor } from "./sdk-options.js";

export const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

/** The longest delay a timer can hold; a longer one would fire at once. */
export const MAX_TIMEOUT_MS = 2_147_483_647;

export interface AgentRunOptions {
  /** Path to the world file the agent will play. Use a generated world for real experiments. */
  world: string;
  goal: SolverGoal;
  runs: number;
  /** Hard budget: the player's turn limit. */
  maxTurns: number;
  /** Directory that holds one folder per experiment label. */
  out: string;
  label: string;
  model?: string | undefined;
  /** Let user-level settings apply, so `nams-hooks` records the session to NAMS. */
  record: boolean;
  /** Time limit for one run. Default 30 minutes. */
  timeoutMs?: number | undefined;
  /** Aborting it ends the current run and starts no further one. */
  signal?: AbortSignal | undefined;
  /** A skill folder (with a SKILL.md) to make available to the agent. Each run gets its own copy. */
  skill?: string | undefined;
  /** One fixed sentence added to the end of the base prompt, for an arm that points at the skill. */
  promptNote?: string | undefined;
  /** How the agent is run. Default: the Claude Agent SDK, loaded only when needed. */
  driver?: AgentDriver | undefined;
}

/** The goal reaches the agent only through this prompt; the world never states goals. */
export function buildPrompt(goal: SolverGoal, maxTurns: number, note?: string): string {
  const what = goal.qty === 1 ? `one ${goal.item}` : `${goal.qty} of ${goal.item}`;
  return [
    `You are at a crafting table in an unfamiliar workshop. Your goal: end up holding ${what}.`,
    "Use only the craft tools, and start with help.",
    `Nobody can answer questions or give hints, so do not ask for any. Keep trying on your own until you hold ${goal.item}, or until your budget of ${maxTurns} turns is used up.`,
    "craft is irreversible and uses up whatever is on the table, so explore with place, remove, clear and look before you commit.",
    "When you hold it, say so in one line and stop.",
    ...(note === undefined ? [] : [note]),
  ].join("\n");
}

/**
 * What `mcp.json` records for a run: how the craft server was started. Export finds the world here. Paths
 * inside the repository are recorded relative to it, so the file holds no user name and can be shared.
 */
export function mcpConfigFor(worldPath: string, runLog: string) {
  const server = craftServer(worldPath, runLog);
  return {
    mcpServers: {
      craft: {
        ...server,
        command: toRepoPath(server.command),
        args: server.args.map(toRepoPath),
        env: { SIM_WORLD: toRepoPath(server.env["SIM_WORLD"] as string), SIM_RUN_LOG: toRepoPath(server.env["SIM_RUN_LOG"] as string) },
      },
    },
  };
}

/** Which model a run asked for and which ran. */
export interface ModelInfo {
  requested: string | null;
  resolved: string[];
}

export interface RunReport extends PlayerResult {
  index: number;
  dir: string;
  score: RunScore;
  measured: Measured;
  model: ModelInfo;
  /** The world's declared prior fit, or `undeclared` when it has no notes file. */
  priorFit: DeclaredPriorFit;
  /** The fixed sentence added to this run's prompt, when there was one. */
  promptNote?: string | undefined;
  /** The skill this run had available, when one was installed. */
  skill?: { name: string; sha256: string; invoked: boolean; loadedAfterCalls: number | null } | undefined;
}

export interface Aggregate {
  runs: number;
  reached: number;
  successRate: number;
  /** Ended its turn without the goal: gave up or asked for help. */
  gaveUp: number;
  /** Used its whole turn budget without the goal. */
  outOfBudget: number;
  errors: number;
  medianCallsToGoal: number | null;
  meanExtraCalls: number | null;
  totalCostUsd: number;
  /** Every model any run used, sorted. */
  models: string[];
  /** True when runs used more than one model, so their figures are not one comparable set. */
  mixedModels: boolean;
}

export function aggregate(reports: readonly RunReport[]): Aggregate {
  const wins = reports.filter((r) => r.score.reached);
  const sorted = wins.map((r) => r.score.callsToGoal).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length === 0 ? null : sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  const extras = wins.flatMap((r) => (r.score.extraCalls === null ? [] : [r.score.extraCalls]));
  const models = [...new Set(reports.flatMap((r) => r.model.resolved))].sort();
  return {
    runs: reports.length,
    reached: wins.length,
    successRate: reports.length === 0 ? 0 : wins.length / reports.length,
    gaveUp: reports.filter((r) => !r.score.reached && r.ended === "stopped").length,
    outOfBudget: reports.filter((r) => !r.score.reached && r.ended === "budget").length,
    errors: reports.filter((r) => r.ended === "error").length,
    medianCallsToGoal: median,
    meanExtraCalls: extras.length === 0 ? null : extras.reduce((a, b) => a + b, 0) / extras.length,
    totalCostUsd: reports.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
    models,
    mixedModels: models.length > 1,
  };
}

const runDir = (o: AgentRunOptions, index: number): string => join(o.out, o.label, String(index).padStart(3, "0"));

const noSink: DriverSink = { onMessage: () => {}, onToolStart: () => {}, onToolEnd: () => {} };

/** What a run would do, without running or creating anything (a dry run). */
export function planExperiment(o: AgentRunOptions) {
  const priorFit = priorFitOf(o.world);
  const prompt = buildPrompt(o.goal, o.maxTurns, o.promptNote);
  return Array.from({ length: o.runs }, (_, i) => {
    const dir = runDir(o, i + 1);
    const runLog = resolve(dir, "run.jsonl");
    // The skill is not installed in a dry run, but its options are what a real run would pass.
    const skill = o.skill
      ? { pluginDir: join(resolve(dir), "skill-plugin"), qualifiedName: `${SKILL_PLUGIN}:${skillName(readFileSync(join(o.skill, "SKILL.md"), "utf8"))}` }
      : undefined;
    const { hooks: _hooks, abortController: _abort, ...options } = sdkOptionsFor(
      { prompt, world: resolve(o.world), runLog, runDir: resolve(dir), maxTurns: o.maxTurns, model: o.model, record: o.record, signal: new AbortController().signal, skill },
      noSink,
    );
    // Show the plan as it will be recorded: repository-relative paths, and without the PATH the live call adds.
    return { run: i + 1, dir, priorFit, prompt, runLog: toRepoPath(runLog), ...(o.skill ? { skill: toRepoPath(resolve(o.skill)) } : {}), options: { ...options, cwd: toRepoPath(resolve(dir)), ...mcpConfigFor(resolve(o.world), runLog) } };
  });
}

/** Score a log, turning a log that does not replay into a typed error. */
function scoreLog(world: World, goal: SolverGoal, entries: readonly RunLogEntry[]): RunScore {
  try {
    return scoreRun(world, goal, entries);
  } catch (e) {
    if (!(e instanceof ReplayError)) throw e;
    throw replayFailure(e);
  }
}

const modelInfo = (requested: string | null, result: PlayerResult | null): ModelInfo => ({
  requested,
  resolved: result === null ? [] : result.modelsUsed.length > 0 ? [...result.modelsUsed] : result.initModel !== null ? [result.initModel] : [],
});

/** The result recorded for a run whose player never returned one. */
const failedResult = (requested: string | null, reason: string): PlayerResult => ({
  ended: "error", reason, turns: null, costUsd: null, durationMs: null, usage: null,
  requestedModel: requested, initModel: null, modelsUsed: [], text: "",
});

const writeScore = (dir: string, r: RunReport): void =>
  writeFileSync(
    join(dir, "score.json"),
    `${JSON.stringify({ ended: r.ended, ...(r.reason === undefined ? {} : { reason: r.reason }), turns: r.turns, costUsd: r.costUsd, text: r.text, score: r.score, measured: r.measured, model: r.model, priorFit: r.priorFit, ...(r.promptNote === undefined ? {} : { promptNote: r.promptNote }), ...(r.skill === undefined ? {} : { skill: r.skill }) }, null, 2)}\n`,
  );

/** Run the agent once against a fresh server, then score and measure it. A failed player is a recorded error. */
async function runOnce(o: AgentRunOptions, index: number, world: World, priorFit: DeclaredPriorFit, driver: AgentDriver): Promise<RunReport> {
  const dir = runDir(o, index);
  mkdirSync(dir, { recursive: true });
  const runLog = resolve(dir, "run.jsonl");
  const tracePath = join(dir, "trace.jsonl");
  const prompt = buildPrompt(o.goal, o.maxTurns, o.promptNote);
  const requested = o.model ?? null;
  writeFileSync(join(dir, "mcp.json"), `${JSON.stringify(mcpConfigFor(resolve(o.world), runLog), null, 2)}\n`);
  writeFileSync(join(dir, "prompt.txt"), `${prompt}\n`);
  const skill = o.skill ? installSkill(dir, resolve(o.skill)) : undefined;

  // One controller per run: the experiment's own signal and the time limit both abort it.
  const limit = Math.min(o.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const control = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    control.abort();
  }, limit);
  const cancel = () => control.abort();
  if (o.signal?.aborted) control.abort();
  else o.signal?.addEventListener("abort", cancel, { once: true });

  const recorder = new TraceRecorder({ path: tracePath });
  let result: PlayerResult | null = null;
  let failure: HarnessError | null = null;
  try {
    result = await driver(
      { prompt, world: resolve(o.world), runLog, runDir: resolve(dir), maxTurns: o.maxTurns, model: o.model, record: o.record, signal: control.signal, skill: skill ? { pluginDir: resolve(skill.pluginDir), qualifiedName: skill.qualifiedName } : undefined },
      recorder,
    );
  } catch (e) {
    failure = e instanceof HarnessError ? e : timedOut ? new RunTimedOut(limit) : o.signal?.aborted ? new RunCancelled() : new DriverFailed(e);
  } finally {
    clearTimeout(timer);
    o.signal?.removeEventListener("abort", cancel);
  }

  let entries: RunLogEntry[] = [];
  let score: RunScore;
  let replayFailure: HarnessError | null = null;
  try {
    entries = readLog(runLog);
    score = scoreLog(world, o.goal, entries);
  } catch (e) {
    replayFailure = e instanceof HarnessError ? e : new RunFailed(e);
    entries = [];
    score = scoreRun(world, o.goal, []);
  }

  const problem = failure ?? replayFailure;
  const base = result ?? failedResult(requested, problem ? reasonOf(problem) : "");
  const player: PlayerResult = problem ? { ...base, ended: "error", reason: reasonOf(problem) } : base;
  const report: RunReport = {
    ...player,
    index,
    dir,
    score,
    measured: measureRun(entries, readTrace(tracePath), result, score, recorder.skipped),
    model: modelInfo(requested, result),
    priorFit,
    ...(o.promptNote === undefined ? {} : { promptNote: o.promptNote }),
    ...(skill ? { skill: { name: skill.name, sha256: skill.sha256, invoked: result?.skillInvoked === true, loadedAfterCalls: result?.skillLoadedAfterCalls ?? null } } : {}),
  };
  writeScore(dir, report);
  return report;
}

/** A run that could not even be set up or recorded, such as a folder that cannot be written. */
function brokenRun(o: AgentRunOptions, index: number, world: World, priorFit: DeclaredPriorFit, e: unknown): RunReport {
  const dir = runDir(o, index);
  const reason = reasonOf(e instanceof HarnessError ? e : new RunFailed(e));
  const report: RunReport = {
    ...failedResult(o.model ?? null, reason),
    index, dir, score: scoreRun(world, o.goal, []), measured: { trace: "absent" }, model: modelInfo(o.model ?? null, null), priorFit,
    ...(o.promptNote === undefined ? {} : { promptNote: o.promptNote }),
  };
  try {
    writeScore(dir, report);
  } catch {
    // the folder is the thing that failed; the summary still records the run
  }
  return report;
}

/** Run the agent `runs` times on one world and goal, scoring each run and aggregating. One failure never ends the experiment. */
export async function runExperiment(o: AgentRunOptions): Promise<{ dir: string; reports: RunReport[]; aggregate: Aggregate; cancelled: boolean }> {
  const world = loadWorld(o.world);
  if (!world.items.some((i) => i.id === o.goal.item)) throw new UnknownGoalItem(o.goal.item);
  // An invalid notes file ends the batch here, before anything is created or spent.
  const priorFit = priorFitOf(o.world);
  if (o.skill && !existsSync(join(o.skill, "SKILL.md"))) throw new SkillNotFound(`${o.skill} has no SKILL.md`);
  // Refuse before spending anything on a label that has already been used.
  for (let i = 1; i <= o.runs; i++) if (existsSync(runDir(o, i))) throw new RunFolderExists(runDir(o, i));

  const driver = o.driver ?? (await import("./sdk-driver.js")).sdkDriver;
  const dir = join(o.out, o.label);
  mkdirSync(dir, { recursive: true });

  const reports: RunReport[] = [];
  let cancelled = false;
  for (let i = 1; i <= o.runs; i++) {
    if (o.signal?.aborted) {
      cancelled = true;
      break;
    }
    let report: RunReport;
    try {
      report = await runOnce(o, i, world, priorFit, driver);
    } catch (e) {
      report = brokenRun(o, i, world, priorFit, e);
    }
    reports.push(report);
    if (report.reason?.startsWith("RunCancelled")) cancelled = true;
  }

  const agg = aggregate(reports);
  writeFileSync(
    join(dir, "summary.json"),
    `${JSON.stringify({ world: o.world, priorFit, ...(o.promptNote === undefined ? {} : { promptNote: o.promptNote }), goal: o.goal, maxTurns: o.maxTurns, record: o.record, timeoutMs: o.timeoutMs ?? DEFAULT_TIMEOUT_MS, cancelled, aggregate: agg, models: agg.models, mixedModels: agg.mixedModels, runs: reports.map(({ text: _text, ...r }) => r) }, null, 2)}\n`,
  );
  return { dir, reports, aggregate: agg, cancelled };
}
