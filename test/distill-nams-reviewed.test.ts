// The nams-reviewed harness (spec 009, US2): today's pipeline (a managed NAMS workspace, generation, then a critic and reviser) behind the interface.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { namsReviewedHarness, type NamsReviewedConfig } from "../src/distill/harnesses/nams-reviewed.js";
import { toRunRecord } from "../src/distill/run-record.js";
import { CandidateFailed, LoopCancelled, LoopRefused, WorkspaceRefused } from "../src/harness/errors.js";
import { runExperiment } from "../src/harness/run.js";
import { obtainCandidate } from "../src/loop/candidate.js";
import { runLoop } from "../src/loop/loop.js";
import { loadRubric } from "../src/loop/rubric.js";
import { replayRun, type Recording } from "../src/loop/transcript.js";
import { FakeNams } from "./helpers/fake-nams.js";
import { fakePlayer } from "./helpers/fake-player.js";
import { fakeRole, type ScriptedAnswer } from "./helpers/fake-role.js";
import { revision, verdict } from "./helpers/loop-fixtures.js";
import { makeZip } from "./helpers/zip.js";

const MIRROR = "test/fixtures/valid/mirror-pair.json";
const GOAL = { item: "c", qty: 1 };
const SKILL = "---\nname: craft-thing\ndescription: Use when you need the thing.\n---\n\n# Thing\n\nPlace A then B.\n";
const zip = () => makeZip([{ name: "craft-thing/SKILL.md", data: SKILL }, { name: "craft-thing/references/notes.md", data: "notes\n" }]);
const live = () => new AbortController().signal;

async function made(label: string, mode: "solve" | "refuse" = "solve", id = "001"): Promise<Recording> {
  const out = mkdtempSync(join(tmpdir(), "skill-craft-nr-"));
  const { dir } = await runExperiment({ world: MIRROR, goal: GOAL, runs: 1, maxTurns: 12, out, label, driver: fakePlayer({ mode, goal: GOAL }) });
  return replayRun(join(dir, "001"), id);
}

function config(nams: FakeNams, script: ScriptedAnswer[], over: Partial<NamsReviewedConfig> = {}) {
  const role = fakeRole(script);
  const lines: string[] = [];
  const loopDir = mkdtempSync(join(tmpdir(), "skill-craft-nrdir-"));
  const c: NamsReviewedConfig = {
    nams, allowWorkspace: true, loopDir, format: "prose", out: (l) => lines.push(l), pollMs: 1, maxWaitMs: 2000, forbiddenWorkspaceIds: [],
    rubric: loadRubric(), criticModel: "fake-model", reviserModel: "fake-model", role: role.driver, maxRounds: 3, maxUsd: 0.5, goals: [GOAL], ...over,
  };
  return { c, role, lines, loopDir };
}

const TWO_ROUNDS: ScriptedAnswer[] = [verdict("revise", "V1"), revision("TEXT-1"), verdict("accept", "V2")];

describe("the same pipeline as before (SC-004)", () => {
  it("gives the skill, the rounds and the recorded conversations that obtainCandidate and runLoop gave for the same input", async () => {
    const recs = [await made("a", "solve", "001"), await made("b", "solve", "002")];
    // The old way: the candidate step, then the loop.
    const oldNams = new FakeNams({ zip: zip() });
    const oldRole = fakeRole(TWO_ROUNDS);
    const cand = await obtainCandidate({ runs: recs, format: "prose", allowWorkspace: true, nams: oldNams, loopDir: mkdtempSync(join(tmpdir(), "o-")), signal: live(), out: () => {}, pollMs: 1, maxWaitMs: 2000 });
    const oldLoop = await runLoop({ candidate: cand.pkg, recordings: recs, rubric: loadRubric(), criticModel: "fake-model", reviserModel: "fake-model", role: oldRole.driver, maxRounds: 3, maxUsd: 0.5, signal: live() });
    // The new way: the harness.
    const newNams = new FakeNams({ zip: zip() });
    const { c } = config(newNams, TWO_ROUNDS);
    const session = await namsReviewedHarness(c).open("exp", live());
    for (const r of recs) await session.record(toRunRecord(r), live());
    const result = await session.distill({ runIds: ["001", "002"] }, live());
    await session.close();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skills.skills).toHaveLength(1);
    const files = Object.fromEntries(result.skills.skills[0]!.files.map((f) => [f.path, f.content]));
    expect(files).toEqual(oldLoop.final);
    // The same rounds and verdicts.
    const review = session.describe().review!;
    expect(review.rounds.map((r) => r.overall)).toEqual(oldLoop.rounds.map((r) => r.verdict.overall));
    expect(review.outcome).toBe(oldLoop.outcome);
    // The same conversations recorded to the service, apart from the durations a run record does not carry.
    const strip = (n: FakeNams) => n.recorded.map((r) => ({ kind: r.kind, detail: r.kind === "toolCall" ? { ...(r.detail as object), durationMs: 0 } : r.detail }));
    expect(strip(newNams)).toEqual(strip(oldNams));
    expect(newNams.calls.map((c) => c.method)).toEqual(oldNams.calls.map((c) => c.method));
  });
});

describe("the safety rules of the memory service step", () => {
  it("refuses to open without the workspace option, before any account call", async () => {
    const nams = new FakeNams({ zip: zip() });
    const { c } = config(nams, []);
    await expect(namsReviewedHarness({ ...c, allowWorkspace: false }).open("exp", live())).rejects.toBeInstanceOf(LoopRefused);
    expect(nams.calls).toHaveLength(0);
  });

  it("never touches a workspace it did not create, nor the one named as forbidden", async () => {
    const nams = new FakeNams({ zip: zip(), createdId: "dev-ws" });
    const { c } = config(nams, TWO_ROUNDS, { forbiddenWorkspaceIds: ["dev-ws"] });
    await expect(namsReviewedHarness(c).open("exp", live())).rejects.toBeInstanceOf(WorkspaceRefused);
    expect(nams.touched().filter((id) => id === "dev-ws").length).toBeLessThanOrEqual(1);
  });

  it("asks the service for one skill and no more", async () => {
    const nams = new FakeNams({ zip: zip() });
    const { c } = config(nams, TWO_ROUNDS);
    const s = await namsReviewedHarness(c).open("exp", live());
    await s.record(toRunRecord(await made("a")), live());
    await s.distill({ runIds: ["001"] }, live());
    await s.close();
    expect(nams.calls.filter((x) => x.method === "generateSkill")).toHaveLength(1);
  });

  it("records a run id once", async () => {
    const nams = new FakeNams({ zip: zip() });
    const { c } = config(nams, []);
    const s = await namsReviewedHarness(c).open("exp", live());
    const run = toRunRecord(await made("a"));
    await s.record(run, live());
    await s.record(run, live());
    await s.close();
    expect(nams.recorded.filter((r) => r.kind === "conversation")).toHaveLength(1);
  });

  it("deletes the workspace on close, after success, a failed generation and a cancellation", async () => {
    // success
    const ok = new FakeNams({ zip: zip() });
    const s1 = await namsReviewedHarness(config(ok, TWO_ROUNDS).c).open("e", live());
    await s1.record(toRunRecord(await made("a")), live());
    await s1.distill({ runIds: ["001"] }, live());
    await s1.close();
    expect(ok.deleted).toEqual(ok.created);
    // a failed generation: the service reports failure
    const bad = new FakeNams({ zip: zip(), runs: [{ status: "failed", failure: "low_coverage" }] });
    const s2 = await namsReviewedHarness(config(bad, []).c).open("e", live());
    await s2.record(toRunRecord(await made("a")), live());
    const r2 = await s2.distill({ runIds: ["001"] }, live());
    expect(r2).toMatchObject({ ok: false, code: "failed" });
    await s2.close();
    expect(bad.deleted).toEqual(bad.created);
    // a cancellation
    const ctl = new AbortController();
    const cx = new FakeNams({ zip: zip() });
    const s3 = await namsReviewedHarness(config(cx, TWO_ROUNDS).c).open("e", ctl.signal);
    await s3.record(toRunRecord(await made("a")), ctl.signal);
    ctl.abort();
    expect(await s3.distill({ runIds: ["001"] }, ctl.signal)).toMatchObject({ ok: false, code: "cancelled" });
    await s3.close();
    expect(cx.deleted).toEqual(cx.created);
  });

  it("cleans up the workspace when open itself fails after creating it", async () => {
    const nams = new FakeNams({ zip: zip() });
    nams.capabilities = async () => { throw new Error("service down"); };
    await expect(namsReviewedHarness(config(nams, []).c).open("e", live())).rejects.toBeInstanceOf(CandidateFailed);
    expect(nams.deleted).toEqual(nams.created);
  });
});

describe("what distill returns (research R9)", () => {
  async function distillWith(script: ScriptedAnswer[], over: Partial<NamsReviewedConfig> = {}, nams = new FakeNams({ zip: zip() })) {
    const { c } = config(nams, script, over);
    const s = await namsReviewedHarness(c).open("e", live());
    await s.record(toRunRecord(await made("a")), live());
    const r = await s.distill({ runIds: ["001"] }, live());
    await s.close();
    return { r, s };
  }

  it("is a skill set of one when the critic accepts", async () => {
    const { r } = await distillWith([verdict("accept", "V")]);
    expect(r.ok && r.skills.skills).toHaveLength(1);
  });

  it("is no_skill when the critic rejects the skill", async () => {
    const { r } = await distillWith([verdict("reject", "V")]);
    expect(r).toMatchObject({ ok: false, code: "no_skill" });
  });

  it("is failed when a role fails, with the spend so far", async () => {
    const { r } = await distillWith([{ fail: "DriverFailed: the player reported step_timeout" }]);
    expect(r).toMatchObject({ ok: false, code: "failed" });
  });

  it("is failed when the service reports failure, and no_skill when it finishes with no skill", async () => {
    const failed = await distillWith([], {}, new FakeNams({ zip: zip(), runs: [{ status: "failed", failure: "x" }] }));
    expect(failed.r).toMatchObject({ ok: false, code: "failed" });
    const none = await distillWith([], {}, new FakeNams({ zip: zip(), runs: [{ status: "completed" }] }));
    expect(none.r).toMatchObject({ ok: false, code: "no_skill" });
  });

  it("carries the spend so far in a refusal, from the stages that were priced", async () => {
    const { r } = await distillWith([verdict("reject", "V")]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.spendUsd).toBeCloseTo(0.01, 5);
      expect(r.stages.some((s) => s.stage === "generate")).toBe(true);
    }
  });
});

describe("what describe says", () => {
  it("names the harness, the roles, the rubric, the service, the stages and the verdicts, and holds no recorded text", async () => {
    const nams = new FakeNams({ zip: zip() });
    const { c } = config(nams, TWO_ROUNDS);
    const s = await namsReviewedHarness(c).open("exp", live());
    const run = toRunRecord(await made("a"));
    await s.record(run, live());
    await s.distill({ runIds: ["001"] }, live());
    await s.close();
    const d = s.describe();
    expect(d.harness.name).toBe("nams-reviewed");
    expect(d.retainedExternally).toBe(true);
    expect(d.roles["critic"]).toMatchObject({ requested: "fake-model", resolved: ["fake-model"] });
    expect(d.roles["reviser"]).toMatchObject({ requested: "fake-model" });
    expect(d.prompts["review-rubric"]).toMatchObject({ version: "1" });
    expect(d.service).not.toBeNull();
    expect(d.stages.map((x) => x.stage)).toEqual(expect.arrayContaining(["create-workspace", "generate", "download", "critic-1", "reviser-1", "critic-2", "delete-workspace"]));
    expect(d.review!.rounds).toHaveLength(2);
    const text = JSON.stringify(d);
    for (const secret of [run.prompt, run.finalAnswer, SKILL, "TEXT-1"]) expect(text).not.toContain(secret.trim());
  });
});

