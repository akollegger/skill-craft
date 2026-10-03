import { describe, expect, it } from "vitest";
import { RevisionInvalid, VerdictInvalid } from "../src/harness/errors.js";
import { loadRubric } from "../src/loop/rubric.js";
import { parseRevision, parseVerdict, toJsonSchema, verdictSchema, withUncitedSection, type RevisionContext } from "../src/loop/verdict.js";

const rubric = loadRubric();
const answers = () => Object.fromEntries(rubric.questions.map((q) => [q.id, { value: "no", reason: "because" }]));
const verdict = (over: Record<string, unknown> = {}) => ({ overall: "revise", questions: answers(), reasons: "Needs the recipe.", proposedRevisions: ["Add the chain."], ...over });

describe("Verdict", () => {
  it("accepts a valid object", () => {
    expect(parseVerdict(rubric, verdict()).overall).toBe("revise");
  });

  it("accepts cannot_determine as a value", () => {
    const q = answers();
    q["common_knowledge"] = { value: "cannot_determine", reason: "the teacher made no exploratory calls" };
    expect(parseVerdict(rubric, verdict({ questions: q })).questions["common_knowledge"]?.value).toBe("cannot_determine");
  });

  it.each([
    ["a missing rubric id", () => { const q = answers(); delete q["generality"]; return verdict({ questions: q }); }],
    ["an extra key", () => verdict({ questions: { ...answers(), invented: { value: "x", reason: "y" } } })],
    ["an overall outside the three", () => verdict({ overall: "maybe" })],
    ["a value over 40 characters", () => verdict({ questions: { ...answers(), generality: { value: "v".repeat(41), reason: "r" } } })],
    ["a reason over 400", () => verdict({ questions: { ...answers(), generality: { value: "v", reason: "r".repeat(401) } } })],
    ["reasons over 800", () => verdict({ reasons: "r".repeat(801) })],
    ["more than 10 revisions", () => verdict({ proposedRevisions: Array.from({ length: 11 }, () => "x") })],
    ["a revision over 300", () => verdict({ proposedRevisions: ["x".repeat(301)] })],
    ["an extra top-level field", () => verdict({ extra: 1 })],
    ["not an object", () => "revise"],
  ])("rejects %s with a fixed message that holds none of the input", (_why, make) => {
    try {
      parseVerdict(rubric, make());
      throw new Error("did not throw");
    } catch (e) {
      expect(e).toBeInstanceOf(VerdictInvalid);
      expect((e as Error).message).toBe("the critic's answer does not match the verdict schema");
    }
  });

  it("gives the SDK a JSON Schema whose question keys are the rubric's ids", () => {
    const js = toJsonSchema(verdictSchema(rubric)) as any;
    expect(Object.keys(js.properties.questions.properties).sort()).toEqual(rubric.questions.map((q) => q.id).sort());
    expect(js.properties.overall.enum).toEqual(["accept", "revise", "reject"]);
  });
});

const SKILL = "---\nname: craft-thing\ndescription: Use when you need the thing.\n---\n\n# Thing\n\nPlace A then B.\n";
const ctx: RevisionContext = { candidateName: "craft-thing", runs: [{ label: "001", callCount: 13 }, { label: "002", callCount: 13 }] };
const rev = (over: Record<string, unknown> = {}) => ({
  skillMd: SKILL,
  provenanceMd: "# Where each fact comes from\n\n- chain: run 001 calls 3-13\n",
  changes: [{ what: "Added the chain", why: "The skill had no recipe", sourceCalls: ["run 001 call 12"] }],
  ...over,
});

describe("Revision", () => {
  it("accepts a valid object", () => {
    expect(parseRevision(rev(), ctx).changes).toHaveLength(1);
  });

  it.each([
    ["a changed name", () => rev({ skillMd: SKILL.replace("craft-thing", "other-thing") })],
    ["no description", () => rev({ skillMd: "---\nname: craft-thing\n---\n\n# Thing\n\nbody\n" })],
    ["an empty body", () => rev({ skillMd: "---\nname: craft-thing\ndescription: d\n---\n" })],
    ["a citation in SKILL.md", () => rev({ skillMd: SKILL + "\nSource: run 001 call 4.\n" })],
    ["empty provenance", () => rev({ provenanceMd: "" })],
    ["a source in a run that is not in the loop", () => rev({ changes: [{ what: "w", why: "y", sourceCalls: ["run 009 call 1"] }] })],
    ["a source beyond the run's last call", () => rev({ changes: [{ what: "w", why: "y", sourceCalls: ["run 001 call 14"] }] })],
    ["a source at call 0", () => rev({ changes: [{ what: "w", why: "y", sourceCalls: ["run 001 call 0"] }] })],
    ["a malformed source", () => rev({ changes: [{ what: "w", why: "y", sourceCalls: ["the thirteenth call"] }] })],
    ["too many changes", () => rev({ changes: Array.from({ length: 31 }, () => ({ what: "w", why: "y", sourceCalls: [] })) })],
    ["an extra field", () => rev({ extra: true })],
  ])("rejects %s with a fixed message", (_why, make) => {
    try {
      parseRevision(make(), ctx);
      throw new Error("did not throw");
    } catch (e) {
      expect(e).toBeInstanceOf(RevisionInvalid);
      expect((e as Error).message).toBe("the reviser's answer is not a valid revision");
    }
  });

  it("accepts a change with no source", () => {
    expect(() => parseRevision(rev({ changes: [{ what: "w", why: "y", sourceCalls: [] }] }), ctx)).not.toThrow();
  });
});

describe("withUncitedSection", () => {
  it("leaves the provenance text alone when every change has a source", () => {
    const text = "# P\n\n- a\n";
    expect(withUncitedSection(text, [{ what: "w", why: "y", sourceCalls: ["run 001 call 1"] }])).toBe(text);
  });

  it("appends an Uncited changes section below the reviser's text, listing each change with no source", () => {
    const out = withUncitedSection("# P\n\n- a\n", [
      { what: "Added step three", why: "tidier", sourceCalls: [] },
      { what: "Sourced", why: "y", sourceCalls: ["run 001 call 2"] },
    ]);
    expect(out.startsWith("# P\n\n- a\n")).toBe(true);
    expect(out).toContain("## Uncited changes");
    expect(out).toContain("Added step three");
    expect(out).not.toContain("Sourced");
  });
});
