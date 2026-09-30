import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadWorld } from "../sim/loader.js";
import type { RunLogEntry } from "../sim/runlog.js";
import { scoreRun, type RunScore } from "../sim/score.js";
import type { SolverGoal } from "../sim/solver.js";

export interface AgentRunOptions {
  /** Path to the world file the agent will play. Use a generated world for real experiments. */
  world: string;
  goal: SolverGoal;
  runs: number;
  /** Hard budget: `claude --max-turns`. */
  maxTurns: number;
  /** Directory that holds one folder per experiment label. */
  out: string;
  label: string;
  model?: string;
  /** Let user-level settings apply, so `nams-hooks` records the session to NAMS. */
  record: boolean;
  claudeBin: string;
}

/** The goal reaches the agent only through this prompt; the world never states goals. */
export function buildPrompt(goal: SolverGoal, maxTurns: number): string {
  const what = goal.qty === 1 ? `one ${goal.item}` : `${goal.qty} of ${goal.item}`;
  return [
    `You are at a crafting table in an unfamiliar workshop. Your goal: end up holding ${what}.`,
    "Use only the craft tools, and start with help.",
    `Nobody can answer questions or give hints, so do not ask for any. Keep trying on your own until you hold ${goal.item}, or until your budget of ${maxTurns} turns is used up.`,
    "craft is irreversible and uses up whatever is on the table, so explore with place, remove, clear and look before you commit.",
    "When you hold it, say so in one line and stop.",
  ].join("\n");
}

/** MCP config that starts the craft server on one world, writing its run log to a fresh path. */
export function mcpConfigFor(worldPath: string, runLog: string): object {
  return {
    mcpServers: {
      craft: {
        command: "pnpm",
        args: ["exec", "tsx", "src/mcp/server.ts"],
        env: { SIM_WORLD: worldPath, SIM_RUN_LOG: runLog },
      },
    },
  };
}

/**
 * Arguments for a headless, tool-restricted `claude` run. Built-in tools are removed so the agent
 * cannot read the world file; unless recording is asked for, user settings are skipped so the
 * session stays out of NAMS.
 */
export function claudeArgs(a: { prompt: string; mcpConfig: string; maxTurns: number; model?: string; record: boolean }): string[] {
  return [
    "-p", a.prompt,
    "--strict-mcp-config", "--mcp-config", a.mcpConfig,
    "--tools", "",
    "--allowedTools", "mcp__craft",
    "--max-turns", String(a.maxTurns),
    "--output-format", "json",
    "--no-session-persistence",
    ...(a.record ? [] : ["--setting-sources", "project"]),
    ...(a.model ? ["--model", a.model] : []),
  ];
}

export interface ClaudeResult {
  /** `stopped`: the agent ended its turn; `budget`: it hit --max-turns; `error`: crash or unreadable output. */
  ended: "stopped" | "budget" | "error";
  turns: number | null;
  costUsd: number | null;
  text: string;
}

/** Read `claude -p --output-format json` output, tolerating warning lines before the JSON. */
export function parseClaudeResult(stdout: string): ClaudeResult {
  const failed: ClaudeResult = { ended: "error", turns: null, costUsd: null, text: stdout.slice(0, 500) };
  const start = stdout.indexOf("{");
  if (start < 0) return failed;
  try {
    const d = JSON.parse(stdout.slice(start)) as Record<string, unknown>;
    // Running out of turns is reported as an error result (and a non-zero exit), but it is a budget stop.
    const ended = d["subtype"] === "error_max_turns" ? "budget" : d["is_error"] === true ? "error" : "stopped";
    return {
      ended,
      turns: typeof d["num_turns"] === "number" ? d["num_turns"] : null,
      costUsd: typeof d["total_cost_usd"] === "number" ? d["total_cost_usd"] : null,
      text: typeof d["result"] === "string" ? d["result"] : "",
    };
  } catch {
    return failed;
  }
}

export interface RunReport extends ClaudeResult {
  index: number;
  dir: string;
  score: RunScore;
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
}

export function aggregate(reports: readonly RunReport[]): Aggregate {
  const wins = reports.filter((r) => r.score.reached);
  const sorted = wins.map((r) => r.score.callsToGoal).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length === 0 ? null : sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  const extras = wins.flatMap((r) => (r.score.extraCalls === null ? [] : [r.score.extraCalls]));
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
  };
}

const runDir = (o: AgentRunOptions, index: number): string => join(o.out, o.label, String(index).padStart(3, "0"));

/** What a run would execute, without running or creating anything (a dry run). */
export function planExperiment(o: AgentRunOptions): { run: number; dir: string; runLog: string; command: string[] }[] {
  return Array.from({ length: o.runs }, (_, i) => {
    const dir = runDir(o, i + 1);
    return {
      run: i + 1,
      dir,
      runLog: resolve(dir, "run.jsonl"),
      command: [o.claudeBin, ...claudeArgs({ prompt: buildPrompt(o.goal, o.maxTurns), mcpConfig: join(dir, "mcp.json"), maxTurns: o.maxTurns, record: o.record, ...(o.model ? { model: o.model } : {}) })],
    };
  });
}

function readLog(path: string): RunLogEntry[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as RunLogEntry);
}

/** Run the agent once against a fresh server, then score its log. */
function runOnce(o: AgentRunOptions, index: number, world: ReturnType<typeof loadWorld>): RunReport {
  const dir = runDir(o, index);
  if (existsSync(dir)) throw new Error(`${dir} already exists; choose a new --label`);
  mkdirSync(dir, { recursive: true });

  const runLog = resolve(dir, "run.jsonl");
  const mcpConfig = join(dir, "mcp.json");
  const prompt = buildPrompt(o.goal, o.maxTurns);
  writeFileSync(mcpConfig, `${JSON.stringify(mcpConfigFor(resolve(o.world), runLog), null, 2)}\n`);
  writeFileSync(join(dir, "prompt.txt"), `${prompt}\n`);

  const res = spawnSync(o.claudeBin, claudeArgs({ prompt, mcpConfig, maxTurns: o.maxTurns, record: o.record, ...(o.model ? { model: o.model } : {}) }), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    timeout: 30 * 60 * 1000,
  });
  writeFileSync(join(dir, "claude.json"), res.stdout ?? "");
  writeFileSync(join(dir, "stderr.txt"), res.stderr ?? "");

  // A non-zero exit means a crash, except when the JSON says the turn budget ran out (the CLI exits 1 then).
  const read = parseClaudeResult(res.stdout ?? "");
  const parsed = res.error || (res.status !== 0 && read.ended !== "budget") ? { ...read, ended: "error" as const } : read;
  const score = scoreRun(world, o.goal, readLog(runLog));
  writeFileSync(join(dir, "score.json"), `${JSON.stringify({ ...parsed, score }, null, 2)}\n`);
  return { ...parsed, index, dir, score };
}

/** Run the agent `runs` times on one world and goal, scoring each run and aggregating. */
export function runExperiment(o: AgentRunOptions): { dir: string; reports: RunReport[]; aggregate: Aggregate } {
  const world = loadWorld(o.world);
  if (!world.items.some((i) => i.id === o.goal.item)) throw new Error(`goal wants unknown item '${o.goal.item}'`);
  const reports: RunReport[] = [];
  for (let i = 1; i <= o.runs; i++) reports.push(runOnce(o, i, world));
  const agg = aggregate(reports);
  const dir = join(o.out, o.label);
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify({ world: o.world, goal: o.goal, maxTurns: o.maxTurns, record: o.record, aggregate: agg, runs: reports.map(({ text: _text, ...r }) => r) }, null, 2)}\n`);
  return { dir, reports, aggregate: agg };
}
