import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LoopRefused, SkillNotFound } from "../src/harness/errors.js";
import { REPO } from "../src/harness/paths.js";
import { installSkill } from "../src/harness/skill.js";
import { runLoop, type LoopInput, type LoopResult } from "../src/loop/loop.js";
import { hasCitation, readPackage, skillSha256 } from "../src/loop/package.js";
import { createLoopFolder, writeLoopRecord, type RecordOptions } from "../src/loop/record.js";
import { fakeRole, type ScriptedAnswer } from "./helpers/fake-role.js";
import { candidate, recording, revision, rubric, verdict } from "./helpers/loop-fixtures.js";

const tmp = () => mkdtempSync(join(tmpdir(), "skill-craft-record-"));

async function loop(script: ScriptedAnswer[], over: Partial<LoopInput> = {}): Promise<LoopResult> {
  return runLoop({
    candidate: candidate(),
    recordings: [recording("001", 13), recording("002", 13)],
    rubric,
    criticModel: "claude-test-critic",
    reviserModel: "claude-test-reviser",
    role: fakeRole(script).driver,
    maxRounds: 3,
    maxUsd: 1,
    signal: new AbortController().signal,
    now: (() => { let t = 1_000; return () => (t += 7); })(),
    ...over,
  });
}

const opts = (dir: string, over: Partial<RecordOptions> = {}): RecordOptions => ({
  dir,
  label: "demo",
  mode: "candidate",
  runs: [join(REPO, "runs/faithful-1-t0-stone/001"), join(REPO, "runs/faithful-1-t0-stone/002")],
  models: { critic: "claude-test-critic", reviser: "claude-test-reviser" },
  ...over,
});

function filesUnder(root: string, rel = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
    const path = rel === "" ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) Object.assign(out, filesUnder(root, path));
    else out[path] = readFileSync(join(root, path), "utf8");
  }
  return out;
}

describe("the loop record", () => {
  it("writes the layout in contracts/loop-record.md for a loop that revised once and accepted", async () => {
    const r = await loop([verdict("revise", "V1"), revision("TEXT-1"), verdict("accept", "V2")]);
    const dir = createLoopFolder(tmp(), "demo", []);
    writeLoopRecord(r, opts(dir));
    const files = Object.keys(filesUnder(dir)).sort();
    // Round 1 reviewed the candidate, which has no provenance file; round 2 reviewed the revision, which has one.
    expect(files).toEqual(
      ["loop.json", "rounds/01/diff.patch", "rounds/01/revision.json", "rounds/01/reviewed-skill.txt", "rounds/01/verdict.json", "rounds/02/provenance.md", "rounds/02/reviewed-skill.txt", "rounds/02/verdict.json", "skill/SKILL.md", "skill/references/provenance.md"].sort(),
    );
    const loopJson = JSON.parse(readFileSync(join(dir, "loop.json"), "utf8"));
    expect(loopJson).toMatchObject({
      label: "demo",
      mode: "candidate",
      outcome: "accept",
      rubric: { version: rubric.version, sha256: rubric.sha256 },
      models: { critic: { requested: "claude-test-critic" }, reviser: { requested: "claude-test-reviser" } },
      cancelled: false,
    });
    expect(loopJson.rounds.map((x: any) => x.overall)).toEqual(["revise", "accept"]);
  });

  it("hashes each round's text, and the accepted skill hashes to the last round's", async () => {
    const r = await loop([verdict("revise", "V1"), revision("TEXT-1"), verdict("accept", "V2")]);
    const dir = createLoopFolder(tmp(), "demo", []);
    writeLoopRecord(r, opts(dir));
    const loopJson = JSON.parse(readFileSync(join(dir, "loop.json"), "utf8"));
    const { createHash } = await import("node:crypto");
    for (const x of loopJson.rounds) {
      const text = readFileSync(join(dir, `rounds/${String(x.n).padStart(2, "0")}/reviewed-skill.txt`), "utf8");
      expect(createHash("sha256").update(text).digest("hex")).toBe(x.skillSha256);
    }
    expect(loopJson.rounds[0].revisedSha256).toBe(loopJson.rounds[1].skillSha256);
    expect(skillSha256(readPackage(join(dir, "skill")))).toBe(loopJson.rounds.at(-1).skillSha256);
  });

  it("keeps timestamps out of the per-round files, and nulls (not zeros) in the stage figures", async () => {
    const role = fakeRole([verdict("accept", "A")], { tokens: { input: null, output: null, cacheRead: null, cacheCreation: null }, costUsd: null });
    const r = await loop([], { role: role.driver });
    const dir = createLoopFolder(tmp(), "demo", []);
    writeLoopRecord(r, opts(dir));
    for (const [path, text] of Object.entries(filesUnder(dir, "rounds"))) expect(text, path).not.toMatch(/\b1\d{12}\b|\d{4}-\d{2}-\d{2}T/);
    const loopJson = JSON.parse(readFileSync(join(dir, "loop.json"), "utf8"));
    expect(loopJson.stages[0]).toMatchObject({ stage: "critic-1", costUsd: null, tokens: { input: null, output: null, cacheRead: null, cacheCreation: null } });
  });

  it("records run paths relative to the repository, with no user name", async () => {
    const r = await loop([verdict("accept", "A")]);
    const dir = createLoopFolder(tmp(), "demo", []);
    writeLoopRecord(r, opts(dir));
    const text = readFileSync(join(dir, "loop.json"), "utf8");
    expect(JSON.parse(text).runs).toEqual(["runs/faithful-1-t0-stone/001", "runs/faithful-1-t0-stone/002"]);
    expect(text).not.toContain(homedir());
  });

  it("writes skill/ only when the outcome is accept, and names round snapshots reviewed-skill.txt so no round can be installed, even on a case-insensitive filesystem", async () => {
    const accepted = await loop([verdict("revise", "V1"), revision("TEXT-1"), verdict("accept", "V2")]);
    const dirA = createLoopFolder(tmp(), "a", []);
    writeLoopRecord(accepted, opts(dirA));
    expect(existsSync(join(dirA, "skill/SKILL.md"))).toBe(true);
    expect(() => installSkill(tmp(), join(dirA, "rounds/01"))).toThrow(SkillNotFound);
    expect(installSkill(tmp(), join(dirA, "skill")).sha256).toBe(skillSha256(accepted.final!));

    const rejected = await loop([verdict("reject", "R")]);
    const dirR = createLoopFolder(tmp(), "r", []);
    writeLoopRecord(rejected, opts(dirR));
    expect(existsSync(join(dirR, "skill"))).toBe(false);
    expect(JSON.parse(readFileSync(join(dirR, "loop.json"), "utf8"))).toMatchObject({ outcome: "reject", reason: "the critic rejected the skill" });
  });

  it("keeps citations out of the accepted SKILL.md, and in provenance with the recorded call or the uncited section", async () => {
    const r = await loop([verdict("revise", "V1"), { ...revision("TEXT-1", ["run 001 call 2"]), changes: [{ what: "Sourced fact", why: "y", sourceCalls: ["run 001 call 2"] }, { what: "Unsourced tidy-up", why: "z", sourceCalls: [] }] }, verdict("accept", "V2")]);
    const dir = createLoopFolder(tmp(), "demo", []);
    writeLoopRecord(r, opts(dir));
    expect(hasCitation(readFileSync(join(dir, "skill/SKILL.md"), "utf8"))).toBe(false);
    const prov = readFileSync(join(dir, "skill/references/provenance.md"), "utf8");
    expect(prov).toContain("run 001 call 2");
    expect(prov).toContain("## Uncited changes");
    expect(prov).toContain("Unsourced tidy-up");
    const rev = JSON.parse(readFileSync(join(dir, "rounds/01/revision.json"), "utf8"));
    expect(rev.changes[0].sourceCalls).toEqual(["run 001 call 2"]);
  });

  it("records the diff from the text reviewed to the text produced", async () => {
    const r = await loop([verdict("revise", "V1"), revision("TEXT-1"), verdict("accept", "V2")]);
    const dir = createLoopFolder(tmp(), "demo", []);
    writeLoopRecord(r, opts(dir));
    const diff = readFileSync(join(dir, "rounds/01/diff.patch"), "utf8");
    expect(diff).toContain("--- round-1/SKILL.md");
    expect(diff).toContain("+++ round-2/SKILL.md");
    expect(diff).toContain("-");
    expect(diff).toContain("+Place A, then B. TEXT-1");
  });

  it("refuses an existing label and a folder inside a run it read, and writes nothing into a run folder", async () => {
    const out = tmp();
    createLoopFolder(out, "demo", []);
    expect(() => createLoopFolder(out, "demo", [])).toThrow(LoopRefused);
    const run = join(tmp(), "run1");
    mkdirSync(run);
    writeFileSync(join(run, "score.json"), "{}");
    expect(() => createLoopFolder(run, "inside", [run])).toThrow(LoopRefused);
    expect(readdirSync(run)).toEqual(["score.json"]);
    expect(resolve(out)).not.toBe(run);
  });

  it("records a failed or cancelled loop's finished rounds with its fixed reason", async () => {
    const r = await loop([verdict("revise", "V1"), revision("T1"), { overall: "maybe" }]);
    const dir = createLoopFolder(tmp(), "demo", []);
    writeLoopRecord(r, opts(dir));
    const loopJson = JSON.parse(readFileSync(join(dir, "loop.json"), "utf8"));
    expect(loopJson).toMatchObject({ outcome: "reject", failed: true, reason: "VerdictInvalid: the critic's answer does not match the verdict schema" });
    expect(loopJson.rounds).toHaveLength(1);
  });
});

describe("run paths outside the repository", () => {
  it("are recorded by name only, never as an absolute path", async () => {
    const outside = join(mkdtempSync(join(tmpdir(), "skill-craft-ext-")), "my-run-001");
    const r = await loop([verdict("accept", "A")]);
    const dir = createLoopFolder(tmp(), "ext", []);
    writeLoopRecord(r, opts(dir, { runs: [outside, join(REPO, "runs/faithful-1-t0-stone/001")] }));
    const loopJson = JSON.parse(readFileSync(join(dir, "loop.json"), "utf8"));
    expect(loopJson.runs).toEqual(["(outside the repository)/my-run-001", "runs/faithful-1-t0-stone/001"]);
    expect(readFileSync(join(dir, "loop.json"), "utf8")).not.toContain(tmpdir());
  });
});
