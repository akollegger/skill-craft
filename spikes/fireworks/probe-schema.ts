// Provider admission probe, part 2 (spec 007, contracts/provider-table.md): does a model of a provider return answers
// that validate against the critic and reviser schemas under the provider's structured-output mode? It goes through the
// harness's own role driver, with the fixtures the live role tests use. Usage: pnpm dev spikes/fireworks/probe-schema.ts <provider>/<model>...
// Prints whether each answer parsed, the fixed failure reason if not, and the usage reported. Answers are not printed.
import { aiRoleDriver } from "../../src/harness/ai-driver.js";
import { parseModelSpec } from "../../src/harness/models.js";
import { criticPrompt, reviserPrompt } from "../../src/loop/inputs.js";
import { loadRubric } from "../../src/loop/rubric.js";
import { parseRevision, parseVerdict, revisionSchema, toJsonSchema, verdictSchema } from "../../src/loop/verdict.js";
import { candidate, recording } from "../../test/helpers/loop-fixtures.js";

const specs = process.argv.slice(2);
if (specs.length === 0) throw new Error("usage: probe-schema.ts <provider>/<model>...");

const rubric = loadRubric();
const goals = [{ item: "thing", qty: 1 }];
const pkg = candidate();
const verdict = parseVerdict(rubric, {
  overall: "revise",
  questions: Object.fromEntries(rubric.questions.map((q) => [q.id, { value: "no", reason: "The skill has no recipe." }])),
  reasons: "Add the recorded chain.",
  proposedRevisions: ["Lead with the chain of placements and the craft."],
});
const ctx = { candidateName: "craft-thing", runs: [{ label: "001", callCount: 4 }] };

for (const spec of specs) {
  const ref = parseModelSpec(spec);
  console.log(`\n== ${ref.spec}`);
  const critic = criticPrompt({ rubric, goals, recordings: [recording("001")], pkg });
  const reviser = reviserPrompt({ rubric, goals, recordings: [recording("001")], pkg, verdict });
  const cases = [
    { name: "critic", p: critic, schema: toJsonSchema(verdictSchema(rubric)), check: (a: unknown) => parseVerdict(rubric, a) },
    { name: "reviser", p: reviser, schema: toJsonSchema(revisionSchema(ctx)), check: (a: unknown) => parseRevision(a, ctx) },
  ];
  for (const c of cases) {
    const r = await aiRoleDriver({ ...c.p, model: ref.spec, schema: c.schema, maxUsd: 0.5, signal: new AbortController().signal });
    let parsed = false;
    if (r.ok) {
      try {
        c.check(r.answer);
        parsed = true;
      } catch {
        /* reported below */
      }
    }
    console.log(`${c.name}: ok=${r.ok} parsed=${parsed}${r.ok ? "" : ` reason="${r.reason}"`} tokens=${JSON.stringify(r.tokens)} costUsd=${r.costUsd} answeredBy=${r.resolvedModel}`);
  }
}
