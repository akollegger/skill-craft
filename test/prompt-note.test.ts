import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAgentCli } from "../src/harness/cli.js";
import type { AgentDriver, DriverOptions } from "../src/harness/driver.js";
import { buildPrompt, planExperiment, runExperiment } from "../src/harness/run.js";
import { fakePlayer } from "./helpers/fake-player.js";

const GOAL = { item: "c", qty: 1 };
const WORLD = "test/fixtures/valid/mirror-pair.json";
const NOTE = "A skill for this kind of task is available; load it before exploring.";

const BASE = [
  "You are at a crafting table in an unfamiliar workshop. Your goal: end up holding one c.",
  "Use only the craft tools, and start with help.",
  "Nobody can answer questions or give hints, so do not ask for any. Keep trying on your own until you hold c, or until your budget of 12 turns is used up.",
  "craft is irreversible and uses up whatever is on the table, so explore with place, remove, clear and look before you commit.",
  "When you hold it, say so in one line and stop.",
].join("\n");

/** A scripted player that also keeps the prompt it was given. */
function spy(): { driver: AgentDriver; prompts: string[] } {
  const inner = fakePlayer({ mode: "solve", goal: GOAL });
  const prompts: string[] = [];
  return { prompts, driver: (opts: DriverOptions, sink) => (prompts.push(opts.prompt), inner(opts, sink)) };
}

const options = (over: Record<string, unknown> = {}) => ({
  world: WORLD,
  goal: GOAL,
  runs: 1,
  maxTurns: 12,
  out: mkdtempSync(join(tmpdir(), "skill-craft-note-")),
  label: "n",
  record: false,
  ...over,
});

describe("buildPrompt with a note", () => {
  it("is byte-identical to the base prompt when there is no note", () => {
    expect(buildPrompt(GOAL, 12)).toBe(BASE);
    expect(buildPrompt(GOAL, 12, undefined)).toBe(BASE);
  });

  it("adds the note as its own last line and changes nothing else", () => {
    const p = buildPrompt(GOAL, 12, NOTE);
    expect(p).toBe(`${BASE}\n${NOTE}`);
    expect(p.split("\n").at(-1)).toBe(NOTE);
  });
});

describe("the note in a run", () => {
  it("reaches the player and prompt.txt, and prompt.txt equals what the player received", async () => {
    const s = spy();
    const out = await runExperiment(options({ driver: s.driver, promptNote: NOTE }));
    expect(s.prompts).toEqual([`${BASE}\n${NOTE}`]);
    expect(readFileSync(join(out.reports[0]!.dir, "prompt.txt"), "utf8")).toBe(`${BASE}\n${NOTE}\n`);
  });

  it("does not appear without --prompt-note, and not in a later batch that gives none", async () => {
    const s = spy();
    await runExperiment(options({ driver: s.driver, promptNote: NOTE, label: "with" }));
    const out = await runExperiment(options({ driver: s.driver, label: "without" }));
    expect(s.prompts[1]).toBe(BASE);
    expect(readFileSync(join(out.reports[0]!.dir, "prompt.txt"), "utf8")).not.toContain(NOTE);
  });

  it("is recorded in the run's score and the batch summary, and only when given", async () => {
    const out = await runExperiment(options({ driver: spy().driver, promptNote: NOTE, label: "with" }));
    expect(JSON.parse(readFileSync(join(out.reports[0]!.dir, "score.json"), "utf8")).promptNote).toBe(NOTE);
    expect(JSON.parse(readFileSync(join(out.dir, "summary.json"), "utf8")).promptNote).toBe(NOTE);
    const plain = await runExperiment(options({ driver: spy().driver, label: "plain" }));
    expect(JSON.parse(readFileSync(join(plain.reports[0]!.dir, "score.json"), "utf8"))).not.toHaveProperty("promptNote");
    expect(JSON.parse(readFileSync(join(plain.dir, "summary.json"), "utf8"))).not.toHaveProperty("promptNote");
  });

  it("is shown by the dry-run plan", () => {
    const plan = planExperiment({ ...options(), promptNote: NOTE });
    expect(plan[0]?.prompt.endsWith(NOTE)).toBe(true);
    expect(planExperiment(options())[0]?.prompt).toBe(BASE);
  });
});

describe("--prompt-note on the command line", () => {
  const harness = () => {
    const out: string[] = [];
    const err: string[] = [];
    const dir = mkdtempSync(join(tmpdir(), "skill-craft-note-cli-"));
    const run = (argv: string[]) => runAgentCli(["--world", WORLD, "--out", dir, "--goal", "c", ...argv], { driver: spy().driver, out: (s) => out.push(s), err: (s) => err.push(s) });
    return { run, out, err };
  };

  it("passes the note to the plan", async () => {
    const h = harness();
    expect(await h.run(["--label", "a", "--prompt-note", NOTE, "--dry-run"])).toBe(0);
    expect(h.out.join("\n")).toContain(NOTE);
  });

  it("rejects an empty note", async () => {
    const h = harness();
    for (const bad of ["", "   "]) expect(await h.run(["--label", "b", "--prompt-note", bad, "--dry-run"]), JSON.stringify(bad)).toBe(1);
    expect(h.err.join("\n")).toMatch(/--prompt-note must not be empty/);
  });
});
