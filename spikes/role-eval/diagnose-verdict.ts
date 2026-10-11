// Diagnosis (spec 007, T052 follow-up): why does a critic's answer fail the verdict schema through the AI SDK? It makes the same
// call the role driver makes, once per attempt and with no retry, and prints structure only: which structured-output mode the
// provider used, whether the schema it sent still carried length limits, the warnings' feature names, and the schema's issue
// paths, codes and limits. It never prints the answer or any value from it.
// Usage: pnpm dev spikes/role-eval/diagnose-verdict.ts <run folder> <provider>/<model> [attempts]
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, jsonSchema, Output } from "ai";
import { languageModel } from "../../src/harness/ai-driver.js";
import { parseModelSpec } from "../../src/harness/models.js";
import { criticPrompt } from "../../src/loop/inputs.js";
import { readPackage } from "../../src/loop/package.js";
import { loadRubric } from "../../src/loop/rubric.js";
import { replayRun } from "../../src/loop/transcript.js";
import { describeIssues, toJsonSchema, verdictSchema } from "../../src/loop/verdict.js";

const [runDir, spec, attempts = "6"] = process.argv.slice(2);
if (!runDir || !spec) throw new Error("usage: diagnose-verdict.ts <run folder> <provider>/<model> [attempts]");

const ref = parseModelSpec(spec);
const rubric = loadRubric();
const rec = await replayRun(runDir, "001");
const pkg = readPackage("spikes/skill-pilot/craft-glirol");
const goals = [rec.goal];
const prompt = criticPrompt({ rubric, goals, recordings: [rec], pkg });
const zodSchema = verdictSchema(rubric);
const schema = toJsonSchema(zodSchema);

const keywords = (node: unknown, found: Record<string, number> = {}): Record<string, number> => {
  if (Array.isArray(node)) node.forEach((n) => keywords(n, found));
  else if (typeof node === "object" && node !== null) {
    for (const [k, v] of Object.entries(node)) {
      if (["maxLength", "minLength", "maxItems", "minItems", "pattern", "enum"].includes(k)) found[k] = (found[k] ?? 0) + 1;
      keywords(v, found);
    }
  }
  return found;
};
// The request the provider really sends: a fetch wrapper keeps only its shape (keys, structured-output mode, schema keywords), never its content.
let sent: { body: Record<string, unknown>; headers: string } | undefined;
const shapeFetch: typeof fetch = async (input, init) => {
  try {
    sent = { body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>, headers: Object.keys((init?.headers ?? {}) as Record<string, string>).sort().join(",") };
  } catch {
    /* not JSON */
  }
  return fetch(input, init);
};
const model = () => (ref.provider === "anthropic" ? Promise.resolve(createAnthropic({ fetch: shapeFetch })(ref.id)) : languageModel(ref));
console.log(`model ${ref.spec}; recording ${rec.callCount} calls; prompt ${prompt.prompt.length} chars`);
console.log("schema the loop builds (JSON Schema keywords present):", JSON.stringify(keywords(schema)));

for (let i = 1; i <= Number(attempts); i++) {
  const result = await generateText({
    model: await model(),
    messages: [{ role: "user", content: prompt.prompt }],
    ...(prompt.system === undefined ? {} : { system: prompt.system }),
    output: Output.object({ schema: jsonSchema(schema) }),
    maxOutputTokens: 16_000,
    maxRetries: 0,
  }).catch((e: unknown) => e as Error);
  if (result instanceof Error) {
    console.log(`attempt ${i}: call failed (${result.name}); finishReason ${(result as { finishReason?: string }).finishReason ?? "-"}`);
    continue;
  }
  const body = (sent?.body ?? {}) as Record<string, unknown>;
  const oc = body["output_config"] as { format?: { type?: string; schema?: unknown } } | undefined;
  const toolNames = Array.isArray(body["tools"]) ? (body["tools"] as { name?: string }[]).map((t) => t.name) : [];
  const parsed = zodSchema.safeParse(result.output);
  if (i === 1) {
    console.log(`request body keys: ${Object.keys(body).sort().join(", ")}; beta header present: ${/anthropic-beta/i.test(sent?.headers ?? "")}`);
    console.log(`structured output: output_config.format.type=${oc?.format?.type ?? "none"}; tools=[${toolNames.join(",")}]; keywords in the schema SENT: ${JSON.stringify(keywords(oc?.format?.schema ?? {}))}`);
    console.log(`warning features: ${JSON.stringify((result.warnings ?? []).map((w) => (w as { feature?: string }).feature ?? w.type))}`);
  }
  console.log(`attempt ${i}: finish=${result.finishReason} out=${result.usage.outputTokens} valid=${parsed.success}${parsed.success ? "" : ` issues: ${describeIssues(parsed.error)}`}`);
}
