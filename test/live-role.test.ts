/**
 * Runs one real role call through the Claude Agent SDK. It spends real Claude usage, so it only runs with LIVE_SDK=1:
 *   LIVE_SDK=1 pnpm vitest run test/live-role.test.ts
 */
import { describe, expect, it } from "vitest";
import { sdkRoleDriver } from "../src/harness/sdk-driver.js";
import { loadRubric } from "../src/loop/rubric.js";
import { parseRevision, parseVerdict, revisionSchema, toJsonSchema, verdictSchema } from "../src/loop/verdict.js";
import { criticPrompt, reviserPrompt } from "../src/loop/inputs.js";
import { candidate, recording } from "./helpers/loop-fixtures.js";

const live = process.env["LIVE_SDK"] === "1";
const MODEL = process.env["LIVE_ROLE_MODEL"] ?? "claude-haiku-4-5-20251001";

describe.skipIf(!live)("a real role call", () => {
  it("returns a schema-valid answer, with tokens and cost reported", async () => {
    const r = await sdkRoleDriver({
      prompt: "Reply with the number 7 and the word seven.",
      model: MODEL,
      schema: { type: "object", properties: { n: { type: "number" }, word: { type: "string" } }, required: ["n", "word"], additionalProperties: false },
      maxUsd: 0.25,
      signal: new AbortController().signal,
    });
    expect(r.ok).toBe(true);
    expect(r.answer).toMatchObject({ n: 7 });
    expect(r.requestedModel).toBe(MODEL);
    expect(r.costUsd === null || r.costUsd > 0).toBe(true);
  }, 120_000);

  it("a critic call over a small recording returns a verdict that parses against the rubric", async () => {
    const rubric = loadRubric();
    const p = criticPrompt({ rubric, goals: [{ item: "thing", qty: 1 }], recordings: [recording("001")], pkg: candidate() });
    const r = await sdkRoleDriver({ ...p, model: MODEL, schema: toJsonSchema(verdictSchema(rubric)), maxUsd: 0.5, signal: new AbortController().signal });
    expect(r.ok).toBe(true);
    expect(() => parseVerdict(rubric, r.answer)).not.toThrow();
  }, 180_000);

  it("a reviser call returns a revision that passes the mechanical checks", async () => {
    const rubric = loadRubric();
    const recs = [recording("001")];
    const pkg = candidate();
    const verdict = parseVerdict(rubric, {
      overall: "revise",
      questions: Object.fromEntries(rubric.questions.map((q) => [q.id, { value: "no", reason: "The skill has no recipe." }])),
      reasons: "Add the recorded chain.",
      proposedRevisions: ["Lead with the chain of placements and the craft."],
    });
    const ctx = { candidateName: "craft-thing", runs: [{ label: "001", callCount: 4 }] };
    const p = reviserPrompt({ rubric, goals: [{ item: "thing", qty: 1 }], recordings: recs, pkg, verdict });
    const r = await sdkRoleDriver({ ...p, model: MODEL, schema: toJsonSchema(revisionSchema(ctx)), maxUsd: 0.5, signal: new AbortController().signal });
    expect(r.ok).toBe(true);
    expect(() => parseRevision(r.answer, ctx)).not.toThrow();
  }, 180_000);
});
