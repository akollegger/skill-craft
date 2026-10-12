import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { HarnessError, isUserError, ReportRefused } from "./errors.js";
import { canonicalSpec } from "./models.js";
import { fromRepoPath } from "./paths.js";

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

/** The settings pinned for a role: the same names and limits as `ModelSettings`, and nothing else. */
const settingsSchema = z.object({ temperature: z.number().min(0).optional(), effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(), thinking: z.union([z.enum(["adaptive", "off"]), z.number().int().min(1024)]).optional() }).strict();
type Settings = z.infer<typeof settingsSchema>;

const roleSchema = z.object({ model: z.string(), settings: settingsSchema.default({}) }).strict();

/** Who plays each role in an experiment (ADR-003 §2.1, amended): settings belong to the role, and one model may fill several. */
const castSchema = z
  .object({
    teacher: roleSchema,
    student: roleSchema,
    /** The memory service distils; the critic and reviser are its review stage. Absent in an experiment that does not say. */
    distiller: z.object({ service: z.string(), critic: roleSchema, reviser: roleSchema }).strict().optional(),
  })
  .strict();
type Cast = z.infer<typeof castSchema>;

const summarySchema = z.object({
  experiment: z.string(),
  priorFit: z.string(),
  route: z.enum(["escalating", "preemptive"]),
  primary: z.enum(["repair", "transfer"]),
  /** The cast of the experiment. Exactly one of `cast` and the older `models` is given. */
  cast: castSchema.optional(),
  models: z
    .object({
      teacher: z.string(),
      student: z.string(),
      /** The settings pinned for each model, keyed by model spec (a bare Claude id is read as `anthropic/<id>`); absent means none were pinned. */
      settings: z.record(z.string(), settingsSchema).default({}),
    })
    .optional(),
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

/** The cast of a summary, reading the older `models` form as the same cast (its settings are looked up by canonical model name). */
function castOf(summary: Summary): Cast {
  if ((summary.cast === undefined) === (summary.models === undefined)) throw new ReportRefused("the experiment summary must give exactly one of `cast` and `models`");
  if (summary.cast !== undefined) return summary.cast;
  const m = summary.models!;
  const byModel = new Map(Object.entries(m.settings).map(([k, v]) => [canonicalSpec(k), v]));
  return { teacher: { model: m.teacher, settings: byModel.get(canonicalSpec(m.teacher)) ?? {} }, student: { model: m.student, settings: byModel.get(canonicalSpec(m.student)) ?? {} } };
}

/** A role's settings as one comparable shape, `null` for each one that is not pinned. */
const normal = (s: { temperature?: number | null | undefined; effort?: string | null | undefined; thinking?: string | number | null | undefined } | null | undefined) => ({ temperature: s?.temperature ?? null, effort: s?.effort ?? null, thinking: s?.thinking ?? null });
const sameSettings = (a: Parameters<typeof normal>[0], b: Parameters<typeof normal>[0]): boolean => JSON.stringify(normal(a)) === JSON.stringify(normal(b));
const settingsText = (s: Parameters<typeof normal>[0]): string => {
  const n = normal(s);
  const parts = [n.thinking === null ? "" : `thinking ${n.thinking}`, n.effort === null ? "" : `effort ${n.effort}`, n.temperature === null ? "" : `temperature ${n.temperature}`].filter(Boolean);
  return parts.length === 0 ? "unset" : parts.join(", ");
};
const roleText = (r: { model: string; settings?: Parameters<typeof normal>[0] }): string => `${canonicalSpec(r.model)} (${settingsText(r.settings)})`;

/** The lines that state the cast, and which roles share a model. */
function castLines(cast: Cast): string[] {
  const roles: [string, { model: string; settings?: Settings }][] = [["teacher", cast.teacher], ["student", cast.student], ...(cast.distiller === undefined ? [] : ([["critic", cast.distiller.critic], ["reviser", cast.distiller.reviser]] as [string, { model: string; settings?: Settings }][]))];
  const lines = ["Cast", `- teacher: ${roleText(cast.teacher)}`, `- student: ${roleText(cast.student)}`];
  if (cast.distiller !== undefined) lines.push(`- distiller: ${cast.distiller.service}; critic ${roleText(cast.distiller.critic)}; reviser ${roleText(cast.distiller.reviser)}`);
  const byModel = new Map<string, string[]>();
  for (const [name, r] of roles) byModel.set(canonicalSpec(r.model), [...(byModel.get(canonicalSpec(r.model)) ?? []), name]);
  for (const [model, names] of byModel) if (names.length > 1) lines.push(`- shared model: ${names.join(", ")}: ${model}`);
  return lines;
}

/** A loop record, as much of it as the report reads. Parsed, so a file that is not one is refused. */
const loopSchema = z.object({
  finalSkillSha256: z.string().nullable(),
  process: z.object({ version: z.string(), commit: z.string().nullable(), dirty: z.boolean().nullable() }).nullable().optional(),
  recordedRuns: z.array(z.object({ models: z.array(z.string()), settings: settingsSchema.partial().extend({ temperature: z.number().nullable().optional(), effort: z.string().nullable().optional(), thinking: z.union([z.string(), z.number()]).nullable().optional() }).nullable() }).passthrough()),
  recordingFormat: z.string().nullable().optional(),
  roles: z.object({
    critic: z.object({ requested: z.string(), resolved: z.array(z.string()), settings: z.any().nullable() }).passthrough(),
    reviser: z.object({ requested: z.string(), resolved: z.array(z.string()), settings: z.any().nullable() }).passthrough(),
  }),
  distiller: z
    .object({ service: z.union([z.object({ name: z.string(), version: z.string(), released: z.string(), commit: z.string(), environment: z.string() }), z.object({ name: z.string(), unknown: z.string() })]) })
    .nullable()
    .optional(),
});
type Loop = z.infer<typeof loopSchema>;

/**
 * Read the loop record that made a skill, check it against the reviewed skill and the cast, and say who made it. A record
 * that contradicts either is refused: the table would otherwise be read against a skill it did not use.
 */
function skillMadeBy(path: string, reviewSha: string, cast: Cast): string[] {
  const parsed = loopSchema.safeParse(readJson(fromRepoPath(path), "loop record named by review.json"));
  if (!parsed.success) throw new ReportRefused("the loop record named by review.json is not a loop record");
  const loop: Loop = parsed.data;
  if (loop.finalSkillSha256 !== reviewSha) throw new ReportRefused("the loop record's final skill is not the reviewed skill");
  const teacher = canonicalSpec(cast.teacher.model);
  for (const r of loop.recordedRuns) {
    // Exactly the cast's teacher: a run a substituted model also served is not the teacher's, and one that names no model cannot be checked.
    const ran = r.models.map(canonicalSpec);
    if (ran.length === 0 || !ran.every((m) => m === teacher)) throw new ReportRefused(`the loop record's runs were not made by the cast's teacher (${teacher}) alone`);
    if (!sameSettings(r.settings, cast.teacher.settings)) throw new ReportRefused("the loop record's runs used settings other than the cast's teacher's");
  }
  if (cast.distiller !== undefined) {
    for (const [name, want, got] of [["critic", cast.distiller.critic, loop.roles.critic], ["reviser", cast.distiller.reviser, loop.roles.reviser]] as const) {
      if (canonicalSpec(got.requested) !== canonicalSpec(want.model)) throw new ReportRefused(`the loop record's ${name} is not the cast's`);
      // What the provider reported as having answered must be the cast's model too, or a substitution would pass for the cast.
      if (got.resolved.length === 0 || !got.resolved.every((m) => canonicalSpec(m) === canonicalSpec(want.model))) throw new ReportRefused(`the loop record's ${name} was served by a model other than the cast's`);
      if (!sameSettings(got.settings, want.settings)) throw new ReportRefused(`the loop record's ${name} used settings other than the cast's`);
    }
  }
  const p = loop.process;
  const processLine = p == null ? "process: not recorded" : `process version ${p.version}, commit ${p.commit === null ? "unknown" : p.commit.slice(0, 12)}, ${p.dirty === null ? "tree unknown" : p.dirty ? "tree had changes" : "tree clean"}`;
  const models = [...new Set(loop.recordedRuns.flatMap((r) => r.models.map(canonicalSpec)))].join("+") || "unknown";
  const n = loop.recordedRuns.length;
  const svc = loop.distiller?.service;
  return [
    "Skill made by (from the loop record named in review.json)",
    `- ${processLine}`,
    `- teacher: ${models} (${settingsText(loop.recordedRuns[0]?.settings)}); ${n} run${n === 1 ? "" : "s"}, recording ${loop.recordingFormat ?? "none"}`,
    `- critic: ${roleText({ model: loop.roles.critic.requested, settings: loop.roles.critic.settings })}; reviser: ${roleText({ model: loop.roles.reviser.requested, settings: loop.roles.reviser.settings })}`,
    svc === undefined || svc === null ? "- distiller service: none recorded" : "unknown" in svc ? `- distiller service: ${svc.name}, version unknown (${svc.unknown})` : `- distiller service: ${svc.name} ${svc.version}, released ${svc.released}, commit ${svc.commit}, ${svc.environment}`,
  ];
}

const reviewSchema = z.object({ verdict: z.enum(["accept", "revise", "reject"]), skillSha256: z.string(), /** The loop record that made the skill: a path, repository-relative or absolute. */ loop: z.string().optional() });

/** What a run's score.json must hold. Parsed, not cast: a string "false" would otherwise count as a success. */
const scoreSchema = z.object({
  costUsd: z.number().nullable(),
  /** Where the cost came from; absent in a run from before sources were recorded. */
  costSource: z.enum(["provider", "pin", "market-quote"]).nullable().optional(),
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
  /** Runs with no cost figure; a row's cost is the priced runs only. */
  unpriced: number;
  /** Where the priced runs' costs came from, for runs that say. */
  sources: Set<string>;
  priced: number;
  tokens: [number, number, number, number];
  skillRuns: number;
  loaded: number[];
  skilled: boolean;
}

const STAGES = ["calibration", "T0", "S0", "S1", "S2"];
/** How a cost's source is said in the report. A quote is a marketplace price, and is never called a charge. */
const SOURCE_LABEL: Record<string, string> = { provider: "provider-reported", pin: "pin", "market-quote": "market quote" };
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
  const cast = castOf(summary);

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
  let loopPath: string | undefined;
  if (skillArmUsed) {
    const review = reviewSchema.safeParse(readJson(join(input.experiment, "review.json"), "review record (review.json)"));
    if (!review.success) throw new ReportRefused("review.json needs a verdict (accept, revise or reject) and skillSha256");
    // Only a skill that cleared review may reach a student arm.
    if (review.data.verdict !== "accept") throw new ReportRefused(`the skill's review verdict is ${review.data.verdict}; only an accepted skill reaches the student arms, so there are no skill-arm results to report`);
    reviewSha = review.data.skillSha256;
    loopPath = review.data.loop;
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
    const declaredModel = arm === undefined ? undefined : cast[arm.model as "teacher" | "student"]?.model;
    // Declared and recorded names are compared in canonical form, so a bare Claude id in an old summary or run still matches.
    const expectedModel = declaredModel === undefined ? undefined : canonicalSpec(declaredModel);
    if (arm !== undefined && expectedModel === undefined) throw new ReportRefused(`arm ${arm.label} names model "${arm.model}", which the summary's cast does not define`);
    const rowFor = (model: string, fit: string): Row => {
      const key = [stage, model, fit, goal].join("\u0000");
      let row = rows.get(key);
      if (row === undefined) {
        row = { order: STAGES.indexOf(stage), stage, model, fit, goal, role, trials: 0, planned, reached: 0, extras: [], cost: 0, unpriced: 0, sources: new Set(), priced: 0, tokens: [0, 0, 0, 0], skillRuns: 0, loaded: [], skilled: arm?.skill === true };
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
      const model = s.model.resolved.length > 0 ? s.model.resolved.map(canonicalSpec).join("+") : "unknown";
      if (expectedModel !== undefined && model !== expectedModel) throw new ReportRefused(`${name}/${rd} ran model ${model}, but arm ${arm?.label} declares ${expectedModel}`);
      const fit = s.priorFit ?? "undeclared";
      const row = rowFor(model, fit);
      row.trials += 1;
      if (s.score.reached) {
        row.reached += 1;
        if (s.score.extraCalls !== null) row.extras.push(s.score.extraCalls);
      }
      if (s.costUsd === null) row.unpriced += 1;
      else {
        row.cost += s.costUsd;
        row.priced += 1;
        if (typeof s.costSource === "string") row.sources.add(s.costSource);
      }
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
      const r = sorted.find((x) => x.stage === "calibration" && x.model === canonicalSpec(cast.student.model) && x.fit === summary.priorFit && x.goal === goal);
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
    ...castLines(cast),
    ...(loopPath === undefined ? [] : ["", ...skillMadeBy(loopPath, reviewSha as string, cast)]),
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
      `| ${r.stage} | ${r.model} | ${r.fit} | ${goalCell(r)} | ${r.reached}/${r.trials} | [${pct2(lo)}, ${pct2(hi)}] | ${extras} | ${r.priced === 0 ? "-" : `$${r.cost.toFixed(2)}`} (${r.unpriced} unpriced)${r.priced > 0 && r.sources.size > 0 ? ` [${[...r.sources].sort().map((x) => SOURCE_LABEL[x] ?? x).join(", ")}]` : ""} | ${ti} in / ${to} out / ${tc} cache read / ${tw} cache write | ${skill} | ${flags} |`,
    );
  }

  // Costs from more than one source are not one comparable figure, and a quote is not a record of what any host charged.
  const sources = [...new Set(sorted.flatMap((r) => [...r.sources]))].sort();
  if (sources.length > 1) lines.push("", `Costs in this report come from more than one source (${sources.map((x) => SOURCE_LABEL[x] ?? x).join(", ")}) and are not one comparable figure.`);
  if (sources.includes("market-quote")) lines.push("", "A market quote is a marketplace price read from OpenRouter's public model list: an estimate of a model's market rate, and not a record of any host's rate.");

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
