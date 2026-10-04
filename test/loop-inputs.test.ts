import { describe, expect, it } from "vitest";
import { LoopRefused } from "../src/harness/errors.js";
import { criticPrompt, checkSizes, reviserPrompt } from "../src/loop/inputs.js";
import { LIMITS } from "../src/loop/package.js";
import { recordingText } from "../src/loop/transcript.js";
import { candidate, recording, rubric, verdict } from "./helpers/loop-fixtures.js";

const recs = [recording("001"), recording("002")];
const goals = [{ item: "thing", qty: 1 }];
const base = { rubric, goals, recordings: recs, pkg: candidate("CURRENT-TEXT") };
const all = (p: { system: string; prompt: string }) => `${p.system}\n${p.prompt}`;

describe("the critic's prompt", () => {
  const p = criticPrompt(base);

  it("holds the rubric, the goals, the recordings and the current package", () => {
    const t = all(p);
    expect(t).toContain(`version ${rubric.version}`);
    for (const q of rubric.questions) expect(t).toContain(q.text);
    expect(t).toContain("thing x1");
    for (const r of recs) expect(t).toContain(recordingText(r));
    expect(t).toContain("CURRENT-TEXT");
    expect(t).toContain("references/domain.md");
    expect(p.system).toBe(rubric.criticInstructions);
  });

  it("holds nothing from outside those inputs: no path, no world field, no earlier verdict", () => {
    const t = all(p);
    expect(t).not.toContain("worlds/");
    expect(t).not.toContain("runs/x");
    expect(t).not.toMatch(/reason V|Overall V/);
  });

  it("is built fresh from its inputs: the same inputs give the same prompt, and a changed package changes it", () => {
    expect(criticPrompt(base)).toEqual(p);
    expect(criticPrompt({ ...base, pkg: candidate("OTHER-TEXT") }).prompt).not.toContain("CURRENT-TEXT");
  });

  it("detects a forbidden string added to an input source (positive control)", () => {
    const leaked = criticPrompt({ ...base, pkg: { ...base.pkg, "references/leak.md": "RECIPE: 2x A makes B" } });
    expect(all(leaked)).toContain("RECIPE: 2x A makes B");
    expect(all(p)).not.toContain("RECIPE: 2x A makes B");
  });
});

describe("the reviser's prompt", () => {
  const v = verdict("revise", "CURRENT-VERDICT");

  it("is the critic's inputs plus only the current verdict, under the reviser's own instructions", () => {
    const p = reviserPrompt({ ...base, verdict: v as never });
    expect(p.system).toBe(rubric.reviserInstructions);
    expect(p.prompt).toContain("CURRENT-TEXT");
    expect(p.prompt).toContain("reason CURRENT-VERDICT");
    expect(p.prompt).toContain("Add the chain CURRENT-VERDICT.");
    expect(p.prompt).not.toContain("worlds/");
  });

  it("states each of the seven rules, through the instructions it is given", () => {
    const p = reviserPrompt({ ...base, verdict: v as never });
    for (const phrase of ["run NNN call N", "not known", "Lead SKILL.md", "provenance file", "generic advice", "description", "outside the recordings"]) {
      expect(p.system.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });
});

describe("size limits", () => {
  it("refuses recordings over 150,000 characters and names the limit", () => {
    const big = { ...recording("001"), finalAnswer: "x".repeat(LIMITS.recordingsChars) };
    expect(() => checkSizes([big], candidate())).toThrow(LoopRefused);
    expect(() => checkSizes([big], candidate())).toThrow(/150,000/);
  });

  it("passes a normal set", () => {
    expect(() => checkSizes(recs, candidate())).not.toThrow();
  });
});
