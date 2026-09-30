/**
 * Run headless Claude Code against the craft server, score each run from its log, and summarise.
 * Usage: pnpm dev scripts/run-agent.ts --goal <item>[:<qty>] [--world <world.json>] [--runs 3] [--max-turns 40]
 *        [--label name] [--out runs] [--model m] [--record] [--claude <bin>] [--dry-run]
 * By default the session is kept out of NAMS; --record lets nams-hooks record it.
 */
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { WorldError } from "../src/sim/errors.js";
import { runExperiment, planExperiment, type AgentRunOptions, type RunReport } from "../src/harness/run.js";
import { loadWorld } from "../src/sim/loader.js";
import { ReplayError } from "../src/sim/score.js";

const { values } = parseArgs({
  options: {
    world: { type: "string", default: "worlds/generated/forge-7.json" },
    goal: { type: "string" },
    runs: { type: "string", default: "1" },
    "max-turns": { type: "string", default: "40" },
    out: { type: "string", default: "runs" },
    label: { type: "string" },
    model: { type: "string" },
    record: { type: "boolean", default: false },
    claude: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const positive = (name: string, text: string | undefined): number => {
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 ? n : fail(`--${name} must be a whole number of at least 1`);
};

function line(r: RunReport): string {
  const s = r.score;
  const calls = s.best ? `${s.callsToGoal} (best ${s.best.minCalls}${s.extraCalls === null ? "" : `, +${s.extraCalls}`})` : `${s.callsToGoal}`;
  const refusals = Object.values(s.refusals).reduce((a, b) => a + b, 0);
  const cost = r.costUsd === null ? "-" : `$${r.costUsd.toFixed(3)}`;
  return `run ${String(r.index).padStart(3, "0")}  ${s.reached ? "reached " : "NOT reached"}  calls ${calls}  crafts ${s.craftsMade}  failed crafts ${s.failedCrafts}  refusals ${refusals}  turns ${r.turns ?? "-"}  ${cost}  ended ${r.ended}`;
}

try {
  if (!values.goal) fail("usage: run-agent.ts --goal <item>[:<qty>] [--world <world.json>] [--runs n] [--max-turns n] [--label name] [--dry-run]");
  const [item = "", qty = "1"] = (values.goal as string).split(":");
  const world = loadWorld(values.world as string);
  if (!world.items.some((i) => i.id === item)) fail(`goal wants unknown item '${item}'`);

  const options: AgentRunOptions = {
    world: values.world as string,
    goal: { item, qty: positive("goal quantity", qty) },
    runs: positive("runs", values.runs),
    maxTurns: positive("max-turns", values["max-turns"]),
    out: values.out as string,
    label: values.label ?? `${basename(values.world as string, ".json")}-${item}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    ...(values.model ? { model: values.model } : {}),
    record: values.record ?? false,
    claudeBin: values.claude ?? process.env["CLAUDE_BIN"] ?? "claude",
  };

  if (values["dry-run"]) {
    console.log(JSON.stringify(planExperiment(options), null, 2));
  } else {
    const { dir, reports, aggregate } = runExperiment(options);
    for (const r of reports) console.log(line(r));
    console.log(
      `${aggregate.runs} runs: ${aggregate.reached} reached (${Math.round(aggregate.successRate * 100)}%), ${aggregate.gaveUp} gave up, ${aggregate.outOfBudget} out of budget, ${aggregate.errors} errors; ` +
        `median calls to goal ${aggregate.medianCallsToGoal ?? "-"}; mean extra calls ${aggregate.meanExtraCalls === null ? "-" : aggregate.meanExtraCalls.toFixed(1)}; cost $${aggregate.totalCostUsd.toFixed(3)}`,
    );
    console.log(`files: ${dir}`);
  }
} catch (e) {
  if (e instanceof WorldError || e instanceof ReplayError || (e instanceof Error && /already exists|unknown item/.test(e.message))) fail(e.message);
  throw e;
}
