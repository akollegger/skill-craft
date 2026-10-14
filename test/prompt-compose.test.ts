// Composing the text a run sends and the record of it (spec 008, FR-002 to FR-005, FR-009, FR-020).
import { describe, expect, it } from "vitest";
import { PromptRefused } from "../src/harness/errors.js";
import { composePrompt } from "../src/prompts/compose.js";
import { fingerprint, loadVersion } from "../src/prompts/index.js";

const GOAL = { item: "c", qty: 1 };
const NOTE = "A skill for this kind of task is available; load it before exploring.";

describe("composePrompt", () => {
  it("fills version 1 and records a step budget and both fingerprints", () => {
    const c = composePrompt({ goal: GOAL, maxTurns: 12 });
    expect(c.text).toContain("Your goal: end up holding one c.");
    expect(c.text).toContain("your budget of 12 turns is used up.");
    expect(c.version).toBe("1");
    expect(c.budget).toEqual({ kind: "steps", limit: 12 });
    expect(c.baseSha256).toBe(loadVersion("base", "1").sha256); // the template's fingerprint, the same as the listing shows
    expect(c.sha256).toBe(fingerprint(c.text));
    expect(c.armSentence).toBeUndefined();
  });

  it("gives two goals, and two budgets, the same base fingerprint and different full ones (the report compares arms on the base)", () => {
    const a = composePrompt({ goal: { item: "glirol", qty: 1 }, maxTurns: 40 });
    const b = composePrompt({ goal: { item: "wooden_stool", qty: 1 }, maxTurns: 80 });
    expect(a.baseSha256).toBe(b.baseSha256);
    expect(a.sha256).not.toBe(b.sha256);
    const v2a = composePrompt({ goal: { item: "glirol", qty: 1 }, maxTurns: 100, callBudget: 100, version: "2" });
    const v2b = composePrompt({ goal: { item: "wooden_stool", qty: 3 }, maxTurns: 150, callBudget: 150, version: "2" });
    expect(v2a.baseSha256).toBe(v2b.baseSha256);
    expect(v2a.baseSha256).not.toBe(a.baseSha256); // another version is another base
  });

  it("states a quantity above one", () => {
    expect(composePrompt({ goal: { item: "x", qty: 3 }, maxTurns: 5 }).text).toContain("3 of x");
  });

  it("appends the arm sentence on its own line, keeps the base hash, and changes the full hash", () => {
    const plain = composePrompt({ goal: GOAL, maxTurns: 12 });
    const withNote = composePrompt({ goal: GOAL, maxTurns: 12, armSentenceVersion: "1" });
    expect(withNote.text).toBe(`${plain.text}\n${NOTE}`);
    expect(withNote.baseSha256).toBe(plain.baseSha256);
    expect(withNote.sha256).toBe(fingerprint(withNote.text));
    expect(withNote.sha256).not.toBe(plain.sha256);
    expect(withNote.armSentence).toEqual({ version: "1", sha256: loadVersion("arm-sentence", "1").sha256 });
  });

  it("records a free-text sentence as custom", () => {
    const c = composePrompt({ goal: GOAL, maxTurns: 12, note: "Do it." });
    expect(c.text.endsWith("\nDo it.")).toBe(true);
    expect(c.armSentence).toEqual({ version: "custom", sha256: fingerprint("Do it.") });
  });

  it("refuses two ways to give the sentence", () => {
    expect(() => composePrompt({ goal: GOAL, maxTurns: 12, note: "x", armSentenceVersion: "1" })).toThrow(PromptRefused);
  });

  it("records an ad hoc template as custom, with {turns} meaning steps", () => {
    const c = composePrompt({ goal: GOAL, maxTurns: 7, template: "Hold {what} ({item}) in {turns}.\n" });
    expect(c.text).toBe("Hold one c (c) in 7.");
    expect(c.version).toBe("custom");
    expect(c.budget).toEqual({ kind: "steps", limit: 7 });
  });

  it("refuses an ad hoc template with an unknown placeholder or without {what}, and one with both budgets (FR-003)", () => {
    expect(() => composePrompt({ goal: GOAL, maxTurns: 7, template: "Hold {what} {bogus}" })).toThrow(/bogus/);
    expect(() => composePrompt({ goal: GOAL, maxTurns: 7, template: "Hold it" })).toThrow(/\{what\}/);
    expect(() => composePrompt({ goal: GOAL, maxTurns: 7, template: "{what} {turns} {budget}" })).toThrow(/both/);
  });

  it("refuses an unknown version", () => {
    expect(() => composePrompt({ goal: GOAL, maxTurns: 7, version: "99" })).toThrow(PromptRefused);
  });

  it("uses a call budget with a {budget} prompt, and refuses the mismatched meanings (FR-009)", () => {
    const c = composePrompt({ goal: GOAL, maxTurns: 100, callBudget: 100, template: "Hold {what} with {budget} calls." });
    expect(c.text).toBe("Hold one c with 100 calls.");
    expect(c.budget).toEqual({ kind: "calls", limit: 100 });
    expect(() => composePrompt({ goal: GOAL, maxTurns: 100, template: "Hold {what} with {budget} calls." })).toThrow(/call budget/);
    expect(() => composePrompt({ goal: GOAL, maxTurns: 100, callBudget: 100 })).toThrow(/step budget/);
  });
});
