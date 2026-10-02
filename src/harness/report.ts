import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { HarnessError, isUserError, ReportRefused } from "./errors.js";

export { ReportRefused };

const CEILING = 0.9;
const Z = 1.96;

/** 95% Wilson score interval for `successes` out of `n` trials. */
export function wilson(successes: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const z2 = Z * Z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

const summarySchema = z.object({
  experiment: z.string(),
  priorFit: z.string(),
  route: z.enum(["escalating", "preemptive"]),
  primary: z.enum(["repair", "transfer"]),
  models: z.object({ teacher: z.string(), student: z.string() }),
  /** The goal set, and the goals set aside before any trial. */
  goals: z.object({ set: z.array(z.string()), heldOut: z.array(z.string()) }),
  /** Each goal's role from calibration; absent until calibration has been read. */
  roles: z.record(z.string(), z.enum(["gap", "solved", "ambiguous"])).optional(),
  arms: z.array(z.object({ label: z.string(), model: z.string(), skill: z.boolean().optional(), promptNote: z.string().optional() })),
  trials: z.object({ calibration: z.number(), teacherPerRecordedGoal: z.number(), armGap: z.number(), armSolved: z.number(), armHeldOut: z.number() }),
  manualSteps: z.array(z.string()),
  labels: z.record(z.string(), z.union([z.object({ stage: z.literal("calibration") }), z.object({ arm: z.string() })])),
  /** The invented counterpart's goal names, each mapped to the faithful goal it stands for. */
  counterpartGoals: z.record(z.string(), z.string()).optional(),
});
type Summary = z.infer<typeof summarySchema>;

const reviewSchema = z.object({ verdict: z.enum(["accept", "revise", "reject"]), skillSha256: z.string() });

/** What a run's score.json must hold. Parsed, not cast: a string "false" would otherwise count as a success. */
const scoreSchema = z.object({
  costUsd: z.number().nullable(),
  priorFit: z.string().optional(),
  promptNote: z.string().optional(),
  score: z.object({ reached: z.boolean(), extraCalls: z.number().nullable() }),
  measured: z
    .object({ total: z.object({ inputTokens: z.number(), outputTokens: z.number(), cacheReadTokens: z.number(), cacheCreationTokens: z.number() }).optional() })
    .optional(),
  model: z.object({ resolved: z.array(z.string()) }),
  skill: z.object({ sha256: z.string(), invoked: z.boolean(), loadedAfterCalls: z.number().nullable() }).optional(),
});

function readJson<T>(path: string, what: string): unknown {
  if (!existsSync(path)) throw new ReportRefused(`no ${what} at ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    throw new ReportRefused(`${what} at ${path} is not valid JSON`);
  }
}

interface Row {
  order: number;
  stage: string;
  model: string;
  fit: string;
  goal: string;
  role: "held-out" | "gap" | "solved" | "ambiguous" | "unassigned";
  trials: number;
  planned: number | null;
  reached: number;
  extras: number[];
  cost: number;
  tokens: [number, number, number, number];
  skillRuns: number;
  loaded: number[];
  skilled: boolean;
}

const STAGES = ["calibration", "T0", "S0", "S1", "S2"];
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};
const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const pct2 = (x: number): string => x.toFixed(2);

export interface ReportInput {
  /** The experiment folder, holding `summary.json` (and `review.json` when a skill was used). */
  experiment: string;
  /** The run label folders to report on. */
  labels: string[];
}

/** Build the results table as markdown. Contains only counts, measured quantities and fixed labels. */
export function buildReport(input: ReportInput): string {
  const parsed = summarySchema.safeParse(readJson(join(input.experiment, "summary.json"), "experiment summary"));
  if (!parsed.success) throw new ReportRefused(`the experiment summary does not match the contract: ${parsed.error.issues[0]?.path.join(".") ?? ""}`);
  const summary: Summary = parsed.data;

  if (summary.roles !== undefined) {
    for (const goal of summary.goals.set) if (summary.roles[goal] === undefined) throw new ReportRefused(`the summary has no role for goal ${goal}`);
  }
  for (const goal of summary.goals.heldOut) if (!summary.goals.set.includes(goal)) throw new ReportRefused(`held-out goal ${goal} is not in the goal set`);

  const dirs = [...input.labels].sort((a, b) => (basename(a) < basename(b) ? -1 : 1));
  const rows = new Map<string, Row>();
  const skillArmUsed = dirs.some((d) => {
    const tag = summary.labels[basename(d)];
    return tag !== undefined && "arm" in tag && summary.arms.find((a) => a.label === tag.arm)?.skill === true;
  });
  let reviewSha: string | undefined;
  if (skillArmUsed) {
    const review = reviewSchema.safeParse(readJson(join(input.experiment, "review.json"), "review record (review.json)"));
    if (!review.success) throw new ReportRefused("review.json needs a verdict (accept, revise or reject) and skillSha256");
    // Only a skill that cleared review may reach a student arm.
    if (review.data.verdict !== "accept") throw new ReportRefused(`the skill's review verdict is ${review.data.verdict}; only an accepted skill reaches the student arms, so there are no skill-arm results to report`);
    reviewSha = review.data.skillSha256;
  }

  for (const dir of dirs) {
    const name = basename(dir);
    if (!existsSync(dir)) throw new ReportRefused(`run folder ${dir} is missing`);
    const tag = summary.labels[name];
    if (tag === undefined) throw new ReportRefused(`run folder ${name} is not listed in the experiment summary`);
    const arm = "arm" in tag ? summary.arms.find((a) => a.label === tag.arm) : undefined;
    if ("arm" in tag && arm === undefined) throw new ReportRefused(`run folder ${name} names an arm the summary does not define`);
    const batch = readJson(join(dir, "summary.json"), `batch summary of ${name}`) as { goal?: { item?: string } };
    const batchGoal = batch.goal?.item;
    if (batchGoal === undefined) throw new ReportRefused(`batch summary of ${name} names no goal`);
    // A renamed world's goals are shown, and compared, under the faithful goal they stand for.
    const goal = summary.counterpartGoals?.[batchGoal] ?? batchGoal;
    const stage = "arm" in tag ? tag.arm : "calibration";
    const role: Row["role"] = summary.goals.heldOut.includes(goal) ? "held-out" : (summary.roles?.[goal] ?? "unassigned");
    const planned =
      stage === "calibration"
        ? summary.trials.calibration
        : stage === "T0"
          ? summary.trials.teacherPerRecordedGoal
          : role === "held-out"
            ? summary.trials.armHeldOut
            : role === "gap"
              ? summary.trials.armGap
              : role === "solved"
                ? summary.trials.armSolved
                : null;

    // The model an arm declares ("teacher" or "student") resolved through the summary; a calibration folder declares none.
    const expectedModel = arm === undefined ? undefined : summary.models[arm.model as "teacher" | "student"];
    if (arm !== undefined && expectedModel === undefined) throw new ReportRefused(`arm ${arm.label} names model "${arm.model}", which the summary's models do not define`);
    const rowFor = (model: string, fit: string): Row => {
      const key = [stage, model, fit, goal].join("\u0000");
      let row = rows.get(key);
      if (row === undefined) {
        row = { order: STAGES.indexOf(stage), stage, model, fit, goal, role, trials: 0, planned, reached: 0, extras: [], cost: 0, tokens: [0, 0, 0, 0], skillRuns: 0, loaded: [], skilled: arm?.skill === true };
        rows.set(key, row);
      }
      return row;
    };

    const runDirs = readdirSync(dir).filter((f) => /^\d{3}$/.test(f)).sort();
    // A planned arm with no runs stays visible as 0 trials, so a skipped arm cannot hide.
    if (runDirs.length === 0) rowFor(expectedModel ?? "unknown", expectedModel === undefined ? "unknown" : summary.priorFit);
    for (const rd of runDirs) {
      const parsedScore = scoreSchema.safeParse(readJson(join(dir, rd, "score.json"), `score of ${name}/${rd}`));
      if (!parsedScore.success) throw new ReportRefused(`score of ${name}/${rd} does not match the expected shape: ${parsedScore.error.issues[0]?.path.join(".") ?? ""}`);
      const s = parsedScore.data;
      const wantsSkill = arm?.skill === true;
      if (wantsSkill) {
        if (s.skill === undefined) throw new ReportRefused(`${name}/${rd} has no skill, but arm ${arm?.label} should`);
        if (s.skill.sha256 !== reviewSha) throw new ReportRefused(`${name}/${rd} used a skill whose SHA-256 fingerprint differs from the reviewed one`);
      } else if (s.skill !== undefined) {
        throw new ReportRefused(`${name}/${rd} had a skill, but it belongs to ${stage === "calibration" ? "calibration" : `arm ${stage}`}`);
      }
      if ((s.promptNote ?? undefined) !== (arm?.promptNote ?? undefined)) {
        throw new ReportRefused(`${name}/${rd} has a different prompt note from its arm's`);
      }
      const model = s.model.resolved.length > 0 ? s.model.resolved.join("+") : "unknown";
      if (expectedModel !== undefined && model !== expectedModel) throw new ReportRefused(`${name}/${rd} ran model ${model}, but arm ${arm?.label} declares ${expectedModel}`);
      const fit = s.priorFit ?? "undeclared";
      const row = rowFor(model, fit);
      row.trials += 1;
      if (s.score.reached) {
        row.reached += 1;
        if (s.score.extraCalls !== null) row.extras.push(s.score.extraCalls);
      }
      row.cost += s.costUsd ?? 0;
      const t = s.measured?.total;
      if (t) {
        row.tokens[0] += t.inputTokens;
        row.tokens[1] += t.outputTokens;
        row.tokens[2] += t.cacheReadTokens;
        row.tokens[3] += t.cacheCreationTokens;
      }
      if (s.skill) {
        row.skillRuns += 1;
        if (s.skill.invoked && s.skill.loadedAfterCalls !== null) row.loaded.push(s.skill.loadedAfterCalls);
      }
    }
  }

  const sorted = [...rows.values()].sort(
    (a, b) => a.order - b.order || (a.model < b.model ? -1 : a.model > b.model ? 1 : 0) || (a.fit < b.fit ? -1 : a.fit > b.fit ? 1 : 0) || (a.role === b.role ? 0 : a.role === "held-out" ? -1 : b.role === "held-out" ? 1 : 0) || (a.goal < b.goal ? -1 : a.goal > b.goal ? 1 : 0),
  );
  const goalCell = (r: Row) => `${r.role} ${r.goal}`;

  // Before the roles are in the summary, print what the rule gives each goal and stop.
  if (summary.roles === undefined) {
    const proposal = [`# Role proposals: ${summary.experiment}`, "", "From the student's unaided calibration trials in this world (at most 20% is a gap, at least 80% is solved, otherwise ambiguous):", ""];
    for (const goal of summary.goals.set) {
      const r = sorted.find((x) => x.stage === "calibration" && x.model === summary.models.student && x.fit === summary.priorFit && x.goal === goal);
      if (r === undefined || r.trials === 0) proposal.push(`- ${goal}: no student trials`);
      else {
        const rate = r.reached / r.trials;
        proposal.push(`- ${goal}: ${rate <= 0.2 ? "gap" : rate >= 0.8 ? "solved" : "ambiguous"} (${r.reached}/${r.trials})`);
      }
    }
    return `${proposal.join("\n")}\n`;
  }

  const lines: string[] = [
    `# Results: ${summary.experiment}`,
    "",
    `World prior fit: ${summary.priorFit}. Rows are stamped with the prior fit recorded in each run.`,
    `Route: ${summary.route}; primary measure: ${summary.primary}.${summary.route === "escalating" ? " Both were declared after calibration, which this route needs: the gaps are found first." : ""}`,
    "",
    "| Arm | Model | Prior fit | Goal | Reached | 95% interval | Extra calls (min / median / max) | Cost | Tokens | Skill loaded | Flags |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of sorted) {
    const [lo, hi] = wilson(r.reached, r.trials);
    const flags = [r.reached / r.trials >= CEILING ? "ceiling" : "", r.planned !== null && r.trials < r.planned ? "short" : ""].filter(Boolean).join(", ");
    const extras = r.extras.length === 0 ? "-" : `${num(Math.min(...r.extras))} / ${num(median(r.extras))} / ${num(Math.max(...r.extras))}`;
    const skill = r.skilled ? `${r.loaded.length}/${r.skillRuns} loaded${r.loaded.length > 0 ? `, median ${num(median(r.loaded))}` : ""}` : "-";
    const [ti, to, tc, tw] = r.tokens;
    lines.push(
      `| ${r.stage} | ${r.model} | ${r.fit} | ${goalCell(r)} | ${r.reached}/${r.trials} | [${pct2(lo)}, ${pct2(hi)}] | ${extras} | $${r.cost.toFixed(2)} | ${ti} in / ${to} out / ${tc} cache read / ${tw} cache write | ${skill} | ${flags} |`,
    );
  }

  const verdict = (a: Row, b: Row): string => {
    const [alo, ahi] = wilson(a.reached, a.trials);
    const [blo, bhi] = wilson(b.reached, b.trials);
    if (ahi < blo) return "supported (second is higher)";
    if (bhi < alo) return "supported (first is higher)";
    return "within noise";
  };
  const find = (stage: string, model: string, fit: string, goal: string) => sorted.find((r) => r.stage === stage && r.model === model && r.fit === fit && r.goal === goal);
  const skillAgainstBaseline = (role: Row["role"]): string[] => {
    const out: string[] = [];
    for (const a of sorted.filter((r) => (r.stage === "S1" || r.stage === "S2") && r.role === role)) {
      const b = find("S0", a.model, a.fit, a.goal);
      if (b) out.push(`- ${a.stage} against S0, ${a.model}, ${a.fit}, ${goalCell(a)}: ${a.stage} ${a.reached}/${a.trials}, S0 ${b.reached}/${b.trials}: ${verdict(b, a)}`);
    }
    return out.length > 0 ? out : ["- none planned have data"];
  };

  const bound: string[] = [];
  for (const a of sorted.filter((r) => r.stage === "calibration" && r.fit === "faithful")) {
    const b = find("calibration", a.model, "invented", a.goal);
    if (b) bound.push(`- faithful against invented, ${a.model}, ${goalCell(a)}: faithful ${a.reached}/${a.trials}, invented ${b.reached}/${b.trials}: ${verdict(a, b)}`);
  }
  lines.push("", "Bound (unaided; a difference is supported only when the two 95% intervals do not overlap)", "", ...(bound.length > 0 ? bound : ["- none planned have data"]));

  lines.push("", "Repair (gap goals)", "", "- Repair is not yet distinguished from a memory of the solution: there is no memory arm.", ...skillAgainstBaseline("gap"));
  lines.push("", "No harm (solved goals)", "", ...skillAgainstBaseline("solved"));
  const transfer: string[] = [];
  const heldOutRows = sorted.filter((r) => r.role === "held-out" && (r.stage === "S1" || r.stage === "S2"));
  for (const goal of summary.goals.heldOut) {
    for (const base of sorted.filter((r) => r.stage === "S0" && r.goal === goal)) {
      if (base.reached / base.trials >= CEILING) transfer.push(`- ${goal}: unmeasurable: the held-out goal is solved without help (S0 ${base.reached}/${base.trials})`);
      else for (const a of heldOutRows.filter((r) => r.goal === goal && r.model === base.model && r.fit === base.fit)) transfer.push(`- ${a.stage} against S0, ${a.model}, ${a.fit}, ${goalCell(a)}: ${a.stage} ${a.reached}/${a.trials}, S0 ${base.reached}/${base.trials}: ${verdict(base, a)}`);
    }
  }
  lines.push("", "Transfer (held-out goals)", "", ...(transfer.length > 0 ? transfer : ["- none planned have data"]));
  lines.push("", "Steps done by hand", ...(summary.manualSteps.length > 0 ? summary.manualSteps.map((s) => `- ${s}`) : ["- none"]));
  return `${lines.join("\n")}\n`;
}

export interface ReportDeps {
  out: (text: string) => void;
  err: (line: string) => void;
}

const USAGE = "usage: report.ts --experiment <runs/experiment folder> <run label folder>...";

/** The `report` command as a function: arguments in, markdown out, an exit code back. */
export function reportCli(argv: string[], deps: ReportDeps): number {
  try {
    const { values, positionals } = parseArgs({ args: argv, options: { experiment: { type: "string" } }, allowPositionals: true });
    if (!values.experiment) {
      deps.err(USAGE);
      return 1;
    }
    deps.out(buildReport({ experiment: values.experiment, labels: positionals }));
    return 0;
  } catch (e) {
    if (e instanceof TypeError) deps.err(`${e.message}\n${USAGE}`);
    else if (isUserError(e)) deps.err((e as Error).message);
    else deps.err(e instanceof HarnessError ? `${e.code}: ${e.message}` : "unexpected error");
    return 1;
  }
}
