import { describe, expect, it } from "vitest";
import { runLoop, type LoopInput } from "../src/loop/loop.js";
import { skillSha256 } from "../src/loop/package.js";
import { candidate, recording, revision, rubric, verdict } from "./helpers/loop-fixtures.js";
import { fakeRole, type ScriptedAnswer } from "./helpers/fake-role.js";

const recs = [recording("001", 13), recording("002", 13)];

function input(script: ScriptedAnswer[], over: Partial<LoopInput> = {}) {
  const role = fakeRole(script);
  const base: LoopInput = {
    candidate: candidate(),
    recordings: recs,
    rubric,
    criticModel: "claude-test-critic",
    reviserModel: "claude-test-reviser",
    role: role.driver,
    maxRounds: 3,
    maxUsd: 0.5,
    signal: new AbortController().signal,
    now: (() => { let t = 0; return () => (t += 10); })(),
    ...over,
  };
  return { base, role };
}

describe("round control", () => {
  it("accepts in round 1 and leaves the skill unchanged", async () => {
    const { base, role } = input([verdict("accept", "A")]);
    const r = await runLoop(base);
    expect(r).toMatchObject({ outcome: "accept", failed: false, cancelled: false });
    expect(r.rounds).toHaveLength(1);
    expect(r.rounds[0]!.revision).toBeUndefined();
    expect(r.final).toEqual(base.candidate);
    expect(role.calls).toHaveLength(1);
  });

  it("revises twice and accepts in round 3 with the revised text", async () => {
    const { base, role } = input([verdict("revise", "V1"), revision("TEXT-1"), verdict("revise", "V2"), revision("TEXT-2"), verdict("accept", "V3")]);
    const r = await runLoop(base);
    expect(r.outcome).toBe("accept");
    expect(r.rounds.map((x) => x.verdict.overall)).toEqual(["revise", "revise", "accept"]);
    expect(r.rounds.filter((x) => x.revision)).toHaveLength(2);
    expect(r.final?.["SKILL.md"]).toContain("TEXT-2");
    expect(r.rounds[2]!.skillSha256).toBe(skillSha256(r.final!));
    expect(r.rounds[0]!.revision!.revisedSha256).toBe(r.rounds[1]!.skillSha256);
    expect(role.calls).toHaveLength(5);
  });

  it("ends in reject, 'round limit reached', when all three rounds say revise, and does not act on the third", async () => {
    const { base, role } = input([verdict("revise", "V1"), revision("T1"), verdict("revise", "V2"), revision("T2"), verdict("revise", "V3")]);
    const r = await runLoop(base);
    expect(r).toMatchObject({ outcome: "reject", reason: "round limit reached", failed: false });
    expect(r.rounds).toHaveLength(3);
    expect(r.rounds[2]!.revision).toBeUndefined();
    expect(r.final).toBeUndefined();
    expect(role.calls).toHaveLength(5);
  });

  it("honours --max-rounds below 3", async () => {
    const { base, role } = input([verdict("revise", "V1")], { maxRounds: 1 });
    const r = await runLoop(base);
    expect(r).toMatchObject({ outcome: "reject", reason: "round limit reached" });
    expect(role.calls).toHaveLength(1);
  });

  it("ends at once on reject with the critic's reasons", async () => {
    const { base, role } = input([verdict("reject", "R")]);
    const r = await runLoop(base);
    expect(r).toMatchObject({ outcome: "reject", failed: false });
    // The reason is fixed text; what the critic said lives only in the round's verdict.
    expect(r.reason).toBe("the critic rejected the skill");
    expect(JSON.stringify({ ...r, rounds: undefined })).not.toContain("Overall R");
    expect(role.calls).toHaveLength(1);
  });
});

describe("a fresh critic each round", () => {
  it("builds each prompt from the current skill alone: round 3 holds nothing from rounds 1 and 2", async () => {
    const { base, role } = input([verdict("revise", "MARK-V1"), revision("MARK-T1"), verdict("revise", "MARK-V2"), revision("MARK-T2"), verdict("accept", "MARK-V3")]);
    await runLoop(base);
    const [c1, r1, c2, r2, c3] = role.calls;
    expect(c1!.prompt).toContain("OLD-TEXT-0");
    expect(c3!.prompt).toContain("MARK-T2");
    for (const old of ["MARK-V1", "MARK-V2", "MARK-T1", "OLD-TEXT-0"]) expect(c3!.prompt + c3!.system).not.toContain(old);
    expect(c2!.prompt).not.toContain("MARK-V1");
    // The reviser sees the current verdict and no other.
    expect(r2!.prompt).toContain("MARK-V2");
    expect(r2!.prompt).not.toContain("MARK-V1");
    expect(r1!.prompt).toContain("MARK-V1");
    // Each call is pinned to its own role's model and carries the spend cap.
    expect([c1, c2, c3].every((c) => c!.model === "claude-test-critic")).toBe(true);
    expect([r1, r2].every((c) => c!.model === "claude-test-reviser")).toBe(true);
    expect(role.calls.every((c) => c.maxUsd === 0.5)).toBe(true);
  });
});

describe("failures", () => {
  it("stops with VerdictInvalid and no agent text in the reason", async () => {
    const { base } = input([{ overall: "maybe", secret: "AGENT-TEXT-MARK" }]);
    const r = await runLoop(base);
    expect(r).toMatchObject({ outcome: "reject", failed: true });
    expect(r.reason).toBe("VerdictInvalid: the critic's answer does not match the verdict schema");
    expect(JSON.stringify(r)).not.toContain("AGENT-TEXT-MARK");
  });

  it.each([
    ["a changed name", revision("T").skillMd.replace("craft-thing", "other-name")],
    ["a citation in SKILL.md", `${revision("T").skillMd}\nSource: run 001 call 4.\n`],
  ])("ends the round as RevisionInvalid, not as a revise, for %s", async (_why, skillMd) => {
    const { base } = input([verdict("revise", "V1"), { ...revision("T"), skillMd }]);
    const r = await runLoop(base);
    expect(r).toMatchObject({ outcome: "reject", failed: true });
    expect(r.reason).toBe("RevisionInvalid: the reviser's answer is not a valid revision");
    expect(r.rounds).toHaveLength(1);
  });

  it("ends the round as RevisionInvalid when a revision cites a call that does not exist", async () => {
    const { base } = input([verdict("revise", "V1"), revision("T", ["run 001 call 99"])]);
    expect((await runLoop(base)).reason).toMatch(/^RevisionInvalid:/);
  });

  it("adds the Uncited changes section for a change with no source", async () => {
    const { base } = input([verdict("revise", "V1"), revision("T", []), verdict("accept", "V2")]);
    const r = await runLoop(base);
    expect(r.outcome).toBe("accept");
    expect(r.final?.["references/provenance.md"]).toContain("## Uncited changes");
  });

  it("stops with a role's own fixed reason, and when a call reaches its spend cap, keeps the finished rounds", async () => {
    const { base } = input([verdict("revise", "V1"), revision("T1"), { fail: "DriverFailed: the role reached its spend cap" }]);
    const r = await runLoop(base);
    expect(r).toMatchObject({ outcome: "reject", failed: true });
    expect(r.reason).toBe("RoleFailed: a role call failed: DriverFailed: the role reached its spend cap");
    expect(r.rounds).toHaveLength(1);
  });

  it("returns the finished rounds, cancelled, when aborted between rounds", async () => {
    const ctl = new AbortController();
    const { base } = input([() => { ctl.abort(); return verdict("revise", "V1"); }, revision("T1")], { signal: ctl.signal });
    const r = await runLoop(base);
    expect(r).toMatchObject({ outcome: "reject", cancelled: true });
    expect(r.rounds).toHaveLength(1);
    expect(r.reason).toBe("LoopCancelled: the loop was cancelled");
  });

  it("records a stage for each role call, with null for figures the player did not report", async () => {
    const role = fakeRole([verdict("accept", "A")], { tokens: { input: null, output: null, cacheRead: null, cacheCreation: null }, costUsd: null });
    const r = await runLoop({ ...input([]).base, role: role.driver });
    expect(r.stages).toHaveLength(1);
    expect(r.stages[0]).toMatchObject({ stage: "critic-1", model: { requested: "claude-test-critic" }, costUsd: null });
    expect(r.stages[0]!.tokens.input).toBeNull();
    expect(r.stages[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });
});
