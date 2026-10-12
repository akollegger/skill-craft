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
  const ask = (maxUsd: number) =>
    aiRoleDriver({
      prompt: "Think it through, then answer: what is the sum of the first 40 prime numbers? Give n as that sum and why as one sentence.",
      model: MODEL,
      schema: SCHEMA,
      maxUsd,
      signal: new AbortController().signal,
    });
  const check = (r: Awaited<ReturnType<typeof ask>>) => {
    if (r.ok) {
      const a = r.answer as { n: unknown; why: unknown };
      expect(typeof a.n).toBe("number");
      expect(typeof a.why).toBe("string");
    } else {
      expect(FIXED).toContain(r.reason);
      expect(r).not.toHaveProperty("answer");
    }
  };
  const line = (r: Awaited<ReturnType<typeof ask>>) => (r.ok ? "a complete schema-valid answer" : `a fixed failure, \`${r.reason}\``);

  it("returns a complete schema-valid answer or a fixed failure reason, never a partial answer, at a ceiling of about 1000 and about 150 tokens", async () => {
    // $0.02 is an output ceiling near 1000 tokens at Opus 5.5's output price; $0.003 is near 150, which a thinking model's reasoning can exhaust.
    const roomy = await ask(0.02);
    check(roomy);
    const tight = await ask(0.003);
    check(tight);
    writeCheckRecord(
      "live-check-thinking-role.md",
      `# Live check: a thinking model as a role under a small cap\n\nRun by \`test/live-thinking-role.test.ts\` (spec 007, T054).\n\n- Model: \`${MODEL}\`.\n- Spend cap $0.02 (an output ceiling of about 1000 tokens): ${line(roomy)}; tokens ${JSON.stringify(roomy.tokens)}.\n- Spend cap $0.003 (a ceiling of about 150 tokens, tight enough to cut off reasoning): ${line(tight)}; tokens ${JSON.stringify(tight.tokens)}.\n- Never a partial answer: a complete answer parsed against the schema, or the failure carried no answer.\n`,
    );
  }, 180_000);
});
