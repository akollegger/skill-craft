// What a run records of the prompt it saw (spec 008, FR-005): the version, two fingerprints, the arm sentence and the budget.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAgentCli } from "../src/harness/cli.js";
import { runExperiment } from "../src/harness/run.js";
import { fingerprint, loadVersion } from "../src/prompts/index.js";
import { fakePlayer } from "./helpers/fake-player.js";

const GOAL = { item: "c", qty: 1 };
const WORLD = "test/fixtures/valid/mirror-pair.json";
const options = (over: Record<string, unknown> = {}) => ({ world: WORLD, goal: GOAL, runs: 1, maxTurns: 12, out: mkdtempSync(join(tmpdir(), "skill-craft-prec-")), label: "p", driver: fakePlayer({ mode: "solve", goal: GOAL }), ...over });
const score = (dir: string) => JSON.parse(readFileSync(join(dir, "score.json"), "utf8"));

describe("a run's prompt record", () => {
  it("names version 1 and two equal fingerprints, and prompt.txt holds the fingerprinted text", async () => {
    const out = await runExperiment(options());
    const s = score(out.reports[0]!.dir);
    const text = readFileSync(join(out.reports[0]!.dir, "prompt.txt"), "utf8").replace(/\n$/, "");
    expect(s.prompt).toEqual({ version: "1", baseSha256: fingerprint(text), sha256: fingerprint(text) });
    expect(s.budget).toEqual({ kind: "steps", limit: 12 });
    const summary = JSON.parse(readFileSync(join(out.dir, "summary.json"), "utf8"));
    expect(summary.prompt).toEqual({ version: "1", baseSha256: fingerprint(text) });
    expect(summary.budget).toEqual({ kind: "steps", limit: 12 });
  });

  it("gives two runs of one version the same fingerprints", async () => {
    const a = score((await runExperiment(options({ label: "a" }))).reports[0]!.dir);
    const b = score((await runExperiment(options({ label: "b" }))).reports[0]!.dir);
    expect(a.prompt).toEqual(b.prompt);
  });

  it("keeps the base fingerprint under an arm sentence and changes the full one, recording the sentence's version", async () => {
    const plain = score((await runExperiment(options({ label: "a" }))).reports[0]!.dir);
    const armed = score((await runExperiment(options({ label: "b", armSentenceVersion: "1" }))).reports[0]!.dir);
    expect(armed.prompt.baseSha256).toBe(plain.prompt.baseSha256);
    expect(armed.prompt.sha256).not.toBe(plain.prompt.sha256);
    expect(armed.prompt.armSentence).toEqual({ version: "1", sha256: loadVersion("arm-sentence", "1").sha256 });
  });

  it("records an ad hoc template and a free-text sentence as custom", async () => {
    const s = score((await runExperiment(options({ promptTemplate: "Hold {what} in {turns}.", promptNote: "Go." }))).reports[0]!.dir);
    expect(s.prompt.version).toBe("custom");
    expect(s.prompt.armSentence).toEqual({ version: "custom", sha256: fingerprint("Go.") });
  });
});

describe("the command (FR-003, US1 scenario 1)", () => {
  const harness = () => {
    const out: string[] = [];
    const err: string[] = [];
    const dir = mkdtempSync(join(tmpdir(), "skill-craft-prec-cli-"));
    const run = (argv: string[]) => runAgentCli(["--world", WORLD, "--out", dir, "--goal", "c", ...argv], { driver: fakePlayer({ mode: "solve", goal: GOAL }), pricing: async () => undefined, out: (s) => out.push(s), err: (s) => err.push(s) });
    return { run, out, err, dir };
  };

  it("selects a numbered version, and shows the version and both hashes in a dry run", async () => {
    const h = harness();
    expect(await h.run(["--label", "a", "--prompt-version", "1", "--dry-run"])).toBe(0);
    const plan = JSON.parse(h.out.join("\n"));
    expect(plan[0].promptRecord.version).toBe("1");
    expect(plan[0].promptRecord.baseSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses an unknown version, and a version with a template, before any call", async () => {
    const h = harness();
    expect(await h.run(["--label", "a", "--prompt-version", "99"])).toBe(1);
    expect(h.err.join("\n")).toMatch(/no base prompt version 99/);
    expect(await h.run(["--label", "b", "--prompt-version", "1", "--prompt-file", "prompts/base/v1.txt"])).toBe(1);
    expect(h.err.join("\n")).toMatch(/not both/);
  });

  it("refuses a template with an unknown placeholder or no {what}", async () => {
    const h = harness();
    const dir = mkdtempSync(join(tmpdir(), "skill-craft-tpl-"));
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(dir, "bad.txt"), "Hold {what} {bogus}");
    expect(await h.run(["--label", "a", "--prompt-file", join(dir, "bad.txt")])).toBe(1);
    expect(h.err.join("\n")).toMatch(/bogus/);
  });

  it("selects an arm sentence by version, exclusive with a free-text note", async () => {
    const h = harness();
    expect(await h.run(["--label", "a", "--arm-sentence", "1", "--dry-run"])).toBe(0);
    expect(h.out.join("\n")).toContain("A skill for this kind of task is available");
    expect(await h.run(["--label", "b", "--arm-sentence", "1", "--prompt-note", "x"])).toBe(1);
    expect(h.err.join("\n")).toMatch(/not both/);
  });
});
