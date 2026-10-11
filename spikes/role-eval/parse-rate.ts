// Role parse-rate eval (spec 007): how often does a model, through a role driver, return an answer that passes the real
// critic and reviser schemas? It uses one fixed recording and the real role prompts, N calls per role per model, and reports
// the rate with its 95% Wilson interval. It runs on either runtime, so the AI SDK driver can be compared with the earlier
// Claude Agent SDK driver (run it from a checkout of the earlier commit with --driver sdk).
//   pnpm dev spikes/role-eval/parse-rate.ts --runs <run folder> --models <m1,m2> [--driver ai|sdk] [--n 20] [--concurrency 4]
// For the AI SDK driver it reports two rates from the same calls: the first attempt (what a single call would give) and the
// final answer after the driver's bounded retry. Answers and reasons are never printed; only counts, paths and costs.
import { parseArgs } from "node:util";
import { wilson } from "../../src/harness/report.js";
import { criticPrompt, reviserPrompt } from "../../src/loop/inputs.js";
import { skillName } from "../../src/harness/skill.js";
import { readPackage } from "../../src/loop/package.js";
import { loadRubric } from "../../src/loop/rubric.js";
import { replayRun } from "../../src/loop/transcript.js";
import * as V from "../../src/loop/verdict.js";
import type { ZodError } from "zod";

const { parseVerdict, revisionSchema, toJsonSchema, verdictSchema } = V;
// The earlier checkout has no describeIssues (it did not retry in the driver); a plain stand-in is only used there, where it is never called.
const describeIssues: (e: ZodError) => string = (V as { describeIssues?: (e: ZodError) => string }).describeIssues ?? ((e) => e.issues.map((i) => i.path.join(".")).join("; "));

const { values } = parseArgs({ options: { runs: { type: "string" }, models: { type: "string" }, driver: { type: "string", default: "ai" }, n: { type: "string", default: "20" }, concurrency: { type: "string", default: "4" }, skill: { type: "string", default: "spikes/skill-pilot/craft-glirol" } } });
if (!values.runs || !values.models) throw new Error("usage: parse-rate.ts --runs <run folder> --models <m1,m2> [--driver ai|sdk] [--n 20]");
const N = Number(values.n);
const sdk = values.driver === "sdk";
const driver = sdk ? (await import("../../src/harness/sdk-driver.js")).sdkRoleDriver : (await import("../../src/harness/ai-driver.js")).aiRoleDriver;

const rubric = loadRubric();
const rec = await replayRun(values.runs, "001");
const pkg = readPackage(values.skill as string);
const goals = [rec.goal];
const ctx = { candidateName: skillName(pkg["SKILL.md"] ?? ""), runs: [{ label: "001", callCount: rec.callCount }] };
const verdict = parseVerdict(rubric, {
  overall: "revise",
  questions: Object.fromEntries(rubric.questions.map((q) => [q.id, { value: "no", reason: "The skill has no recipe." }])),
  reasons: "Add the recorded chain.",
  proposedRevisions: ["Lead with the chain of placements and the craft."],
});
const roles = {
  critic: { prompt: criticPrompt({ rubric, goals, recordings: [rec], pkg }), zod: verdictSchema(rubric) },
  reviser: { prompt: reviserPrompt({ rubric, goals, recordings: [rec], pkg, verdict }), zod: revisionSchema(ctx) },
};

interface Cell { role: string; model: string; calls: number; first: number; final: number; reasons: Record<string, number>; cost: number; issues: Record<string, number>; unpriced: number }
const cells: Cell[] = [];
const jobs: (() => Promise<void>)[] = [];
for (const model of (values.models as string).split(",")) {
  for (const [roleName, role] of Object.entries(roles)) {
    const cell: Cell = { role: roleName, model, calls: 0, first: 0, final: 0, reasons: {}, cost: 0, issues: {}, unpriced: 0 };
    cells.push(cell);
    for (let i = 0; i < N; i++) {
      jobs.push(async () => {
        let firstTry: boolean | undefined;
        const check = (a: unknown): string | undefined => {
          const p = role.zod.safeParse(a);
          if (firstTry === undefined) {
            firstTry = p.success;
            // a custom rule's message is the schema's own fixed wording, so it can be tallied; no answer text is
            if (!p.success) for (const issue of p.error.issues) { const k = `${issue.path.map((x) => (typeof x === "number" ? "#" : x)).join(".")}:${issue.code}${issue.code === "custom" ? ` (${issue.message})` : ""}`; cell.issues[k] = (cell.issues[k] ?? 0) + 1; }
          }
          return p.success ? undefined : describeIssues(p.error);
        };
        const r = await driver({ prompt: role.prompt.prompt, system: role.prompt.system, model, schema: toJsonSchema(role.zod), maxUsd: 0.5, signal: new AbortController().signal, ...(sdk ? {} : { check }) });
        cell.calls++;
        if (r.costUsd === null) cell.unpriced++;
        else cell.cost += r.costUsd;
        const valid = r.ok && role.zod.safeParse(r.answer).success;
        if (valid) cell.final++;
        else cell.reasons[r.ok ? "answer fails the schema" : (r.reason ?? "failed").replace(/^DriverFailed: /, "")] = (cell.reasons[r.ok ? "answer fails the schema" : (r.reason ?? "failed").replace(/^DriverFailed: /, "")] ?? 0) + 1;
        if (sdk) { if (valid) cell.first++; } // the earlier driver retried inside the SDK: one result per call
        else if (firstTry === true) cell.first++;
      });
    }
  }
}
const pool = async () => { for (let j = jobs.shift(); j !== undefined; j = jobs.shift()) await j(); };
await Promise.all(Array.from({ length: Number(values.concurrency) }, pool));

const pct = (k: number, n: number) => { const [lo, hi] = wilson(k, n); return `${k}/${n} = ${Math.round((100 * k) / n)}% [${Math.round(lo * 100)}, ${Math.round(hi * 100)}]`; };
console.log(`driver ${sdk ? "claude-agent-sdk (earlier runtime)" : "ai-sdk"}; recording ${rec.callCount} calls; ${N} calls per role per model`);
for (const c of cells) {
  console.log(`\n${c.model} / ${c.role}`);
  console.log(`  ${sdk ? "valid answers" : "first attempt valid"}: ${pct(c.first, c.calls)}`);
  if (!sdk) console.log(`  valid after the driver's retry: ${pct(c.final, c.calls)}`);
  else console.log(`  (the earlier driver returns one result per call; its own retries are inside the SDK)`);
  if (Object.keys(c.reasons).length > 0) console.log(`  failures: ${JSON.stringify(c.reasons)}`);
  if (Object.keys(c.issues).length > 0) console.log(`  first-attempt issues (path:code, count): ${JSON.stringify(c.issues)}`);
  console.log(`  cost $${c.cost.toFixed(3)} over ${c.calls - c.unpriced} priced calls${c.unpriced > 0 ? ` (${c.unpriced} unpriced)` : ""}`);
}
