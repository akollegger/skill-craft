// An experiment's prompt set, checked by the commands before any spend (spec 008, FR-004, SC-002, SC-009).
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAgentCli } from "../src/harness/cli.js";
import { readExperimentSet } from "../src/prompts/set.js";
import { fakePlayer } from "./helpers/fake-player.js";

const GOAL = { item: "c", qty: 1 };
const WORLD = "test/fixtures/valid/mirror-pair.json";
const SKILL = "spikes/skill-pilot/craft-glirol";

const experiment = (summary: Record<string, unknown> | undefined): string => {
  const dir = mkdtempSync(join(tmpdir(), "skill-craft-exp-"));
  if (summary !== undefined) writeFileSync(join(dir, "summary.json"), JSON.stringify(summary));
  return dir;
};

describe("readExperimentSet", () => {
  it("reads the set, returns none for an experiment that pins nothing, and refuses a missing or invalid one", () => {
    expect(readExperimentSet(experiment({ promptSet: { base: "2", callBudget: 100 } }))).toEqual({ base: "2", callBudget: 100 });
    expect(readExperimentSet(experiment({ experiment: "x" }))).toBeUndefined();
    expect(() => readExperimentSet(experiment(undefined))).toThrow(/summary/);
    expect(() => readExperimentSet(experiment({ promptSet: { armSentence: "1" } }))).toThrow(/prompt set/);
  });
});

describe("run-agent --experiment", () => {
  const harness = () => {
    const out: string[] = [];
    const err: string[] = [];
    const dir = mkdtempSync(join(tmpdir(), "skill-craft-exp-cli-"));
    const run = (argv: string[]) => runAgentCli(["--world", WORLD, "--out", dir, "--goal", "c", ...argv], { driver: fakePlayer({ mode: "solve", goal: GOAL }), pricing: async () => undefined, out: (s) => out.push(s), err: (s) => err.push(s) });
    return { run, out, err, dir };
  };
  it("refuses an arm whose base prompt version differs, before any run folder exists", async () => {
    const h = harness();
    const exp = experiment({ promptSet: { base: "2", callBudget: 100 } });
    expect(await h.run(["--label", "a", "--experiment", exp, "--prompt-version", "1"])).toBe(1);
    expect(h.err.join("\n")).toMatch(/base prompt version 1 differs from the experiment's 2/);
    expect(existsSync(join(h.dir, "a"))).toBe(false);
  });

  it("refuses a different call budget", async () => {
    const h = harness();
    expect(await h.run(["--label", "a", "--experiment", experiment({ promptSet: { base: "2", callBudget: 100 } }), "--prompt-version", "2", "--call-budget", "50"])).toBe(1);
    expect(h.err.join("\n")).toMatch(/call budget 50 differs from the experiment's 100/);
  });

  it("runs when everything matches, and checks nothing for a kind the set does not pin", async () => {
    const h = harness();
    expect(await h.run(["--label", "a", "--experiment", experiment({ promptSet: { base: "1" } }), "--arm-sentence", "1"])).toBe(0);
    expect(existsSync(join(h.dir, "a", "001", "score.json"))).toBe(true);
  });

  it("checks the skill tool and the arm sentence only when the arm uses them", async () => {
    const h = harness();
    const exp = experiment({ promptSet: { base: "1", skillTool: "1", armSentence: "1" } });
    expect(await h.run(["--label", "a", "--experiment", exp])).toBe(0); // neither used
    expect(await h.run(["--label", "b", "--experiment", exp, "--skill", SKILL, "--arm-sentence", "1"])).toBe(0);
  });

  it("applies to a dry run too, and refuses an experiment folder that has no summary", async () => {
    const h = harness();
    expect(await h.run(["--label", "a", "--experiment", experiment({ promptSet: { base: "2", callBudget: 100 } }), "--dry-run"])).toBe(1);
    expect(await h.run(["--label", "b", "--experiment", experiment(undefined), "--dry-run"])).toBe(1);
    expect(h.err.join("\n")).toMatch(/summary/);
  });
});
