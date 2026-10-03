import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAgentCli } from "../src/harness/cli.js";
import { runExperiment } from "../src/harness/run.js";
import { runCriticLoopCli, type LoopCliDeps } from "../src/loop/cli.js";
import { fakePlayer } from "./helpers/fake-player.js";
import { fakeRole, type FakeRole, type ScriptedAnswer } from "./helpers/fake-role.js";
import { candidate, revision, skillText, verdict } from "./helpers/loop-fixtures.js";
import { writePackage } from "../src/loop/package.js";
import { FakeNams } from "./helpers/fake-nams.js";
import { makeZip } from "./helpers/zip.js";

const MIRROR = "test/fixtures/valid/mirror-pair.json";
const CHAIN = "test/fixtures/valid/chain-three.json";

/** Finished runs made with the scripted player; the calls they hold are enough for citations like `run 001 call 2`. */
async function makeRun(world: string, goal: { item: string; qty: number }, label: string, models?: string[]): Promise<string> {
  const out = mkdtempSync(join(tmpdir(), "skill-craft-clirun-"));
  const { dir } = await runExperiment({ world, goal, runs: 1, maxTurns: 12, out, label, record: false, driver: fakePlayer({ mode: "solve", goal, ...(models ? { models } : {}) }) });
  return join(dir, "001");
}

function candidateFolder(files = candidate()): string {
  const dir = mkdtempSync(join(tmpdir(), "skill-craft-cand-"));
  writePackage(dir, files);
  return dir;
}

interface Harness { code: number; out: string[]; err: string[]; role: FakeRole; loops: string }
async function run(args: string[], script: ScriptedAnswer[] = [], deps: Partial<LoopCliDeps> = {}): Promise<Harness> {
  const loops = mkdtempSync(join(tmpdir(), "skill-craft-loops-"));
  const out: string[] = [];
  const err: string[] = [];
  const role = fakeRole(script);
  const code = await runCriticLoopCli(["--out", loops, ...args], { role: role.driver, env: {}, out: (l) => out.push(l), err: (l) => err.push(l), ...deps });
  return { code, out, err, role, loops };
}

describe("refusals before any call", () => {
  it("needs --runs, and prints the usage", async () => {
    const r = await run([]);
    expect(r.code).toBe(1);
    expect(r.err.join("\n")).toContain("usage:");
    expect(r.role.calls).toHaveLength(0);
  });

  it("needs --candidate or --allow-workspace", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const r = await run(["--runs", a]);
    expect(r.code).toBe(1);
    expect(r.err.join("\n")).toMatch(/--candidate or --allow-workspace/);
    expect(r.role.calls).toHaveLength(0);
  });

  it("names the variable, never a value, when the NAMS key is missing for a workspace", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const r = await run(["--runs", a, "--allow-workspace"], [], { env: {} });
    expect(r.code).toBe(1);
    expect(r.err.join("\n")).toContain("NAMS_API_KEY");
  });

  it("refuses a run folder that is unfinished", async () => {
    const empty = mkdtempSync(join(tmpdir(), "skill-craft-empty-"));
    const r = await run(["--runs", empty, "--candidate", candidateFolder()]);
    expect(r.code).toBe(1);
    expect(r.role.calls).toHaveLength(0);
  });

  it("refuses runs of different goals, and of different worlds", async () => {
    const c = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const d = await makeRun(MIRROR, { item: "d", qty: 1 }, "b");
    const other = await makeRun(CHAIN, { item: "d", qty: 1 }, "c");
    const cand = candidateFolder();
    expect((await run(["--runs", c, d, "--candidate", cand])).err.join("\n")).toMatch(/different goals/);
    expect((await run(["--runs", d, other, "--candidate", cand])).err.join("\n")).toMatch(/different worlds/);
  });

  it("refuses recordings from more than one model unless both roles' models are set", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a", ["model-one"]);
    const b = await makeRun(MIRROR, { item: "c", qty: 1 }, "b", ["model-two"]);
    const cand = candidateFolder();
    const refused = await run(["--runs", a, b, "--candidate", cand]);
    expect(refused.code).toBe(1);
    expect(refused.err.join("\n")).toMatch(/more than one model/);
    const ok = await run(["--runs", a, b, "--candidate", cand, "--critic-model", "m-critic", "--reviser-model", "m-reviser"], [verdict("accept", "A")]);
    expect(ok.code).toBe(0);
  });

  it("refuses an existing label", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const cand = candidateFolder();
    const first = await run(["--runs", a, "--candidate", cand, "--label", "same"], [verdict("accept", "A")]);
    expect(first.code).toBe(0);
    const out = mkdtempSync(join(tmpdir(), "skill-craft-loops-"));
    mkdirSync(join(out, "same"));
    const again = await runCriticLoopCli(["--out", out, "--runs", a, "--candidate", cand, "--label", "same"], { role: fakeRole([]).driver, env: {}, out: () => {}, err: () => {} });
    expect(again).toBe(1);
  });

  it("refuses a candidate package over 64 KB, naming the limit", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const big = candidateFolder({ ...candidate(), "references/a.md": "x".repeat(30 * 1024), "references/b.md": "x".repeat(30 * 1024), "references/c.md": "x".repeat(30 * 1024) });
    const r = await run(["--runs", a, "--candidate", big]);
    expect(r.code).toBe(1);
    expect(r.err.join("\n")).toMatch(/64 KB/);
  });

  it.each([["--max-rounds", "0"], ["--max-rounds", "4"], ["--max-role-usd", "0"], ["--format", "yaml"]])("refuses %s %s", async (flag, value) => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const r = await run(["--runs", a, "--candidate", candidateFolder(), flag, value]);
    expect(r.code).toBe(1);
    expect(r.role.calls).toHaveLength(0);
  });
});

describe("--dry-run", () => {
  it("prints the plan, makes no call and writes nothing", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const b = await makeRun(MIRROR, { item: "c", qty: 1 }, "b");
    const r = await run(["--runs", a, b, "--candidate", candidateFolder(), "--label", "plan", "--dry-run"]);
    expect(r.code).toBe(0);
    const text = r.out.join("\n");
    expect(text).toContain("c x1");
    expect(text).toContain("fake-model");
    expect(text).toMatch(/rubric version 1/);
    expect(text).toMatch(/at most 3 rounds/);
    expect(text).toMatch(/no NAMS call/);
    expect(r.role.calls).toHaveLength(0);
    expect(existsSync(join(r.loops, "plan"))).toBe(false);
  });
});

describe("a loop from a candidate (scripted roles)", () => {
  it("prints the round lines and the outcome, writes the record, and the roles use the teacher's model and the cap", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const r = await run(["--runs", a, "--candidate", candidateFolder(), "--label", "go", "--max-role-usd", "0.4"], [verdict("revise", "V1"), revision("TEXT-1"), verdict("accept", "V2")]);
    expect(r.code).toBe(0);
    const text = r.out.join("\n");
    expect(text).toMatch(/round 1\s+critic fake-model: revise/);
    expect(text).toMatch(/round 1\s+reviser fake-model: revised\s+.*sha256 [0-9a-f]{12}/);
    expect(text).toMatch(/round 2\s+critic fake-model: accept/);
    expect(text).toMatch(/outcome accept\s+skill: .*go\/skill/);
    expect(existsSync(join(r.loops, "go/loop.json"))).toBe(true);
    expect(r.role.calls.every((c) => c.model === "fake-model" && c.maxUsd === 0.4)).toBe(true);
  });

  it("prints a reject without a skill line and leaves nothing installable", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const r = await run(["--runs", a, "--candidate", candidateFolder(), "--label", "no"], [verdict("reject", "R")]);
    expect(r.code).toBe(0);
    const text = r.out.join("\n");
    expect(text).toMatch(/outcome reject\s+\(the critic rejected the skill\)/);
    expect(text).not.toContain("skill:");
    expect(existsSync(join(r.loops, "no/skill"))).toBe(false);
  });

  it("exits 1 with the fixed reason when the loop fails, and keeps the rounds that finished", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const r = await run(["--runs", a, "--candidate", candidateFolder(), "--label", "bad"], [verdict("revise", "V1"), revision("T1"), { overall: "maybe", note: "AGENT-WORDS" }]);
    expect(r.code).toBe(1);
    expect(r.err.join("\n")).toContain("VerdictInvalid: the critic's answer does not match the verdict schema");
    expect([...r.out, ...r.err].join("\n")).not.toContain("AGENT-WORDS");
    expect(JSON.parse(readFileSync(join(r.loops, "bad/loop.json"), "utf8")).rounds).toHaveLength(1);
  });

  it("exits 130 on abort, after writing the finished rounds", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const ctl = new AbortController();
    const r = await run(["--runs", a, "--candidate", candidateFolder(), "--label", "stop"], [() => { ctl.abort(); return verdict("revise", "V1"); }, revision("T1")], { signal: ctl.signal });
    expect(r.code).toBe(130);
    expect(JSON.parse(readFileSync(join(r.loops, "stop/loop.json"), "utf8"))).toMatchObject({ cancelled: true });
  });

  it("produces a skill that installs through run-agent's --skill, and the run records its hash", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const r = await run(["--runs", a, "--candidate", candidateFolder(), "--label", "inst"], [verdict("revise", "V1"), { ...revision("TEXT-1"), skillMd: skillText("TEXT-1") }, verdict("accept", "V2")]);
    expect(r.code).toBe(0);
    const loopJson = JSON.parse(readFileSync(join(r.loops, "inst/loop.json"), "utf8"));
    const studentOut = mkdtempSync(join(tmpdir(), "skill-craft-student-"));
    const lines: string[] = [];
    const code = await runAgentCli(["--world", MIRROR, "--goal", "c", "--out", studentOut, "--label", "s", "--skill", join(r.loops, "inst/skill")], { driver: fakePlayer({ mode: "solve", goal: { item: "c", qty: 1 } }), out: (l) => lines.push(l), err: (l) => lines.push(l) });
    expect(code).toBe(0);
    const score = JSON.parse(readFileSync(join(studentOut, "s/001/score.json"), "utf8"));
    expect(score.skill.sha256).toBe(loopJson.rounds.at(-1).skillSha256);
  });
});

describe("a loop from the runs alone (scripted memory service)", () => {
  const SKILL_ZIP = () => makeZip([{ name: "craft-thing/SKILL.md", data: skillText("DISTILLED") }]);
  const base = { namsWait: { pollMs: 1, maxWaitMs: 2000 } };

  it("creates and deletes its own workspace, prints the ids, and runs the loop on the downloaded candidate", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const b = await makeRun(MIRROR, { item: "c", qty: 1 }, "b");
    const nams = new FakeNams({ zip: SKILL_ZIP() });
    const r = await run(["--runs", a, b, "--allow-workspace", "--label", "nams-go"], [verdict("accept", "A")], { ...base, nams, env: { NAMS_API_KEY: "test-key" } });
    expect(r.code).toBe(0);
    const text = r.out.join("\n");
    expect(text).toContain(`workspace ${nams.created[0]} created`);
    expect(text).toContain(`workspace ${nams.created[0]} deleted`);
    expect(nams.deleted).toEqual(nams.created);
    expect(nams.touched()).toEqual(nams.created);
    expect(r.role.calls[0]!.prompt).toContain("DISTILLED");
    const loopJson = JSON.parse(readFileSync(join(r.loops, "nams-go/loop.json"), "utf8"));
    expect(loopJson).toMatchObject({ mode: "runs", outcome: "accept", candidate: { generation: { runId: "run-1" } } });
    expect(loopJson.stages.map((s: { stage: string }) => s.stage)).toEqual(expect.arrayContaining(["create-workspace", "record-run-001", "generate", "delete-workspace", "critic-1"]));
    expect(existsSync(join(r.loops, "nams-go/candidate/SKILL.md"))).toBe(true);
  });

  it("never touches the workspace named in NAMS_WORKSPACE_ID", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const nams = new FakeNams({ zip: SKILL_ZIP(), createdId: "experiment-ws", existing: ["experiment-ws"] });
    const r = await run(["--runs", a, "--allow-workspace"], [], { ...base, nams, env: { NAMS_API_KEY: "k", NAMS_WORKSPACE_ID: "experiment-ws" } });
    expect(r.code).toBe(1);
    expect(r.err.join("\n")).toMatch(/workspace refused/);
    expect(nams.deleted).toEqual([]);
  });

  it("ends in reject with the distiller's reasons, deletes the workspace, and runs no round, when the distiller fails", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const nams = new FakeNams({ runs: [{ status: "failed", failure: "low_coverage", gates: { coverage: 0.5 } }] });
    const r = await run(["--runs", a, "--allow-workspace", "--label", "nofail"], [], { ...base, nams, env: { NAMS_API_KEY: "k" } });
    expect(r.code).toBe(1);
    expect(r.err.join("\n")).toContain("CandidateFailed: no candidate skill: the distiller reported failed (low_coverage)");
    expect(r.role.calls).toHaveLength(0);
    expect(nams.deleted).toEqual(nams.created);
    expect(JSON.parse(readFileSync(join(r.loops, "nofail/loop.json"), "utf8"))).toMatchObject({ outcome: "reject", failed: true, rounds: [] });
    expect(existsSync(join(r.loops, "nofail/skill"))).toBe(false);
  });

  it("exits 130 on abort during the service's wait, after deleting the workspace", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const nams = new FakeNams({ hangOn: ["waitExtracted"] });
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 30);
    const r = await run(["--runs", a, "--allow-workspace", "--label", "abort"], [], { ...base, nams, env: { NAMS_API_KEY: "k" }, signal: ctl.signal });
    expect(r.code).toBe(130);
    expect(nams.deleted).toEqual(nams.created);
    expect(JSON.parse(readFileSync(join(r.loops, "abort/loop.json"), "utf8"))).toMatchObject({ cancelled: true });
  });
});
