/**
 * Live check (spec 007, FR-012): a thinking model as a role under a small spend cap. The cap sets an output ceiling, and a
 * thinking model's reasoning counts against it, so the answer can be cut off. Whatever happens, the role must return either a
 * complete answer or a fixed failure reason, never a partial answer. Runs only with LIVE_SDK=1 and ANTHROPIC_API_KEY:
 *   LIVE_SDK=1 pnpm vitest run test/live-thinking-role.test.ts
 */
import { describe, expect, it } from "vitest";
import { aiRoleDriver } from "../src/harness/ai-driver.js";
import { skipUnlessKey, writeCheckRecord } from "./helpers/live.js";

const MODEL = "anthropic/claude-opus-5-5";
const SCHEMA = { type: "object", properties: { n: { type: "number" }, why: { type: "string" } }, required: ["n", "why"], additionalProperties: false };
const FIXED = ["DriverFailed: the role reached its spend cap", "DriverFailed: the role reached its output limit", "DriverFailed: the role could not give the requested format"];

describe.skipIf(skipUnlessKey("ANTHROPIC_API_KEY"))("a thinking model as a role under a small cap", () => {
  it("returns a complete schema-valid answer or a fixed failure reason, never a partial answer", async () => {
    // A cap of about 2 cents is an output ceiling near 1000 tokens at Opus 5.5's output price.
    const r = await aiRoleDriver({
      prompt: "Think it through, then answer: what is the sum of the first 40 prime numbers? Give n as that sum and why as one sentence.",
      model: MODEL,
      schema: SCHEMA,
      maxUsd: 0.02,
      signal: new AbortController().signal,
    });
    if (r.ok) {
      const a = r.answer as { n: unknown; why: unknown };
      expect(typeof a.n).toBe("number");
      expect(typeof a.why).toBe("string");
    } else {
      expect(FIXED).toContain(r.reason);
      expect(r).not.toHaveProperty("answer");
    }
    writeCheckRecord(
      "live-check-thinking-role.md",
      `# Live check: a thinking model as a role under a small cap\n\nRun by \`test/live-thinking-role.test.ts\` (spec 007, T053).\n\n- Model: \`${MODEL}\`, spend cap $0.02 (an output ceiling of about 1000 tokens).\n- Result: ${r.ok ? "a complete schema-valid answer" : `a fixed failure, \`${r.reason}\``}.\n- Tokens: ${JSON.stringify(r.tokens)}; cost ${r.costUsd === null ? "unpriced" : `$${r.costUsd.toFixed(4)}`}.\n- Never a partial answer: ${r.ok ? "the answer parsed against the schema" : "the failure carries no answer"}.\n`,
    );
  }, 180_000);
});
