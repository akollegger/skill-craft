// The prompt kinds besides the base prompt, as a run records and uses them (spec 008, US4).
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAgentCli } from "../src/harness/cli.js";
import type { AgentDriver, DriverOptions } from "../src/harness/driver.js";
import { PromptRefused } from "../src/harness/errors.js";
import { planExperiment, runExperiment } from "../src/harness/run.js";
import { loadVersion } from "../src/prompts/index.js";
import { fakePlayer } from "./helpers/fake-player.js";

const GOAL = { item: "c", qty: 1 };
const WORLD = "test/fixtures/valid/mirror-pair.json";
const SKILL = "spikes/skill-pilot/craft-glirol";
const options = (over: Record<string, unknown> = {}) => ({ world: WORLD, goal: GOAL, runs: 1, maxTurns: 12, out: mkdtempSync(join(tmpdir(), "skill-craft-kinds-")), label: "k", driver: fakePlayer({ mode: "solve", goal: GOAL }), ...over });
const score = (dir: string) => JSON.parse(readFileSync(join(dir, "score.json"), "utf8"));

describe("the skill tool's description", () => {
  it("is version 1 by default, handed to the driver and recorded with its fingerprint", async () => {
    const seen: (string | undefined)[] = [];
    const driver: AgentDriver = (o: DriverOptions, s) => (seen.push(o.skillToolTemplate), fakePlayer({ mode: "solve", goal: GOAL })(o, s));
    const out = await runExperiment(options({ driver, skill: SKILL }));
    const v1 = loadVersion("skill-tool", "1");
    expect(seen).toEqual([v1.text]);
    expect(score(out.reports[0]!.dir).prompt.skillTool).toEqual({ version: "1", sha256: v1.sha256 });
  });

  it("is not recorded for a run with no skill", async () => {
    const out = await runExperiment(options());
    expect(score(out.reports[0]!.dir).prompt).not.toHaveProperty("skillTool");
  });

  it("refuses an unknown version before any run", async () => {
    await expect(runExperiment(options({ skill: SKILL, skillToolVersion: "9" }))).rejects.toThrow(PromptRefused);
  });

  it("shows in the plan with the skill", () => {
    expect(planExperiment(options({ skill: SKILL }))[0]!.promptRecord.skillTool?.version).toBe("1");
    expect(planExperiment(options())[0]!.promptRecord).not.toHaveProperty("skillTool");
  });
});

describe("the command (FR-020)", () => {
  const harness = () => {
    const out: string[] = [];
    const err: string[] = [];
    const dir = mkdtempSync(join(tmpdir(), "skill-craft-kinds-cli-"));
    const run = (argv: string[]) => runAgentCli(["--world", WORLD, "--out", dir, "--goal", "c", ...argv], { driver: fakePlayer({ mode: "solve", goal: GOAL }), pricing: async () => undefined, out: (s) => out.push(s), err: (s) => err.push(s) });
    return { run, out, err };
  };

  it("takes --skill-tool-version, defaulting to 1, and refuses an unknown one", async () => {
    const h = harness();
    expect(await h.run(["--label", "a", "--skill", SKILL, "--dry-run"])).toBe(0);
    expect(JSON.parse(h.out.join("\n"))[0].promptRecord.skillTool.version).toBe("1");
    expect(await h.run(["--label", "b", "--skill", SKILL, "--skill-tool-version", "9"])).toBe(1);
    expect(h.err.join("\n")).toMatch(/no skill-tool prompt version 9/);
  });

  it("records a free-text sentence as custom beside an arm sentence's version", async () => {
    const h = harness();
    expect(await h.run(["--label", "c", "--prompt-note", "Go on.", "--dry-run"])).toBe(0);
    expect(JSON.parse(h.out.join("\n"))[0].promptRecord.armSentence.version).toBe("custom");
  });
});
