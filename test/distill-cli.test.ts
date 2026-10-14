// The distill command (spec 009, US2): replaces critic-loop.ts. It builds a run record from each folder, records them with a named harness, distills over all of
// them and writes the skill set, the sidecar and the provenance record. The scripted roles and the scripted memory service stand in for the real ones.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runDistillCli, type DistillCliDeps } from "../src/distill/cli.js";
import { readDistillationRecord } from "../src/distill/provenance.js";
import { readSkillSet } from "../src/distill/skill-set.js";
import { runAgentCli } from "../src/harness/cli.js";
import { runExperiment } from "../src/harness/run.js";
import { fakePlayer } from "./helpers/fake-player.js";
import { fakeRole, type FakeRole, type ScriptedAnswer } from "./helpers/fake-role.js";
import { revision, skillText, verdict } from "./helpers/loop-fixtures.js";
import { FakeNams } from "./helpers/fake-nams.js";
import { makeZip } from "./helpers/zip.js";

const MIRROR = "test/fixtures/valid/mirror-pair.json";
const CHAIN = "test/fixtures/valid/chain-three.json";
const SKILL = (marker = "DISTILLED") => makeZip([{ name: "craft-thing/SKILL.md", data: skillText(marker) }]);
const FIXED_PROCESS = { version: "3", commit: "0123456789abcdef0123456789abcdef01234567", dirty: false, changesSha256: null };

/** Finished runs made with the scripted player. */
async function makeRun(world: string, goal: { item: string; qty: number }, label: string, models?: string[]): Promise<string> {
  const out = mkdtempSync(join(tmpdir(), "skill-craft-dclirun-"));
  const { dir } = await runExperiment({ world, goal, runs: 1, maxTurns: 12, out, label, driver: fakePlayer({ mode: "solve", goal, ...(models ? { models } : {}) }) });
  return join(dir, "001");
}

interface Ran { code: number; out: string[]; err: string[]; role: FakeRole; nams: FakeNams; dir: string }

async function run(args: string[], script: ScriptedAnswer[] = [], deps: Partial<DistillCliDeps> = {}, nams = new FakeNams({ zip: SKILL() })): Promise<Ran> {
  const dir = mkdtempSync(join(tmpdir(), "skill-craft-distills-"));
  const out: string[] = [];
  const err: string[] = [];
  const role = fakeRole(script);
  const code = await runDistillCli(["--out", dir, ...args], { role: role.driver, nams, namsWait: { pollMs: 1, maxWaitMs: 2000 }, env: { NAMS_API_KEY: "test-key" }, processInfo: () => FIXED_PROCESS, pricing: async () => undefined, out: (l) => out.push(l), err: (l) => err.push(l), ...deps });
  return { code, out, err, role, nams, dir };
}
const NR = ["--harness", "nams-reviewed", "--allow-workspace"];

describe("refusals before any call", () => {
  it("needs --harness and --runs, and prints the usage", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const none = await run([]);
    expect(none.code).toBe(1);
    expect(none.err.join("\n")).toContain("usage:");
    const noHarness = await run(["--runs", a]);
    expect(noHarness.code).toBe(1);
    expect(noHarness.err.join("\n")).toContain("--harness");
    expect(noHarness.nams.calls).toHaveLength(0);
  });

  it("refuses an unknown harness, naming the known ones", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const r = await run(["--harness", "nope", "--runs", a]);
    expect(r.code).toBe(1);
    expect(r.err.join("\n")).toMatch(/unknown harness 'nope'; known: .*nams-reviewed/);
  });

  it("refuses nams-reviewed without --allow-workspace, before any account call", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const r = await run(["--harness", "nams-reviewed", "--runs", a]);
    expect(r.code).toBe(1);
    expect(r.err.join("\n")).toMatch(/--allow-workspace/);
    expect(r.nams.calls).toHaveLength(0);
    expect(r.role.calls).toHaveLength(0);
  });

  it("names the variable, never a value, when the NAMS key is missing", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const r = await run([...NR, "--runs", a], [], { env: {}, nams: undefined });
    expect(r.code).toBe(1);
    expect(r.err.join("\n")).toContain("NAMS_API_KEY");
  });

  it("refuses an unfinished run folder, runs of different goals or worlds, and recordings from two models without role models", async () => {
    const empty = mkdtempSync(join(tmpdir(), "skill-craft-empty-"));
    expect((await run([...NR, "--runs", empty])).code).toBe(1);
    const c = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const d = await makeRun(MIRROR, { item: "d", qty: 1 }, "b");
    const other = await makeRun(CHAIN, { item: "d", qty: 1 }, "c");
    expect((await run([...NR, "--runs", c, d])).err.join("\n")).toMatch(/different goals/);
    expect((await run([...NR, "--runs", d, other])).err.join("\n")).toMatch(/different worlds/);
    const a1 = await makeRun(MIRROR, { item: "c", qty: 1 }, "a", ["model-one"]);
    const b1 = await makeRun(MIRROR, { item: "c", qty: 1 }, "b", ["model-two"]);
    const refused = await run([...NR, "--runs", a1, b1]);
    expect(refused.err.join("\n")).toMatch(/more than one model/);
    const ok = await run([...NR, "--runs", a1, b1, "--critic-model", "m-critic", "--reviser-model", "m-reviser"], [verdict("accept", "A")]);
    expect(ok.code).toBe(0);
  });

  it("refuses an existing label", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const out = mkdtempSync(join(tmpdir(), "skill-craft-distills-"));
    mkdirSync(join(out, "same"));
    const code = await runDistillCli(["--out", out, ...NR, "--runs", a, "--label", "same"], { role: fakeRole([]).driver, env: { NAMS_API_KEY: "k" }, nams: new FakeNams({ zip: SKILL() }), out: () => {}, err: () => {} });
    expect(code).toBe(1);
  });

  it.each([["--max-rounds", "0"], ["--max-rounds", "4"], ["--max-role-usd", "0"], ["--format", "yaml"]])("refuses %s %s", async (flag, value) => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const r = await run([...NR, "--runs", a, flag, value]);
    expect(r.code).toBe(1);
    expect(r.role.calls).toHaveLength(0);
    expect(r.nams.calls).toHaveLength(0);
  });
});

describe("--dry-run", () => {
  it("prints the plan, makes no call and writes nothing", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const b = await makeRun(MIRROR, { item: "c", qty: 1 }, "b");
    const r = await run([...NR, "--runs", a, b, "--label", "plan", "--dry-run"]);
    expect(r.code).toBe(0);
    const text = r.out.join("\n");
    expect(text).toContain("c x1");
    expect(text).toContain("harness nams-reviewed");
    expect(text).toContain("fake-model");
    expect(text).toMatch(/rubric version 1/);
    expect(text).toMatch(/at most 3 rounds/);
    expect(text).toMatch(/NAMS: create a workspace/);
    expect(r.role.calls).toHaveLength(0);
    expect(r.nams.calls).toHaveLength(0);
    expect(existsSync(join(r.dir, "plan"))).toBe(false);
  });

  it("reads a bare Claude id in an old score as anthropic/<id>, and leaves a canonical id as it is", async () => {
    const old = await makeRun(MIRROR, { item: "c", qty: 1 }, "a", ["claude-sonnet-5-5"]);
    expect((await run([...NR, "--runs", old, "--dry-run"])).out.join("\n")).toContain("critic anthropic/claude-sonnet-5-5, reviser anthropic/claude-sonnet-5-5");
    const neu = await makeRun(MIRROR, { item: "c", qty: 1 }, "b", ["fireworks/gpt-oss-120b"]);
    expect((await run([...NR, "--runs", neu, "--dry-run"])).out.join("\n")).toContain("critic fireworks/gpt-oss-120b, reviser fireworks/gpt-oss-120b");
  });
});

describe("--settings for the roles", () => {
  const settingsFile = (map: object) => {
    const f = join(mkdtempSync(join(tmpdir(), "skill-craft-dsettings-")), "settings.json");
    writeFileSync(f, JSON.stringify(map));
    return f;
  };
  const models = ["--critic-model", "claude-haiku-4-5-20251001", "--reviser-model", "claude-haiku-4-5-20251001"];

  it("hands each role the settings pinned for its model, and shows them in a dry run", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const file = settingsFile({ "claude-haiku-4-5-20251001": { thinking: 31999 } });
    const r = await run([...NR, "--runs", a, "--label", "s", ...models, "--settings", file], [verdict("accept", "A")]);
    expect(r.code).toBe(0);
    expect(r.role.calls[0]?.settings).toEqual({ thinking: 31999 });
    expect((await run([...NR, "--runs", a, "--label", "s2", ...models, "--settings", file, "--dry-run"])).out.join("\n")).toMatch(/settings .*thinking.*31999/);
  });

  it("refuses a setting a role's model does not take, before any call", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const file = settingsFile({ "claude-sonnet-5-5": { temperature: 0 } });
    const r = await run([...NR, "--runs", a, "--critic-model", "claude-sonnet-5-5", "--reviser-model", "claude-sonnet-5-5", "--settings", file]);
    expect(r.code).toBe(1);
    expect(r.err.join("\n")).toContain("model 'anthropic/claude-sonnet-5-5' does not take setting 'temperature'");
    expect(r.nams.calls).toHaveLength(0);
  });
});

describe("a distillation by nams-reviewed", () => {
  it("writes the skill set, the sidecar, the provenance record and the harness's own working files, and prints the rounds and the outcome", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const b = await makeRun(MIRROR, { item: "c", qty: 1 }, "b");
    const r = await run([...NR, "--runs", a, b, "--label", "go", "--max-role-usd", "0.4"], [verdict("revise", "V1"), revision("TEXT-1"), verdict("accept", "V2")]);
    expect(r.code).toBe(0);
    const text = r.out.join("\n");
    expect(text).toContain(`workspace ${r.nams.created[0]} created`);
    expect(text).toContain(`workspace ${r.nams.created[0]} deleted`);
    expect(text).toMatch(/round 1\s+critic fake-model: revise/);
    expect(text).toMatch(/round 1\s+reviser fake-model: revised\s+.*sha256 [0-9a-f]{12}/);
    expect(text).toMatch(/round 2\s+critic fake-model: accept/);
    expect(text).toMatch(/outcome skill-set\s+1 skill\(s\): .*go\/skills/);
    expect(r.nams.deleted).toEqual(r.nams.created);
    expect(r.nams.touched()).toEqual(r.nams.created);
    expect(r.role.calls.every((c) => c.model === "fake-model" && c.maxUsd === 0.4)).toBe(true);

    // the skill set: a root folder with a folder per skill and the sidecar beside it
    const set = readSkillSet(join(r.dir, "go/skills"));
    expect(set.skills.map((s) => s.name)).toEqual(["craft-thing"]);
    expect(readdirSync(join(r.dir, "go/skills")).sort()).toEqual(["craft-thing", "skill-set.json"]);
    // the provenance record
    const rec = readDistillationRecord(join(r.dir, "go/harness.json"));
    expect(rec.harness.name).toBe("nams-reviewed");
    expect(rec.outcome).toBe("skill-set");
    expect(rec.code).toMatchObject({ commit: FIXED_PROCESS.commit, dirty: false });
    expect(rec.runs.map((x) => x.id)).toEqual(["001", "002"]);
    expect(rec.skills).toHaveLength(1);
    expect(rec.review?.rounds.map((x) => x.overall)).toEqual(["revise", "accept"]);
    // the harness's own working files, as the loop folder had them
    for (const f of ["workspace.json", "generation.json", "loop.json", "candidate/SKILL.md", "rounds/01/verdict.json", "skill/SKILL.md"]) expect(existsSync(join(r.dir, "go", f)), f).toBe(true);
  });

  it("prints a no_skill outcome without a skill set when the critic rejects, and exits 0", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const r = await run([...NR, "--runs", a, "--label", "no"], [verdict("reject", "R")]);
    expect(r.code).toBe(0);
    expect(r.out.join("\n")).toMatch(/outcome no_skill/);
    expect(existsSync(join(r.dir, "no/skills"))).toBe(false);
    expect(readDistillationRecord(join(r.dir, "no/harness.json"))).toMatchObject({ outcome: "no_skill", skills: [] });
  });

  it("exits 1 with the fixed reason when a role's answer is invalid, keeps the rounds that finished, and prints none of the model's words", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const r = await run([...NR, "--runs", a, "--label", "bad"], [verdict("revise", "V1"), revision("T1"), { overall: "maybe", note: "AGENT-WORDS" }]);
    expect(r.code).toBe(1);
    expect([...r.out, ...r.err].join("\n")).not.toContain("AGENT-WORDS");
    expect(JSON.parse(readFileSync(join(r.dir, "bad/loop.json"), "utf8")).rounds).toHaveLength(1);
    expect(readDistillationRecord(join(r.dir, "bad/harness.json"))).toMatchObject({ outcome: "failed" });
    expect(r.nams.deleted).toEqual(r.nams.created);
  });

  it("exits 130 on abort, after writing the record, and deletes the workspace", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const ctl = new AbortController();
    const r = await run([...NR, "--runs", a, "--label", "stop"], [() => { ctl.abort(); return verdict("revise", "V1"); }, revision("T1")], { signal: ctl.signal });
    expect(r.code).toBe(130);
    expect(readDistillationRecord(join(r.dir, "stop/harness.json"))).toMatchObject({ outcome: "cancelled" });
    expect(r.nams.deleted).toEqual(r.nams.created);
  });

  it("exits 1 and leaves a record when the memory service cannot make a skill, with its workspace deleted", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const r = await run([...NR, "--runs", a, "--label", "svc"], [], {}, new FakeNams({ zip: SKILL(), runs: [{ status: "failed", failure: "low_coverage" }] }));
    expect(r.code).toBe(1);
    expect(readDistillationRecord(join(r.dir, "svc/harness.json"))).toMatchObject({ outcome: "failed" });
    expect(r.nams.deleted).toEqual(r.nams.created);
  });

  it("produces a skill folder that installs through run-agent's --skill, and the run records its hash", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const r = await run([...NR, "--runs", a, "--label", "inst"], [verdict("revise", "V1"), { ...revision("TEXT-1"), skillMd: skillText("TEXT-1") }, verdict("accept", "V2")]);
    expect(r.code).toBe(0);
    const rec = readDistillationRecord(join(r.dir, "inst/harness.json"));
    const studentOut = mkdtempSync(join(tmpdir(), "skill-craft-student-"));
    const code = await runAgentCli(["--world", MIRROR, "--goal", "c", "--out", studentOut, "--label", "s", "--skill", join(r.dir, "inst/skills/craft-thing")], { driver: fakePlayer({ mode: "solve", goal: { item: "c", qty: 1 } }), pricing: async () => undefined, out: () => {}, err: () => {} });
    expect(code).toBe(0);
    const score = JSON.parse(readFileSync(join(studentOut, "s/001/score.json"), "utf8"));
    expect(rec.skills.map((s) => s.sha256)).toContain(score.skill.sha256);
  });

  it("takes run folders after --runs without repeating the option", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const b = await makeRun(MIRROR, { item: "c", qty: 1 }, "b");
    const r = await run([...NR, "--label", "pos", "--runs", a, b], [verdict("accept", "A")]);
    expect(r.code).toBe(0);
    expect(readDistillationRecord(join(r.dir, "pos/harness.json")).runs).toHaveLength(2);
  });
});

describe("the memory service's own failures, through the command", () => {
  const key = { NAMS_API_KEY: "k" };

  it("never touches the workspace named in NAMS_WORKSPACE_ID", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const nams = new FakeNams({ zip: SKILL(), createdId: "experiment-ws", existing: ["experiment-ws"] });
    const r = await run([...NR, "--runs", a], [], { env: { ...key, NAMS_WORKSPACE_ID: "experiment-ws" } }, nams);
    expect(r.code).toBe(1);
    expect(r.err.join("\n")).toMatch(/workspace refused/);
    expect(nams.deleted).toEqual([]);
  });

  it("ends as failed with the distiller's reasons, deletes the workspace and runs no round, when the distiller fails", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const nams = new FakeNams({ runs: [{ status: "failed", failure: "low_coverage", gates: { coverage: 0.5 } }] });
    const r = await run([...NR, "--runs", a, "--label", "nofail"], [], {}, nams);
    expect(r.code).toBe(1);
    expect(r.err.join("\n")).toContain("CandidateFailed: no candidate skill: the distiller reported failed (low_coverage)");
    expect(r.role.calls).toHaveLength(0);
    expect(nams.deleted).toEqual(nams.created);
    expect(JSON.parse(readFileSync(join(r.dir, "nofail/loop.json"), "utf8"))).toMatchObject({ outcome: "reject", failed: true, rounds: [] });
    expect(existsSync(join(r.dir, "nofail/skill"))).toBe(false);
    expect(existsSync(join(r.dir, "nofail/skills"))).toBe(false);
  });

  it("exits 130 on abort during the service's wait, after deleting the workspace", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const nams = new FakeNams({ hangOn: ["waitExtracted"] });
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 30);
    const r = await run([...NR, "--runs", a, "--label", "abort"], [], { signal: ctl.signal }, nams);
    expect(r.code).toBe(130);
    expect(nams.deleted).toEqual(nams.created);
    expect(JSON.parse(readFileSync(join(r.dir, "abort/loop.json"), "utf8"))).toMatchObject({ cancelled: true });
  });

  it("writes a failure record, and deletes the workspace, when the downloaded package is unusable", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const nams = new FakeNams({ zip: makeZip([{ name: "references/only.md", data: "no main file" }]) });
    const r = await run([...NR, "--runs", a, "--label", "nomain"], [], {}, nams);
    expect(r.code).toBe(1);
    expect(r.err.join("\n")).toMatch(/SkillNotFound/);
    expect(nams.deleted).toEqual(nams.created);
    expect(JSON.parse(readFileSync(join(r.dir, "nomain/loop.json"), "utf8"))).toMatchObject({ outcome: "reject", failed: true, rounds: [] });
    expect(readDistillationRecord(join(r.dir, "nomain/harness.json"))).toMatchObject({ outcome: "failed", skills: [] });
  });
});

describe("the record's provenance, through the command (spec 007)", () => {
  const info = { version: "1", commit: "1".repeat(40), dirty: false, changesSha256: null };
  const loopJson = (dir: string, label: string) => JSON.parse(readFileSync(join(dir, label, "loop.json"), "utf8"));

  it("writes the process, the runs with their hashes and settings, the recording format, and the request made to the distiller", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "p1");
    const r = await run([...NR, "--runs", a, "--critic-model", "fireworks/gpt-oss-120b", "--reviser-model", "fireworks/gpt-oss-120b", "--label", "prov"], [verdict("accept", "V1")], { processInfo: () => info });
    expect(r.code).toBe(0);
    const rec = loopJson(r.dir, "prov");
    expect(rec.process).toEqual(info);
    expect(rec.recordedRuns).toHaveLength(1);
    expect(rec.recordedRuns[0].runLogSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.recordedRuns[0].settings).toEqual({ temperature: null, effort: null, thinking: null });
    expect(rec.recordingFormat).toBe("conversation"); // the scripted player reports its turns
    expect(rec.candidate.generation.request).toEqual({ scope: "conversations", conversations: 1, procedureFormat: "prose" });
    expect(rec.roles.critic.settings).toBeNull();
  });

  it("records a pinned setting for a role by its model, and null for a role with none", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "p3");
    const file = join(mkdtempSync(join(tmpdir(), "skill-craft-set-")), "s.json");
    writeFileSync(file, JSON.stringify({ "fireworks/gpt-oss-120b": { temperature: 0.2 } }));
    const r = await run([...NR, "--runs", a, "--critic-model", "fireworks/gpt-oss-120b", "--reviser-model", "claude-haiku-4-5-20251001", "--settings", file, "--label", "prov3"], [verdict("accept", "V1")]);
    expect(r.code).toBe(0);
    const rec = loopJson(r.dir, "prov3");
    expect(rec.roles.critic.settings).toEqual({ temperature: 0.2, effort: null, thinking: null });
    expect(rec.roles.reviser.settings).toBeNull();
    const harness = readDistillationRecord(join(r.dir, "prov3/harness.json"));
    expect(harness.roles["critic"]?.settings).toEqual({ temperature: 0.2, effort: null, thinking: null });
  });

  it("writes the same provenance for a distillation that ended before any role ran", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "p4");
    const r = await run([...NR, "--runs", a, "--critic-model", "claude-test-critic", "--reviser-model", "claude-test-reviser", "--label", "prov4"], [], { processInfo: () => info }, new FakeNams({ failOn: ["generateSkill"] }));
    expect(r.code).toBe(1);
    const rec = loopJson(r.dir, "prov4");
    expect(rec.process).toEqual(info);
    expect(rec.recordedRuns).toHaveLength(1);
    expect(rec.recordingFormat).toBe("conversation");
  });

  it("writes the service's version into both records, and says why when the version call failed", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "v1");
    const ok = await run([...NR, "--runs", a, "--critic-model", "claude-test-critic", "--reviser-model", "claude-test-reviser", "--label", "svc"], [verdict("accept", "V1")], {}, new FakeNams({ zip: SKILL(), version: { version: "1.3.0", released: "2026-10-12", commit: "27263eb", environment: "production" } }));
    expect(ok.code).toBe(0);
    expect(loopJson(ok.dir, "svc").distiller).toEqual({ service: { name: "nams", version: "1.3.0", released: "2026-10-12", commit: "27263eb", environment: "production" } });
    expect(readDistillationRecord(join(ok.dir, "svc/harness.json")).service).toMatchObject({ name: "nams", version: "1.3.0" });
    const b = await makeRun(MIRROR, { item: "c", qty: 1 }, "v2");
    const unk = await run([...NR, "--runs", b, "--critic-model", "claude-test-critic", "--reviser-model", "claude-test-reviser", "--label", "unk"], [verdict("accept", "V1")], {}, new FakeNams({ zip: SKILL(), failOn: ["version"] }));
    expect(unk.code).toBe(0);
    expect(loopJson(unk.dir, "unk").distiller).toEqual({ service: { name: "nams", unknown: "version_unavailable" } });
  });
});

describe("the roles' prices, through the command (spec 007 FR-046, FR-048)", () => {
  const quote = (id: string) => ({ source: "market-quote" as const, openRouterId: id, fetchedAt: "2026-10-12T12:00:00.000Z", perMillion: { input: 1, output: 5 } });

  it("resolves a price for the critic's model and the reviser's before any call, hands it to the roles and records it", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "rp1");
    const asked: string[] = [];
    const r = await run([...NR, "--runs", a, "--critic-model", "claude-haiku-4-5-20251001", "--reviser-model", "fireworks/gpt-oss-120b", "--label", "prices"], [verdict("revise", "V1"), revision("T1"), verdict("accept", "V2")], {
      pricing: async (spec) => { asked.push(spec); return spec.startsWith("anthropic/") ? quote("anthropic/claude-haiku-4.5") : undefined; },
    });
    expect(r.code).toBe(0);
    expect(asked.sort()).toEqual(["anthropic/claude-haiku-4-5-20251001", "fireworks/gpt-oss-120b"]);
    expect(r.role.calls[0]?.price).toEqual(quote("anthropic/claude-haiku-4.5"));
    expect(r.role.calls[1]?.price).toBeUndefined();
    const rec = JSON.parse(readFileSync(join(r.dir, "prices/loop.json"), "utf8"));
    expect(rec.roles.critic.priceQuote).toEqual(quote("anthropic/claude-haiku-4.5"));
    expect(rec.roles.reviser.priceQuote).toBeNull();
    expect(readDistillationRecord(join(r.dir, "prices/harness.json")).roles["critic"]?.price).toEqual(quote("anthropic/claude-haiku-4.5"));
  });

  it("asks once for a model that fills both roles", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "rp2");
    const asked: string[] = [];
    const r = await run([...NR, "--runs", a, "--critic-model", "claude-haiku-4-5-20251001", "--reviser-model", "claude-haiku-4-5-20251001", "--label", "one"], [verdict("accept", "V1")], { pricing: async (spec) => { asked.push(spec); return undefined; } });
    expect(r.code).toBe(0);
    expect(asked).toEqual(["anthropic/claude-haiku-4-5-20251001"]);
  });
});

describe("distill --experiment (spec 008)", () => {
  const experiment = (set: Record<string, unknown> | undefined) => {
    const dir = mkdtempSync(join(tmpdir(), "skill-craft-dist-exp-"));
    writeFileSync(join(dir, "summary.json"), JSON.stringify(set === undefined ? { experiment: "x" } : { promptSet: set }));
    return dir;
  };

  it("refuses a rubric version that differs from the pinned one, before any call", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const r = await run([...NR, "--runs", a, "--label", "pin-bad", "--experiment", experiment({ base: "1", reviewRubric: "2" })]);
    expect(r.code).toBe(1);
    expect(r.err.join("\n")).toMatch(/review rubric version 1 differs from the experiment's 2/);
    expect(r.role.calls).toHaveLength(0);
    expect(r.nams.calls).toHaveLength(0);
  });

  it("plans when the rubric matches the pin, or the experiment pins none", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    for (const [i, set] of [{ base: "1", reviewRubric: "1" }, { base: "1" }, undefined].entries()) {
      const r = await run([...NR, "--runs", a, "--label", `pin-${i}`, "--experiment", experiment(set), "--dry-run"]);
      expect(r.code, JSON.stringify(set)).toBe(0);
    }
  });
});

describe("bespoke-one-shot through the command (spec 009, US3)", () => {
  const BE = ["--harness", "bespoke-one-shot"];
  const GOODANSWER = { name: "pair-first", description: "Try pairs of one base item first.", body: "Two of one item worked (run 001 call 2).", references: [], evidence: [{ run: "001", call: 2 }] };

  it("needs --distiller-model, and needs neither the workspace option nor a NAMS key", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const refused = await run([...BE, "--runs", a]);
    expect(refused.code).toBe(1);
    expect(refused.err.join("\n")).toContain("--distiller-model");
    const r = await run([...BE, "--runs", a, "--distiller-model", "fireworks/glm-5p3-flash", "--label", "be"], [GOODANSWER], { env: {}, nams: undefined });
    expect(r.code).toBe(0);
  });

  it("plans a dry run with the model and the prompt's version, and calls nothing", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const r = await run([...BE, "--runs", a, "--distiller-model", "fireworks/glm-5p3-flash", "--dry-run"]);
    expect(r.code).toBe(0);
    const text = r.out.join("\n");
    expect(text).toContain("harness bespoke-one-shot");
    expect(text).toContain("distiller fireworks/glm-5p3-flash; prompt distiller version 1");
    expect(text).toMatch(/nothing is sent to a store/);
    expect(r.role.calls).toHaveLength(0);
    expect(r.nams.calls).toHaveLength(0);
  });

  it("writes the skill set and the provenance record, with no workspace and no loop files", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const b = await makeRun(MIRROR, { item: "c", qty: 1 }, "b");
    const r = await run([...BE, "--runs", a, b, "--distiller-model", "fireworks/glm-5p3-flash", "--label", "bespoke", "--max-role-usd", "0.2"], [GOODANSWER]);
    expect(r.code).toBe(0);
    expect(r.out.join("\n")).toMatch(/outcome skill-set\s+1 skill\(s\): .*bespoke\/skills/);
    expect(r.role.calls).toHaveLength(1);
    expect(r.role.calls[0]!.maxUsd).toBe(0.2);
    expect(r.nams.calls).toHaveLength(0);
    const set = readSkillSet(join(r.dir, "bespoke/skills"));
    expect(set.skills.map((s) => s.name)).toEqual(["pair-first"]);
    expect(set.skills[0]!.evidence).toEqual([{ run: "001", call: 2 }]);
    const rec = readDistillationRecord(join(r.dir, "bespoke/harness.json"));
    expect(rec).toMatchObject({ outcome: "skill-set", retainedExternally: false, service: null });
    expect(rec.harness).toEqual({ name: "bespoke-one-shot", processVersion: "1" });
    expect(rec.roles["distiller"]?.requested).toBe("fireworks/glm-5p3-flash");
    expect(rec.prompts["distiller"]?.version).toBe("1");
    expect(rec.runs.map((x) => x.id)).toEqual(["001", "002"]);
    for (const f of ["workspace.json", "loop.json", "candidate", "rounds"]) expect(existsSync(join(r.dir, "bespoke", f)), f).toBe(false);
  });

  it("hands the model its pinned settings, refuses one its provider does not take before any call, and costs it from the price resolver", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const file = join(mkdtempSync(join(tmpdir(), "skill-craft-bs-")), "s.json");
    writeFileSync(file, JSON.stringify({ "fireworks/glm-5p3-flash": { temperature: 0.6 } }));
    const quote = { source: "market-quote" as const, openRouterId: "z-ai/glm-5.3-flash", fetchedAt: "2026-10-12T00:00:00.000Z", perMillion: { input: 0.02, output: 1.2 } };
    const r = await run([...BE, "--runs", a, "--distiller-model", "fireworks/glm-5p3-flash", "--settings", file, "--label", "set"], [GOODANSWER], { pricing: async () => quote });
    expect(r.code).toBe(0);
    expect(r.role.calls[0]!.settings).toEqual({ temperature: 0.6 });
    expect(r.role.calls[0]!.price).toEqual(quote);
    const bad = join(mkdtempSync(join(tmpdir(), "skill-craft-bs-")), "s.json");
    writeFileSync(bad, JSON.stringify({ "claude-sonnet-5-5": { temperature: 0 } }));
    const refused = await run([...BE, "--runs", a, "--distiller-model", "claude-sonnet-5-5", "--settings", bad]);
    expect(refused.code).toBe(1);
    expect(refused.role.calls).toHaveLength(0);
  });

  it("exits 1 with a failed outcome when the answer never passes, exits 0 for no_skill, and exits 130 on abort", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const bad = await run([...BE, "--runs", a, "--distiller-model", "m", "--label", "bad"], [{ nothing: true }]);
    expect(bad.code).toBe(1);
    expect(readDistillationRecord(join(bad.dir, "bad/harness.json"))).toMatchObject({ outcome: "failed", skills: [] });
    const cap = await run([...BE, "--runs", a, "--distiller-model", "m", "--label", "cap"], [{ fail: "DriverFailed: the role reached its spend cap" }]);
    expect(cap.code).toBe(1);
    expect(readDistillationRecord(join(cap.dir, "cap/harness.json"))).toMatchObject({ outcome: "spend_limit" });
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 30);
    const stopped = await run([...BE, "--runs", a, "--distiller-model", "m", "--label", "stop"], [{ hang: true }], { signal: ctl.signal });
    expect(stopped.code).toBe(130);
  });

  it("refuses a distiller prompt version other than the experiment's pinned one, before any call", async () => {
    const a = await makeRun(MIRROR, { item: "c", qty: 1 }, "a");
    const exp = mkdtempSync(join(tmpdir(), "skill-craft-bs-exp-"));
    writeFileSync(join(exp, "summary.json"), JSON.stringify({ promptSet: { base: "1", distiller: "2" } }));
    const r = await run([...BE, "--runs", a, "--distiller-model", "m", "--experiment", exp]);
    expect(r.code).toBe(1);
    expect(r.err.join("\n")).toMatch(/distiller prompt version 1 differs from the experiment's 2/);
    expect(r.role.calls).toHaveLength(0);
  });
});
