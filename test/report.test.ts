import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { composePrompt } from "../src/prompts/compose.js";
import { buildReport, reportCli, ReportRefused, wilson } from "../src/harness/report.js";

const SECRET = "AGENT-TEXT-THAT-MUST-NOT-APPEAR";
const NOTE = "A skill for this kind of task is available; load it before exploring.";
const SHA = "a".repeat(64);
const TEACHER = "teacher-model";
const STUDENT = "student-model";

interface RunSpec {
  reached: boolean;
  extra?: number;
  cost?: number;
  unpriced?: boolean; // the model had no price: the run's cost is null
  source?: "provider" | "pin" | "market-quote"; // where the run's cost came from; absent for a run from before sources were recorded
  loadedAfter?: number | null; // undefined: no skill installed; null: installed, never loaded
  sha?: string;
  note?: string;
  prompt?: { version: string; baseSha256: string; sha256: string; armSentence?: { version: string; sha256: string }; skillTool?: { version: string; sha256: string } }; // absent: a run from before prompts were recorded
  budget?: { kind: "steps" | "calls"; limit: number };
}

/** A synthetic experiment folder: the summary, an optional review, and label folders with scored runs. */
function fixture(summaryOver: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "skill-craft-report-"));
  const exp = join(root, "exp");
  mkdirSync(exp);
  const summary = {
    experiment: "exp",
    priorFit: "faithful",
    world: "worlds/w.json",
    counterpart: "worlds/generated/w-7.json",
    models: { teacher: TEACHER, student: STUDENT },
    route: "escalating",
    primary: "repair",
    goals: { set: ["wooden", "iron"], heldOut: ["iron"] },
    roles: { wooden: "solved", iron: "solved" } as Record<string, string> | undefined,
    arms: [
      { label: "T0", model: "teacher", recorded: true },
      { label: "S0", model: "student", recorded: false },
      { label: "S1", model: "student", recorded: false, skill: true },
      { label: "S2", model: "student", recorded: false, skill: true, promptNote: NOTE },
    ],
    trials: { calibration: 5, teacherPerRecordedGoal: 3, armGap: 10, armSolved: 3, armHeldOut: 3 },
    turnBudget: 80,
    spendLimitUsd: 60,
    manualSteps: ["generate skill", "review skill"],
    workspace: { id: null, createdBy: "experiment", retired: null },
    skill: null,
    labels: {} as Record<string, unknown>,
    ...summaryOver,
  };
  const labels: string[] = [];
  const addLabel = (name: string, tag: Record<string, unknown>, goal: string, model: string, fit: string, runs: RunSpec[]) => {
    const dir = join(root, name);
    mkdirSync(dir);
    writeFileSync(join(dir, "summary.json"), JSON.stringify({ goal: { item: goal, qty: 1 }, aggregate: { runs: runs.length } }));
    runs.forEach((r, i) => {
      const rd = join(dir, String(i + 1).padStart(3, "0"));
      mkdirSync(rd);
      writeFileSync(
        join(rd, "score.json"),
        JSON.stringify({
          ended: "stopped",
          costUsd: r.unpriced ? null : (r.cost ?? 0.1),
          ...(r.source === undefined ? {} : { costSource: r.unpriced ? null : r.source }),
          text: SECRET,
          priorFit: fit,
          ...(r.note ? { promptNote: r.note } : {}),
          ...(r.prompt === undefined ? {} : { prompt: r.prompt }),
          ...(r.budget === undefined ? {} : { budget: r.budget }),
          score: { goal: { item: goal, qty: 1 }, reached: r.reached, callsToGoal: 10, extraCalls: r.reached ? (r.extra ?? 0) : null, refusals: {} },
          measured: { trace: "matched", total: { durationMs: 1000, inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheCreationTokens: 40, costUsd: r.unpriced ? 0 : (r.cost ?? 0.1) } },
          model: { requested: null, resolved: [model] },
          ...(r.loadedAfter === undefined ? {} : { skill: { name: "s", sha256: r.sha ?? SHA, invoked: r.loadedAfter !== null, loadedAfterCalls: r.loadedAfter } }),
        }),
      );
    });
    (summary.labels as Record<string, unknown>)[name] = tag;
    labels.push(dir);
  };
  const write = () => {
    writeFileSync(join(exp, "summary.json"), JSON.stringify(summary)); // an undefined `roles` is left out
    return exp;
  };
  const review = (over: Record<string, unknown> = {}) =>
    writeFileSync(join(exp, "review.json"), JSON.stringify({ rubric: {}, verdict: "accept", reasons: "ok", skillSha256: SHA, reviewer: "human", ...over }));
  return { root, exp, labels, addLabel, write, review, summary };
}

const wins = (n: number, total: number, extra: Partial<RunSpec> = {}): RunSpec[] =>
  Array.from({ length: total }, (_, i) => ({ reached: i < n, ...extra }));

describe("wilson", () => {
  it("gives the 95% Wilson score interval", () => {
    const [lo5, hi5] = wilson(5, 5);
    expect(lo5).toBeCloseTo(0.5655, 3);
    expect(hi5).toBeCloseTo(1, 3);
    const [lo0, hi0] = wilson(0, 5);
    expect(lo0).toBeCloseTo(0, 3);
    expect(hi0).toBeCloseTo(0.4345, 3);
    const [lo7, hi7] = wilson(7, 10);
    expect(lo7).toBeCloseTo(0.3967, 3);
    expect(hi7).toBeCloseTo(0.8922, 3);
  });
});

describe("buildReport", () => {
  it("has one row per arm, model, world and goal, with successes, intervals, extra calls and cost", () => {
    const f = fixture();
    f.addLabel("cal-faithful", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(2, 5, { extra: 4 }));
    f.addLabel("s0-iron", { arm: "S0" }, "iron", STUDENT, "faithful", [
      { reached: true, extra: 2 }, { reached: true, extra: 4 }, { reached: true, extra: 9 }, { reached: false },
    ]);
    const md = buildReport({ experiment: f.write(), labels: f.labels });
    expect(md).toMatch(/\| S0 \| student-model \| faithful \| held-out iron \| 3\/4 \|/);
    expect(md).toMatch(/\| calibration \| student-model \| faithful \| held-out iron \| 2\/5 \|/);
    expect(md).toContain("2 / 4 / 9"); // min, median, max extra calls over the successful trials
    expect(md).toContain("$0.40"); // four runs at $0.10
    expect(md).toMatch(/\[0\.\d\d, 0\.\d\d\]/);
  });

  it("flags a row at 90% success or more as ceiling, and one below as not", () => {
    const f = fixture();
    f.addLabel("a", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(9, 10));
    f.addLabel("b", { stage: "calibration" }, "wooden", STUDENT, "faithful", wins(8, 10));
    const rows = buildReport({ experiment: f.write(), labels: f.labels }).split("\n").filter((l) => l.startsWith("| calibration"));
    expect(rows.find((l) => l.includes("iron"))).toContain("ceiling");
    expect(rows.find((l) => l.includes("wooden"))).not.toContain("ceiling");
  });

  it("calls a difference supported only when the intervals do not overlap", () => {
    const f = fixture();
    f.addLabel("fa", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(5, 5));
    f.addLabel("in", { stage: "calibration" }, "iron", STUDENT, "invented", wins(0, 5));
    f.addLabel("fa2", { stage: "calibration" }, "wooden", STUDENT, "faithful", wins(4, 5));
    f.addLabel("in2", { stage: "calibration" }, "wooden", STUDENT, "invented", wins(3, 5));
    const md = buildReport({ experiment: f.write(), labels: f.labels });
    expect(md).toMatch(/faithful against invented.*iron.*5\/5.*0\/5.*supported/s);
    expect(md).toMatch(/wooden.*4\/5.*3\/5.*within noise/s);
  });

  it("shows a combination with fewer trials than planned as short, with its actual count", () => {
    const f = fixture({ goals: { set: ["wooden", "stone", "iron"], heldOut: ["iron"] }, roles: { wooden: "solved", stone: "gap", iron: "solved" } });
    f.addLabel("s0", { arm: "S0" }, "stone", STUDENT, "faithful", wins(2, 7)); // 10 planned on a gap goal
    f.addLabel("s0w", { arm: "S0" }, "wooden", STUDENT, "faithful", wins(3, 3)); // 3 planned on a solved goal: complete
    const md = buildReport({ experiment: f.write(), labels: f.labels });
    expect(md.split("\n").find((l) => l.includes("gap stone"))).toMatch(/2\/7.*short/);
    expect(md.split("\n").find((l) => l.includes("solved wooden"))).not.toContain("short");
  });

  it("keeps a planned arm with no runs visible, as 0 trials and short", () => {
    const f = fixture();
    f.addLabel("s0-empty", { arm: "S0" }, "iron", STUDENT, "faithful", []);
    const md = buildReport({ experiment: f.write(), labels: f.labels });
    const row = md.split("\n").find((l) => l.startsWith("| S0"));
    expect(row).toContain("| held-out iron | 0/0 |");
    expect(row).toContain("short");
  });

  it("shows, for skill arms, the share that loaded the skill and the median call count at load", () => {
    const f = fixture({ goals: { set: ["stone", "iron"], heldOut: ["iron"] }, roles: { stone: "gap", iron: "solved" } });
    f.addLabel("s1", { arm: "S1" }, "stone", STUDENT, "faithful", [
      { reached: true, loadedAfter: 2 }, { reached: true, loadedAfter: 6 }, { reached: false, loadedAfter: null }, { reached: true, loadedAfter: 10 },
    ]);
    f.addLabel("s0", { arm: "S0" }, "stone", STUDENT, "faithful", wins(1, 4));
    f.review();
    const md = buildReport({ experiment: f.write(), labels: f.labels });
    expect(md.split("\n").find((l) => l.startsWith("| S1"))).toContain("3/4 loaded, median 6");
    expect(md).toMatch(/S1 against S0/);
  });

  it("lists the steps done by hand last", () => {
    const f = fixture();
    f.addLabel("s0", { arm: "S0" }, "iron", STUDENT, "faithful", wins(1, 2));
    const lines = buildReport({ experiment: f.write(), labels: f.labels }).trimEnd().split("\n");
    expect(lines.slice(-3)).toEqual(["Steps done by hand", "- generate skill", "- review skill"]);
  });

  it("is deterministic and holds no agent text", () => {
    const f = fixture();
    f.addLabel("s0", { arm: "S0" }, "iron", STUDENT, "faithful", wins(1, 2));
    f.addLabel("t0", { arm: "T0" }, "wooden", TEACHER, "faithful", wins(2, 3));
    const input = { experiment: f.write(), labels: [...f.labels] };
    const a = buildReport(input);
    expect(buildReport({ experiment: input.experiment, labels: [...f.labels].reverse() })).toBe(a);
    expect(a).not.toContain(SECRET);
  });
});

describe("pinned settings in the experiment summary", () => {
  it("are accepted for each model, in either name form, and a summary without them is read as none", () => {
    const withSettings = fixture({ models: { teacher: "claude-sonnet-5-5", student: "claude-haiku-4-5-20251001", settings: { "anthropic/claude-sonnet-5-5": { thinking: "adaptive", effort: "high" }, "claude-haiku-4-5-20251001": { thinking: "off", temperature: 0 } } } });
    withSettings.addLabel("cal", { stage: "calibration" }, "iron", "anthropic/claude-haiku-4-5-20251001", "faithful", wins(1, 2));
    expect(() => buildReport({ experiment: withSettings.write(), labels: withSettings.labels })).not.toThrow();
    const without = fixture();
    without.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(1, 2));
    expect(() => buildReport({ experiment: without.write(), labels: without.labels })).not.toThrow();
  });

  it("accept a thinking budget as a number", () => {
    const f = fixture({ models: { teacher: TEACHER, student: STUDENT, settings: { [STUDENT]: { thinking: 31999 } } } });
    f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(1, 2));
    expect(() => buildReport({ experiment: f.write(), labels: f.labels })).not.toThrow();
  });

  it("are refused when a setting is misspelt or its value is not allowed", () => {
    for (const bad of [{ topK: 3 }, { effort: "enormous" }, { temperature: "hot" }, { thinking: "sometimes" }]) {
      const f = fixture({ models: { teacher: TEACHER, student: STUDENT, settings: { [STUDENT]: bad } } });
      f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(1, 2));
      expect(() => buildReport({ experiment: f.write(), labels: f.labels })).toThrow(ReportRefused);
    }
  });
});

describe("cost and unpriced runs in the report", () => {
  const rowOf = (md: string, stage: string) => md.split("\n").find((l) => l.startsWith(`| ${stage} |`)) as string;

  it("states the unpriced count beside every cost", () => {
    const f = fixture();
    f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(2, 4));
    expect(rowOf(buildReport({ experiment: f.write(), labels: f.labels }), "calibration")).toContain("$0.40 (0 unpriced)");
  });

  it("totals the priced runs only and counts the rest", () => {
    const f = fixture();
    f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", [{ reached: true }, { reached: false }, { reached: false, unpriced: true }, { reached: true, unpriced: true }]);
    expect(rowOf(buildReport({ experiment: f.write(), labels: f.labels }), "calibration")).toContain("$0.20 (2 unpriced)");
  });

  it("prints a dash for a row whose runs were all unpriced, never $0.00", () => {
    const f = fixture();
    f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(1, 3, { unpriced: true }));
    const row = rowOf(buildReport({ experiment: f.write(), labels: f.labels }), "calibration");
    expect(row).toContain("- (3 unpriced)");
    expect(row).not.toContain("$0.00");
  });
});

describe("model names in old and new records", () => {
  const HAIKU = "claude-haiku-4-5-20251001";
  const named = () => fixture({ models: { teacher: "claude-sonnet-5-5", student: HAIKU } });

  it("groups runs recorded with the bare id and runs recorded in canonical form into one row", () => {
    const f = named();
    f.addLabel("cal-old", { stage: "calibration" }, "iron", HAIKU, "faithful", wins(1, 2));
    f.addLabel("cal-new", { stage: "calibration" }, "iron", `anthropic/${HAIKU}`, "faithful", wins(2, 3));
    const md = buildReport({ experiment: f.write(), labels: f.labels });
    const rows = md.split("\n").filter((l) => /^\| calibration \|/.test(l));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain(`anthropic/${HAIKU}`);
    expect(rows[0]).toMatch(/\| 3\/5 \|/);
  });

  it("proposes each goal's role from the student's calibration trials when the summary declares the bare id and the runs recorded the canonical one", () => {
    const f = fixture({ models: { teacher: "claude-sonnet-5-5", student: HAIKU }, goals: { set: ["iron"], heldOut: [] }, roles: undefined });
    f.addLabel("cal", { stage: "calibration" }, "iron", `anthropic/${HAIKU}`, "faithful", wins(0, 5));
    const md = buildReport({ experiment: f.write(), labels: f.labels });
    expect(md).not.toContain("no student trials");
    expect(md).toMatch(/- iron: gap/);
  });

  it("accepts an arm whose summary declares the bare id and whose runs recorded the canonical one", () => {
    const f = named();
    f.addLabel("s0", { arm: "S0" }, "iron", `anthropic/${HAIKU}`, "faithful", wins(2, 3));
    expect(() => buildReport({ experiment: f.write(), labels: f.labels })).not.toThrow();
  });

  it("still refuses a run that resolved a different model from the one its arm declares", () => {
    const f = named();
    f.addLabel("s0", { arm: "S0" }, "iron", "anthropic/claude-sonnet-5-5", "faithful", wins(1, 1));
    expect(() => buildReport({ experiment: f.write(), labels: f.labels })).toThrow(ReportRefused);
  });
});

describe("the staged protocol in the report", () => {
  const staged = () => fixture({ goals: { set: ["wooden", "stone", "iron"], heldOut: ["iron"] }, roles: { wooden: "solved", stone: "gap", iron: "solved" } });
  const section = (md: string, heading: string): string => {
    const start = md.indexOf(heading);
    expect(start, heading).toBeGreaterThanOrEqual(0);
    const rest = md.slice(start + heading.length);
    const next = rest.search(/\n(Repair|No harm|Transfer|Steps done by hand)/);
    return next < 0 ? rest : rest.slice(0, next);
  };

  it("names the route and the primary measure, and says they were declared after calibration", () => {
    const f = staged();
    f.addLabel("s0", { arm: "S0" }, "stone", STUDENT, "faithful", wins(0, 10));
    const md = buildReport({ experiment: f.write(), labels: f.labels });
    expect(md).toMatch(/Route: escalating; primary measure: repair\./);
    expect(md).toMatch(/declared after calibration/);
  });

  it("keeps repair, no harm and transfer apart, each on its own kind of goal", () => {
    const f = staged();
    f.addLabel("s0-stone", { arm: "S0" }, "stone", STUDENT, "faithful", wins(0, 10));
    f.addLabel("s1-stone", { arm: "S1" }, "stone", STUDENT, "faithful", Array.from({ length: 10 }, (_, i) => ({ reached: i < 9, loadedAfter: 3 })));
    f.addLabel("s0-wooden", { arm: "S0" }, "wooden", STUDENT, "faithful", wins(3, 3));
    f.addLabel("s1-wooden", { arm: "S1" }, "wooden", STUDENT, "faithful", wins(3, 3, { loadedAfter: 2 }));
    f.addLabel("s0-iron", { arm: "S0" }, "iron", STUDENT, "faithful", wins(0, 3));
    f.addLabel("s1-iron", { arm: "S1" }, "iron", STUDENT, "faithful", wins(3, 3, { loadedAfter: 2 }));
    f.review();
    const md = buildReport({ experiment: f.write(), labels: f.labels });
    expect(section(md, "Repair (gap goals)")).toMatch(/S1 against S0, student-model, faithful, gap stone: S1 9\/10, S0 0\/10: supported/);
    expect(section(md, "Repair (gap goals)")).not.toContain("wooden");
    expect(section(md, "No harm (solved goals)")).toMatch(/S1 against S0, student-model, faithful, solved wooden: S1 3\/3, S0 3\/3: within noise/);
    expect(section(md, "Transfer (held-out goals)")).toMatch(/held-out iron: S1 3\/3, S0 0\/3/);
  });

  it("labels repair as not yet distinguished from memory", () => {
    const f = staged();
    f.addLabel("s0", { arm: "S0" }, "stone", STUDENT, "faithful", wins(0, 10));
    expect(section(buildReport({ experiment: f.write(), labels: f.labels }), "Repair (gap goals)")).toMatch(/not yet distinguished from a memory of the solution/);
  });

  it("calls transfer unmeasurable when the held-out goal is solved without help", () => {
    const f = staged();
    f.addLabel("s0-iron", { arm: "S0" }, "iron", STUDENT, "faithful", wins(3, 3));
    f.addLabel("s1-iron", { arm: "S1" }, "iron", STUDENT, "faithful", wins(3, 3, { loadedAfter: 1 }));
    f.review();
    const md = buildReport({ experiment: f.write(), labels: f.labels });
    expect(section(md, "Transfer (held-out goals)")).toMatch(/unmeasurable: the held-out goal is solved without help/);
    expect(section(md, "Transfer (held-out goals)")).not.toContain("S1 against S0");
  });

  it("labels each row with its goal's role", () => {
    const f = staged();
    f.addLabel("a", { arm: "S0" }, "stone", STUDENT, "faithful", wins(0, 10));
    f.addLabel("b", { arm: "S0" }, "wooden", STUDENT, "faithful", wins(3, 3));
    f.addLabel("c", { arm: "S0" }, "iron", STUDENT, "faithful", wins(3, 3));
    const md = buildReport({ experiment: f.write(), labels: f.labels });
    for (const cell of ["gap stone", "solved wooden", "held-out iron"]) expect(md, cell).toContain(`| ${cell} |`);
  });
});

describe("role proposals before the roles are written", () => {
  it("print the role the rule gives each goal from the student's calibration rows, and nothing else", () => {
    const f = fixture({ goals: { set: ["stone", "wooden", "iron", "slate"], heldOut: ["iron"] }, roles: undefined });
    f.addLabel("c-stone", { stage: "calibration" }, "stone", STUDENT, "faithful", wins(0, 5));
    f.addLabel("c-wooden", { stage: "calibration" }, "wooden", STUDENT, "faithful", wins(4, 5));
    f.addLabel("c-iron", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(5, 5));
    f.addLabel("c-slate", { stage: "calibration" }, "slate", STUDENT, "faithful", wins(2, 5));
    f.addLabel("t-stone", { stage: "calibration" }, "stone", TEACHER, "faithful", wins(5, 5)); // the teacher's rows do not decide roles
    f.addLabel("i-stone", { stage: "calibration" }, "stone", STUDENT, "invented", wins(0, 5)); // nor do other worlds'
    const md = buildReport({ experiment: f.write(), labels: f.labels });
    expect(md).toContain("- stone: gap (0/5)");
    expect(md).toContain("- wooden: solved (4/5)");
    expect(md).toContain("- iron: solved (5/5)");
    expect(md).toContain("- slate: ambiguous (2/5)");
    expect(md).not.toContain("| Arm |");
  });

  it("say so when a goal has no student trials", () => {
    const f = fixture({ roles: undefined });
    f.addLabel("c-iron", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(5, 5));
    expect(buildReport({ experiment: f.write(), labels: f.labels })).toContain("- wooden: no student trials");
  });
});

describe("the invented counterpart's goal names", () => {
  it("are compared under the faithful goal they stand for", () => {
    const f = fixture({ counterpartGoals: { plaevratael: "iron", zibael: "wooden" } });
    f.addLabel("cal-f", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(5, 5));
    f.addLabel("cal-i", { stage: "calibration" }, "plaevratael", STUDENT, "invented", wins(0, 5));
    const md = buildReport({ experiment: f.write(), labels: f.labels });
    expect(md).toContain("| calibration | student-model | invented | held-out iron | 0/5 |");
    expect(md).toMatch(/faithful against invented, student-model, held-out iron: faithful 5\/5, invented 0\/5: supported/);
    expect(md).not.toContain("plaevratael");
  });
});

describe("what the report refuses", () => {
  const refused = (fn: () => unknown, pattern: RegExp) => {
    try {
      fn();
    } catch (e) {
      expect(e).toBeInstanceOf(ReportRefused);
      expect((e as Error).message).toMatch(pattern);
      return;
    }
    throw new Error("expected the report to refuse");
  };

  it("a missing experiment summary", () => {
    const f = fixture();
    refused(() => buildReport({ experiment: f.exp, labels: [] }), /summary/);
  });

  it("a run folder that is missing", () => {
    const f = fixture();
    refused(() => buildReport({ experiment: f.write(), labels: [join(f.root, "nope")] }), /nope/);
  });

  it("a run folder the experiment summary does not list", () => {
    const f = fixture();
    f.addLabel("s0", { arm: "S0" }, "iron", STUDENT, "faithful", wins(1, 1));
    const exp = f.write();
    const other = join(f.root, "stray");
    mkdirSync(other);
    writeFileSync(join(other, "summary.json"), "{}");
    refused(() => buildReport({ experiment: exp, labels: [...f.labels, other] }), /stray/);
  });

  it("a skill run whose fingerprint differs from the reviewed one", () => {
    const f = fixture();
    f.addLabel("s1", { arm: "S1" }, "iron", STUDENT, "faithful", [{ reached: true, loadedAfter: 1, sha: "b".repeat(64) }]);
    f.review();
    refused(() => buildReport({ experiment: f.write(), labels: f.labels }), /fingerprint|sha/i);
  });

  it("a skill arm whose review verdict is not accept", () => {
    for (const verdict of ["reject", "revise"]) {
      const f = fixture();
      f.addLabel("s1", { arm: "S1" }, "iron", STUDENT, "faithful", [{ reached: true, loadedAfter: 1 }]);
      f.review({ verdict });
      refused(() => buildReport({ experiment: f.write(), labels: f.labels }), /accept/);
    }
  });

  it("roles that leave out a goal, or a held-out goal that is not in the goal set", () => {
    const f = fixture({ roles: { wooden: "solved" } }); // iron has no role
    f.addLabel("s0", { arm: "S0" }, "iron", STUDENT, "faithful", wins(1, 1));
    refused(() => buildReport({ experiment: f.write(), labels: f.labels }), /role.*iron/i);
    const g = fixture({ goals: { set: ["wooden"], heldOut: ["iron"] } });
    g.addLabel("s0", { arm: "S0" }, "wooden", STUDENT, "faithful", wins(1, 1));
    refused(() => buildReport({ experiment: g.write(), labels: g.labels }), /held-out.*iron/i);
  });

  it("a score file with a value of the wrong type", () => {
    const f = fixture();
    f.addLabel("s0", { arm: "S0" }, "iron", STUDENT, "faithful", wins(1, 1));
    const file = join(f.labels[0]!, "001", "score.json");
    const bad = JSON.parse(readFileSync(file, "utf8"));
    bad.score.reached = "false"; // truthy, so it would count as a success
    writeFileSync(file, JSON.stringify(bad));
    refused(() => buildReport({ experiment: f.write(), labels: f.labels }), /score/i);
  });

  it("a run whose model is not the one its arm declares", () => {
    const f = fixture();
    f.addLabel("t0", { arm: "T0" }, "wooden", STUDENT, "faithful", wins(1, 1)); // T0 is the teacher
    refused(() => buildReport({ experiment: f.write(), labels: f.labels }), /model/i);
  });

  it("a skill arm whose skill is not accepted, even when the fingerprint matches", () => {
    const f = fixture();
    f.addLabel("s2", { arm: "S2" }, "iron", STUDENT, "faithful", [{ reached: true, loadedAfter: 1, note: NOTE }]);
    f.review({ verdict: "reject", skillSha256: SHA });
    refused(() => buildReport({ experiment: f.write(), labels: f.labels }), /accept/);
  });

  it("a skill arm with no review record", () => {
    const f = fixture();
    f.addLabel("s1", { arm: "S1" }, "iron", STUDENT, "faithful", [{ reached: true, loadedAfter: 1 }]);
    refused(() => buildReport({ experiment: f.write(), labels: f.labels }), /review/);
  });

  it("a prompt note that differs from its arm's", () => {
    const f = fixture();
    f.addLabel("s2", { arm: "S2" }, "iron", STUDENT, "faithful", [{ reached: true, loadedAfter: 1, note: "something else" }]);
    f.review();
    refused(() => buildReport({ experiment: f.write(), labels: f.labels }), /prompt ?note/i);
    const g = fixture();
    g.addLabel("s1", { arm: "S1" }, "iron", STUDENT, "faithful", [{ reached: true, loadedAfter: 1, note: NOTE }]);
    g.review();
    refused(() => buildReport({ experiment: g.write(), labels: g.labels }), /prompt ?note/i);
  });
});

describe("the report command", () => {
  it("prints the table and exits 0, and exits non-zero with a message when it refuses", () => {
    const f = fixture();
    f.addLabel("s0", { arm: "S0" }, "iron", STUDENT, "faithful", wins(1, 2));
    const out: string[] = [];
    const err: string[] = [];
    const deps = { out: (s: string) => out.push(s), err: (s: string) => err.push(s) };
    expect(reportCli(["--experiment", f.write(), ...f.labels], deps)).toBe(0);
    expect(out.join("\n")).toContain("| S0 |");
    expect(reportCli(["--experiment", join(f.root, "missing"), ...f.labels], deps)).toBe(1);
    expect(err.join("\n")).toMatch(/summary/);
    expect(reportCli([], deps)).toBe(1);
  });
});

describe("the cast (spec 007 FR-040 to FR-043)", () => {
  const SONNET = "claude-sonnet-5-5";
  const HAIKU = "claude-haiku-4-5-20251001";
  const cast = (over: Record<string, unknown> = {}) => ({
    teacher: { model: SONNET, settings: { thinking: "adaptive", effort: "high" } },
    student: { model: HAIKU, settings: { thinking: 31999 } },
    distiller: { service: "nams", critic: { model: SONNET, settings: { thinking: "adaptive", effort: "medium" } }, reviser: { model: SONNET, settings: {} } },
    ...over,
  });
  const withCast = (c: Record<string, unknown> = cast(), over: Record<string, unknown> = {}) => fixture({ models: undefined, cast: c, ...over });

  it("is read in place of `models`: the student's calibration trials give the role proposals and an arm's model resolves through it", () => {
    const f = withCast(cast(), { roles: undefined });
    f.addLabel("cal", { stage: "calibration" }, "iron", `anthropic/${HAIKU}`, "faithful", wins(5, 5));
    f.addLabel("cal-other", { stage: "calibration" }, "wooden", `anthropic/${SONNET}`, "faithful", wins(0, 5)); // the teacher's trials are not the student's
    expect(buildReport({ experiment: f.write(), labels: f.labels })).toContain("- iron: solved (5/5)");
    const g = withCast();
    g.addLabel("s0", { arm: "S0" }, "iron", `anthropic/${HAIKU}`, "faithful", wins(2, 3));
    expect(buildReport({ experiment: g.write(), labels: g.labels })).toContain("anthropic/claude-haiku-4-5-20251001");
  });

  it("is read the same as the older `models` form that names the same models", () => {
    const old = fixture({ models: { teacher: SONNET, student: HAIKU, settings: { [`anthropic/${SONNET}`]: { thinking: "adaptive", effort: "high" }, [`anthropic/${HAIKU}`]: { thinking: 31999 } } } });
    const now = withCast(cast({ distiller: undefined }));
    for (const f of [old, now]) f.addLabel("s0", { arm: "S0" }, "iron", `anthropic/${HAIKU}`, "faithful", wins(2, 3));
    const a = buildReport({ experiment: old.write(), labels: old.labels });
    const b = buildReport({ experiment: now.write(), labels: now.labels });
    expect(b).toBe(a);
    expect(readFileSync(join(old.exp, "summary.json"), "utf8")).toContain('"models"'); // the older file is read, never rewritten
    expect(a).toContain("- teacher: anthropic/claude-sonnet-5-5 (thinking adaptive, effort high)");
    expect(a).toContain("- student: anthropic/claude-haiku-4-5-20251001 (thinking 31999)");
  });

  it("states each role's model and settings, and the distiller's service, critic and reviser", () => {
    const f = withCast();
    f.addLabel("s0", { arm: "S0" }, "iron", `anthropic/${HAIKU}`, "faithful", wins(2, 3));
    const text = buildReport({ experiment: f.write(), labels: f.labels });
    expect(text).toContain("- teacher: anthropic/claude-sonnet-5-5 (thinking adaptive, effort high)");
    expect(text).toContain("- student: anthropic/claude-haiku-4-5-20251001 (thinking 31999)");
    expect(text).toContain("- distiller: nams; critic anthropic/claude-sonnet-5-5 (thinking adaptive, effort medium); reviser anthropic/claude-sonnet-5-5 (unset)");
  });

  it("lets one model fill every role with different settings, keeps the settings apart and says the roles share it", () => {
    const f = withCast({
      teacher: { model: HAIKU, settings: { thinking: 31999 } },
      student: { model: HAIKU, settings: { thinking: 2048 } },
      distiller: { service: "nams", critic: { model: HAIKU, settings: {} }, reviser: { model: HAIKU, settings: { temperature: 1 } } },
    });
    f.addLabel("s0", { arm: "S0" }, "iron", `anthropic/${HAIKU}`, "faithful", wins(2, 3));
    const text = buildReport({ experiment: f.write(), labels: f.labels });
    expect(text).toContain("- teacher: anthropic/claude-haiku-4-5-20251001 (thinking 31999)");
    expect(text).toContain("- student: anthropic/claude-haiku-4-5-20251001 (thinking 2048)");
    expect(text).toContain("- shared model: teacher, student, critic, reviser: anthropic/claude-haiku-4-5-20251001");
  });

  it("says nothing about sharing when every role has its own model", () => {
    const f = withCast(cast({ distiller: { service: "nams", critic: { model: "fireworks/gpt-oss-120b", settings: {} }, reviser: { model: "fireworks/glm-5p3", settings: {} } } }));
    f.addLabel("s0", { arm: "S0" }, "iron", `anthropic/${HAIKU}`, "faithful", wins(2, 3));
    expect(buildReport({ experiment: f.write(), labels: f.labels })).not.toContain("shared model");
  });

  it("refuses an arm whose runs used a model other than the cast's student", () => {
    const f = withCast();
    f.addLabel("s0", { arm: "S0" }, "iron", `anthropic/${SONNET}`, "faithful", wins(2, 3));
    expect(() => buildReport({ experiment: f.write(), labels: f.labels })).toThrow(ReportRefused);
  });

  it("refuses a summary that has both a cast and `models`, or neither, and a cast with a misspelt setting", () => {
    for (const over of [{ models: { teacher: TEACHER, student: STUDENT } }, { cast: undefined }, { cast: cast({ student: { model: HAIKU, settings: { topK: 3 } } }) }]) {
      const f = withCast(cast(), over);
      f.addLabel("cal", { stage: "calibration" }, "iron", `anthropic/${HAIKU}`, "faithful", wins(1, 2));
      expect(() => buildReport({ experiment: f.write(), labels: f.labels })).toThrow(ReportRefused);
    }
  });

  describe("and the loop record named by review.json", () => {
    const sha = "c".repeat(64);
    const loopRecord = (over: Record<string, unknown> = {}) => ({
      label: "loop-1",
      process: { version: "2", commit: "0123456789abcdef0123456789abcdef01234567", dirty: false, changesSha256: null },
      recordedRuns: [{ label: "001", run: "runs/t0/001", runLogSha256: "1".repeat(64), scoreSha256: "2".repeat(64), models: [`anthropic/${SONNET}`], settings: { temperature: null, effort: "high", thinking: "adaptive" } }],
      recordingFormat: "conversation",
      roles: {
        critic: { requested: SONNET, resolved: [`anthropic/${SONNET}`], settings: { temperature: null, effort: "medium", thinking: "adaptive" } },
        reviser: { requested: SONNET, resolved: [`anthropic/${SONNET}`], settings: null },
      },
      distiller: { service: { name: "nams", version: "1.3.0", released: "2026-10-12", commit: "27263eb242308738644e4fbaa817d3f8fbd31574", environment: "production" } },
      finalSkillSha256: sha,
      outcome: "accept",
      ...over,
    });
    const skillArm = (loop: Record<string, unknown> | undefined, reviewOver: Record<string, unknown> = {}, c = cast()) => {
      const f = withCast(c);
      f.addLabel("s1", { arm: "S1" }, "iron", `anthropic/${HAIKU}`, "faithful", wins(2, 3, { loadedAfter: 2, sha }));
      f.write();
      const path = join(f.root, "loop.json");
      if (loop !== undefined) writeFileSync(path, JSON.stringify(loop));
      f.review({ skillSha256: sha, ...(loop === undefined ? {} : { loop: path }), ...reviewOver });
      return f;
    };

    it("holds the loop's review rubric to the pinned version (spec 008)", () => {
      const A = "a".repeat(64);
      const arm = (rubric: unknown, pinned: string | undefined) => {
        const f = withCast(cast());
        (f.summary as Record<string, unknown>).promptSet = { base: "1", ...(pinned === undefined ? {} : { reviewRubric: pinned }) };
        f.addLabel("s1", { arm: "S1" }, "iron", `anthropic/${HAIKU}`, "faithful", wins(2, 3, { loadedAfter: 2, sha, prompt: { version: "1", baseSha256: A, sha256: A } }));
        f.write();
        const path = join(f.root, "loop.json");
        writeFileSync(path, JSON.stringify(loopRecord(rubric === undefined ? {} : { rubric })));
        f.review({ skillSha256: sha, loop: path });
        return f;
      };
      const read = (f: ReturnType<typeof arm>) => buildReport({ experiment: f.exp, labels: f.labels });
      expect(read(arm({ version: "1", sha256: A, kindVersion: "1" }, "1"))).toContain("Skill made by");
      expect(() => read(arm({ version: "1", sha256: A, kindVersion: "2" }, "1"))).toThrow(/review rubric version 2 differs from the experiment's 1/);
      expect(() => read(arm(undefined, "1"))).toThrow(/names no review rubric version/);
      expect(read(arm({ version: "1", sha256: A, kindVersion: "2" }, undefined))).toContain("Skill made by"); // not pinned, not checked
    });

    it("prints who made the skill: the process and commit, the teacher, the critic and reviser, and the service's version and commit", () => {
      const f = skillArm(loopRecord());
      const text = buildReport({ experiment: f.exp, labels: f.labels });
      expect(text).toContain("Skill made by");
      expect(text).toContain("process version 2, commit 0123456789ab, tree clean");
      expect(text).toContain("teacher: anthropic/claude-sonnet-5-5 (thinking adaptive, effort high); 1 run, recording conversation");
      expect(text).toContain("critic: anthropic/claude-sonnet-5-5 (thinking adaptive, effort medium); reviser: anthropic/claude-sonnet-5-5 (unset)");
      expect(text).toContain("distiller service: nams 1.3.0, released 2026-10-12, commit 27263eb242308738644e4fbaa817d3f8fbd31574, production");
    });

    it("says so when the service's version was not known, with the code the record gave", () => {
      const f = skillArm(loopRecord({ distiller: { service: { name: "nams", unknown: "version_unavailable" } } }));
      expect(buildReport({ experiment: f.exp, labels: f.labels })).toContain("distiller service: nams, version unknown (version_unavailable)");
    });

    it("says so when the loop was given a candidate and no service made it", () => {
      const f = skillArm(loopRecord({ distiller: null }));
      expect(buildReport({ experiment: f.exp, labels: f.labels })).toContain("distiller service: none recorded");
    });

    it("prints nothing about the loop when review.json names none", () => {
      const f = skillArm(undefined);
      const text = buildReport({ experiment: f.exp, labels: f.labels });
      expect(text).not.toContain("Skill made by");
      expect(text).toContain("- teacher:"); // the cast is still stated
    });

    it("refuses a loop record whose final skill is not the reviewed one, or that never produced one", () => {
      for (const over of [{ finalSkillSha256: "d".repeat(64) }, { finalSkillSha256: null }]) {
        const f = skillArm(loopRecord(over));
        expect(() => buildReport({ experiment: f.exp, labels: f.labels })).toThrow(ReportRefused);
      }
    });

    it("refuses a loop record that contradicts the cast: another teacher, critic or reviser, or other settings", () => {
      const contradictions: Record<string, unknown>[] = [
        { recordedRuns: [{ ...loopRecord().recordedRuns[0], models: ["fireworks/gpt-oss-120b"] }] },
        { recordedRuns: [{ ...loopRecord().recordedRuns[0], settings: { temperature: null, effort: "low", thinking: "adaptive" } }] },
        { roles: { ...loopRecord().roles, critic: { ...loopRecord().roles.critic, requested: "fireworks/glm-5p3" } } },
        { roles: { ...loopRecord().roles, reviser: { ...loopRecord().roles.reviser, settings: { temperature: 0.5, effort: null, thinking: null } } } },
      ];
      for (const over of contradictions) {
        const f = skillArm(loopRecord(over));
        expect(() => buildReport({ experiment: f.exp, labels: f.labels }), JSON.stringify(Object.keys(over))).toThrow(ReportRefused);
      }
    });

    it("refuses runs that the teacher shared with another model, since a substituted model also served them", () => {
      const f = skillArm(loopRecord({ recordedRuns: [{ ...loopRecord().recordedRuns[0], models: [`anthropic/${SONNET}`, "fireworks/gpt-oss-120b"] }] }));
      expect(() => buildReport({ experiment: f.exp, labels: f.labels })).toThrow(ReportRefused);
      const g = skillArm(loopRecord({ recordedRuns: [{ ...loopRecord().recordedRuns[0], models: [] }] }));
      expect(() => buildReport({ experiment: g.exp, labels: g.labels })).toThrow(ReportRefused); // a run that names no model cannot be checked
    });

    it("refuses a critic or reviser that a provider served with another model than the one asked for, or that names none", () => {
      for (const role of ["critic", "reviser"] as const) {
        for (const resolved of [["fireworks/gpt-oss-120b"], [`anthropic/${SONNET}`, "fireworks/gpt-oss-120b"], []]) {
          const roles = { ...loopRecord().roles, [role]: { ...loopRecord().roles[role], resolved } };
          const f = skillArm(loopRecord({ roles }));
          expect(() => buildReport({ experiment: f.exp, labels: f.labels }), `${role} ${JSON.stringify(resolved)}`).toThrow(ReportRefused);
        }
      }
    });

    it("accepts a resolved model in the bare Claude form when it is the cast's", () => {
      const roles = { ...loopRecord().roles, critic: { ...loopRecord().roles.critic, resolved: [SONNET] } };
      const f = skillArm(loopRecord({ roles }));
      expect(() => buildReport({ experiment: f.exp, labels: f.labels })).not.toThrow();
    });

    it("compares a bare Claude id in the loop record with the canonical one in the cast", () => {
      const f = skillArm(loopRecord({ recordedRuns: [{ ...loopRecord().recordedRuns[0], models: [SONNET] }] }));
      expect(() => buildReport({ experiment: f.exp, labels: f.labels })).not.toThrow();
    });

    it("refuses a loop path that does not exist or is not a loop record", () => {
      const f = skillArm(undefined, { loop: "/no/such/loop.json" });
      expect(() => buildReport({ experiment: f.exp, labels: f.labels })).toThrow(ReportRefused);
      const g = skillArm({ not: "a loop" });
      expect(() => buildReport({ experiment: g.exp, labels: g.labels })).toThrow(ReportRefused);
    });

    it("holds none of the recording's text, the loop's hashes of the runs or the commit of the changes", () => {
      const f = skillArm(loopRecord({ process: { version: "2", commit: "0123456789abcdef0123456789abcdef01234567", dirty: true, changesSha256: "e".repeat(64) } }));
      const text = buildReport({ experiment: f.exp, labels: f.labels });
      expect(text).toContain("tree had changes");
      expect(text).not.toContain("e".repeat(64));
      expect(text).not.toContain("1".repeat(64));
    });
  });
});

describe("where a cost came from, in the report (spec 007 FR-049)", () => {
  const rowOf = (md: string, stage: string) => md.split("\n").find((l) => l.startsWith(`| ${stage} |`)) as string;

  it("names the source beside a row's cost, and calls a quote a market quote", () => {
    const f = fixture();
    f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(2, 4, { source: "market-quote" }));
    f.addLabel("s0", { arm: "S0" }, "iron", STUDENT, "faithful", wins(2, 4, { source: "provider" }));
    f.addLabel("s1", { arm: "S1" }, "iron", STUDENT, "faithful", wins(2, 4, { source: "pin", loadedAfter: 2 }));
    f.review();
    const md = buildReport({ experiment: f.write(), labels: f.labels });
    expect(rowOf(md, "calibration")).toContain("$0.40 (0 unpriced) [market quote]");
    expect(rowOf(md, "S0")).toContain("[provider-reported]");
    expect(rowOf(md, "S1")).toContain("[pin]");
  });

  it("says plainly when the report's costs came from more than one source, and does not present them as one figure", () => {
    const f = fixture();
    f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(2, 4, { source: "market-quote" }));
    f.addLabel("s0", { arm: "S0" }, "iron", STUDENT, "faithful", wins(2, 4, { source: "provider" }));
    const md = buildReport({ experiment: f.write(), labels: f.labels });
    expect(md).toContain("more than one source");
    expect(md).toContain("not one comparable figure");
  });

  it("says nothing about sources when there is one, or when the runs recorded none", () => {
    const one = fixture();
    one.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(2, 4, { source: "pin" }));
    expect(buildReport({ experiment: one.write(), labels: one.labels })).not.toContain("more than one source");
    const old = fixture();
    old.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(2, 4));
    const md = buildReport({ experiment: old.write(), labels: old.labels });
    expect(md).not.toContain("more than one source");
    expect(rowOf(md, "calibration")).not.toMatch(/\[(pin|market quote|provider-reported)/); // the interval has brackets too
  });

  it("never describes a quote as a charge or a bill", () => {
    const f = fixture();
    f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(2, 4, { source: "market-quote" }));
    const md = buildReport({ experiment: f.write(), labels: f.labels }).toLowerCase();
    for (const word of ["charged", "billed", "invoice", "you paid"]) expect(md).not.toContain(word);
    expect(md).toContain("market quote");
  });

  it("gives an unpriced run no source", () => {
    const f = fixture();
    f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(1, 3, { unpriced: true, source: "pin" }));
    expect(rowOf(buildReport({ experiment: f.write(), labels: f.labels }), "calibration")).toContain("- (3 unpriced)");
  });
});

describe("the prompts a report covers (spec 008, FR-006, FR-008)", () => {
  const A = "a".repeat(64);
  const B = "b".repeat(64);
  const C = "c".repeat(64);
  const v = (version: string, base: string, full: string = base) => ({ version, baseSha256: base, sha256: full });
  const build = (setup: (f: ReturnType<typeof fixture>) => void) => {
    const f = fixture();
    setup(f);
    return buildReport({ experiment: f.write(), labels: f.labels });
  };

  it("shows a run with no prompt record as unversioned", () => {
    const md = build((f) => f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(2, 3)));
    expect(md).toContain("Prompts: 3 runs are unversioned");
  });

  it("lists the version and says nothing alarming when every arm saw the same base prompt", () => {
    const md = build((f) => f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(2, 3, { prompt: v("1", A) })));
    expect(md).toContain("Prompts: base prompt version 1 in 3 runs");
    expect(md).not.toMatch(/different base prompts/);
  });

  it("warns when arms saw different base prompts", () => {
    const md = build((f) => {
      f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(2, 3, { prompt: v("1", A) }));
      f.addLabel("s0", { arm: "S0" }, "iron", STUDENT, "faithful", wins(2, 3, { prompt: v("2", B) }));
    });
    expect(md).toContain("Warning: the runs in this report saw different base prompts");
  });

  it("only lists, without a warning, a difference that is just the arm sentence", () => {
    const md = build((f) => {
      f.addLabel("s0", { arm: "S0" }, "iron", STUDENT, "faithful", wins(2, 3, { prompt: v("1", A, A) }));
      f.addLabel("s0b", { arm: "S0" }, "wooden", STUDENT, "faithful", wins(2, 3, { prompt: v("1", A, C) }));
    });
    expect(md).not.toMatch(/different base prompts/);
    expect(md).toContain("distinct full texts");
  });

  it("does not call one prompt version on two goals two prompts (the base fingerprint leaves the goal out)", () => {
    const stool = composePrompt({ goal: { item: "wooden_stool", qty: 1 }, maxTurns: 80, version: "1" });
    const glirol = composePrompt({ goal: { item: "glirol", qty: 1 }, maxTurns: 80, version: "1" });
    const rec = (c: typeof stool) => ({ version: c.version, baseSha256: c.baseSha256, sha256: c.sha256 });
    const md = build((f) => {
      f.addLabel("s0-wooden", { arm: "S0" }, "wooden", STUDENT, "faithful", wins(2, 3, { prompt: rec(stool) }));
      f.addLabel("s0-iron", { arm: "S0" }, "iron", STUDENT, "faithful", wins(2, 3, { prompt: rec(glirol) }));
    });
    expect(md).not.toMatch(/different base prompts/);
    expect(md).toContain("distinct full texts"); // the full text differs by goal, which is listed, not warned about
  });

  it("treats identical text as one prompt however its file was named", () => {
    const md = build((f) => {
      f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(1, 2, { prompt: v("1", A) }));
      f.addLabel("s0", { arm: "S0" }, "iron", STUDENT, "faithful", wins(1, 2, { prompt: v("custom", A) }));
    });
    expect(md).not.toMatch(/different base prompts/);
  });
});

describe("a pinned prompt set (spec 008, US5)", () => {
  const A = "a".repeat(64);
  const prompt = (version: string, extra: Record<string, unknown> = {}) => ({ version, baseSha256: A, sha256: A, ...extra });
  const SET = { base: "1", armSentence: "1", skillTool: "1", reviewRubric: "1" };
  const build = (summaryOver: Record<string, unknown>, setup: (f: ReturnType<typeof fixture>) => void) => {
    const f = fixture(summaryOver);
    setup(f);
    return buildReport({ experiment: f.write(), labels: f.labels });
  };

  it("prints the set, lists the kinds the runs used that the set does not pin, and checks nothing against an unpinned experiment", () => {
    const md = build({ promptSet: { base: "1" } }, (f) => f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(1, 2, { prompt: prompt("1", { armSentence: { version: "1", sha256: A } }) })));
    expect(md).toContain("Prompt set: base prompt 1.");
    expect(md).toContain("not pinned by the experiment: arm sentence");
    const plain = build({}, (f) => f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(1, 2, { prompt: prompt("1") })));
    expect(plain).toContain("Prompt set: not pinned.");
  });

  it("refuses a run whose recorded version of a pinned kind differs, naming the kind and both versions", () => {
    expect(() => build({ promptSet: SET }, (f) => f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(1, 2, { prompt: prompt("2") })))).toThrow(/cal\/001: base prompt version 2 differs from the experiment's 1/);
    expect(() => build({ promptSet: SET }, (f) => f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(1, 2, { prompt: prompt("1", { skillTool: { version: "2", sha256: A } }) })))).toThrow(/skill tool version 2 differs/);
  });

  it("refuses a run that recorded no prompt when the experiment pins one", () => {
    expect(() => build({ promptSet: SET }, (f) => f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(1, 2)))).toThrow(/recorded no prompt/);
  });

  it("holds a call budget to the pinned one", () => {
    expect(() => build({ promptSet: { base: "2", callBudget: 100 } }, (f) => f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(1, 2, { prompt: prompt("2"), budget: { kind: "calls", limit: 50 } })))).toThrow(/call budget 50 differs/);
    const md = build({ promptSet: { base: "2", callBudget: 100 } }, (f) => f.addLabel("cal", { stage: "calibration" }, "iron", STUDENT, "faithful", wins(1, 2, { prompt: prompt("2"), budget: { kind: "calls", limit: 100 } })));
    expect(md).toContain("Prompt set: base prompt 2, call budget 100.");
  });

  it("refuses a set that is not one", () => {
    expect(() => build({ promptSet: { armSentence: "1" } }, () => {})).toThrow(/prompt set/);
  });
});
