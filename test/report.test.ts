import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
  loadedAfter?: number | null; // undefined: no skill installed; null: installed, never loaded
  sha?: string;
  note?: string;
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
    goals: { learn: ["wooden"], heldOut: "iron" },
    arms: [
      { label: "T0", model: "teacher", recorded: true },
      { label: "S0", model: "student", recorded: false },
      { label: "S1", model: "student", recorded: false, skill: true },
      { label: "S2", model: "student", recorded: false, skill: true, promptNote: NOTE },
    ],
    trials: { calibration: 5, teacherPerLearnGoal: 3, armHeldOut: 10, armPerLearnGoal: 3 },
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
          costUsd: r.cost ?? 0.1,
          text: SECRET,
          priorFit: fit,
          ...(r.note ? { promptNote: r.note } : {}),
          score: { goal: { item: goal, qty: 1 }, reached: r.reached, callsToGoal: 10, extraCalls: r.reached ? (r.extra ?? 0) : null, refusals: {} },
          measured: { trace: "matched", total: { durationMs: 1000, inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheCreationTokens: 40, costUsd: r.cost ?? 0.1 } },
          model: { requested: null, resolved: [model] },
          ...(r.loadedAfter === undefined ? {} : { skill: { name: "s", sha256: r.sha ?? SHA, invoked: r.loadedAfter !== null, loadedAfterCalls: r.loadedAfter } }),
        }),
      );
    });
    (summary.labels as Record<string, unknown>)[name] = tag;
    labels.push(dir);
  };
  const write = () => {
    writeFileSync(join(exp, "summary.json"), JSON.stringify(summary));
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
    const f = fixture();
    f.addLabel("s0", { arm: "S0" }, "iron", STUDENT, "faithful", wins(2, 7)); // 10 planned on the held-out goal
    f.addLabel("s0w", { arm: "S0" }, "wooden", STUDENT, "faithful", wins(3, 3)); // 3 planned: complete
    const md = buildReport({ experiment: f.write(), labels: f.labels });
    expect(md.split("\n").find((l) => l.includes("held-out iron"))).toMatch(/2\/7.*short/);
    expect(md.split("\n").find((l) => l.includes("learn wooden"))).not.toContain("short");
  });

  it("shows, for skill arms, the share that loaded the skill and the median call count at load", () => {
    const f = fixture();
    f.addLabel("s1", { arm: "S1" }, "iron", STUDENT, "faithful", [
      { reached: true, loadedAfter: 2 }, { reached: true, loadedAfter: 6 }, { reached: false, loadedAfter: null }, { reached: true, loadedAfter: 10 },
    ]);
    f.addLabel("s0", { arm: "S0" }, "iron", STUDENT, "faithful", wins(1, 4));
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
