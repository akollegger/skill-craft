/**
 * The three-scenario demo's results table, from the run folders of stages A and C. The report command
 * (src/harness/report.ts) is built for one experiment on one world and needs a hand-written experiment summary;
 * this reads each label's summary.json directly and prints markdown. A difference is supported only when the
 * two Wilson 95% intervals do not overlap, the same rule the report uses.
 * Usage: pnpm dev spikes/woodworking/table.ts   (reads spikes/woodworking/results/trials/)
 */
import { readFileSync } from "node:fs";
import { wilson } from "../../src/harness/report.js";

// The committed copies of the run folders. Both arms were run under runs/, which is gitignored.
const RESULTS = "spikes/woodworking/results/trials";
const SCENARIOS = [
  { key: "mc", name: "1. wooden_pickaxe (faithful)" },
  { key: "forge", name: "2. glirol (invented)" },
  { key: "wood", name: "3. wooden_stool (perturbed)" },
];
const MODELS = ["sonnet", "haiku"];
const ARMS = [
  { arm: "unaided", prefix: "b" },
  { arm: "skill", prefix: "g" },
];

interface RunRow {
  score: { reached: boolean; extraCalls?: number; callsToGoal?: number };
  costUsd: number;
  durationMs: number;
  skill?: { invoked: boolean; loadedAfterCalls?: number };
}

const median = (xs: number[]): number | undefined => {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1]! + s[m]!) / 2;
};
// Whole numbers print whole, a half-integer median prints with one decimal, as src/harness/report.ts does.
const fmt = (n: number | undefined) => (n === undefined ? "-" : Number.isInteger(n) ? String(n) : n.toFixed(1));

interface Cell { reached: number; n: number; ci: [number, number]; extra: number[]; cost: number; loaded: number }
const cells = new Map<string, Cell>();

const lines = [
  "| Scenario | Model | Arm | Reached | 95% interval | Extra calls (min / median / max) | Cost | Skill loaded |",
  "|---|---|---|---|---|---|---|---|",
];
for (const s of SCENARIOS) {
  for (const model of MODELS) {
    for (const { arm, prefix } of ARMS) {
      const summary = JSON.parse(readFileSync(`${RESULTS}/${prefix}-${s.key}-${model}/summary.json`, "utf8")) as { runs: RunRow[] };
      const runs = summary.runs;
      const reachedRuns = runs.filter((r) => r.score.reached);
      const extra = reachedRuns.map((r) => r.score.extraCalls ?? 0);
      const cell: Cell = {
        reached: reachedRuns.length, n: runs.length, ci: wilson(reachedRuns.length, runs.length), extra,
        cost: runs.reduce((t, r) => t + r.costUsd, 0), loaded: runs.filter((r) => r.skill?.invoked).length,
      };
      cells.set(`${s.key}/${model}/${arm}`, cell);
      lines.push(
        `| ${s.name} | ${model} | ${arm} | ${cell.reached}/${cell.n} | [${cell.ci[0].toFixed(2)}, ${cell.ci[1].toFixed(2)}] | ` +
          `${extra.length ? `${Math.min(...extra)} / ${fmt(median(extra))} / ${Math.max(...extra)}` : "-"} | $${cell.cost.toFixed(2)} | ${arm === "skill" ? `${cell.loaded}/${cell.n}` : "-"} |`,
      );
    }
  }
}
lines.push("", "Skill against unaided, reach (a difference is supported only when the two intervals do not overlap):", "");
for (const s of SCENARIOS) {
  for (const model of MODELS) {
    const a = cells.get(`${s.key}/${model}/unaided`)!;
    const b = cells.get(`${s.key}/${model}/skill`)!;
    const verdict = b.ci[0] > a.ci[1] ? "supported (skill higher)" : a.ci[0] > b.ci[1] ? "supported (unaided higher)" : "within noise";
    lines.push(`- ${s.name}, ${model}: unaided ${a.reached}/${a.n}, skill ${b.reached}/${b.n}: ${verdict}`);
  }
}
console.log(lines.join("\n"));
