// Diagnosis (spec 007): why does a reviser's answer fail the revision schema's custom rules (no usable name, description or
// body in SKILL.md; a source that names a call that is not in the recordings)? It makes the role driver's call once per attempt
// with no retry and prints structure only: booleans and counts about the answer's fields, never the text itself.
// Usage: pnpm dev spikes/role-eval/diagnose-reviser.ts <run folder> <provider>/<model> [attempts] [thinking budget] [auto|jsonTool|outputFormat]
import { generateText, jsonSchema, Output } from "ai";
import { languageModel } from "../../src/harness/ai-driver.js";
import { skillName } from "../../src/harness/skill.js";
import { parseModelSpec } from "../../src/harness/models.js";
import { reviserPrompt } from "../../src/loop/inputs.js";
import { readPackage } from "../../src/loop/package.js";
import { loadRubric } from "../../src/loop/rubric.js";
import { replayRun } from "../../src/loop/transcript.js";
import { describeIssues, parseVerdict, revisionSchema, toJsonSchema } from "../../src/loop/verdict.js";

const [runDir, spec, attempts = "4", thinkingArg = "0", modeArg = "auto"] = process.argv.slice(2);
// Optional experiments: a thinking budget (Haiku 4.5 takes a budget, not adaptive thinking) and the structured-output mode.
const providerOptions = { anthropic: { ...(Number(thinkingArg) > 0 ? { thinking: { type: "enabled", budgetTokens: Number(thinkingArg) } } : {}), ...(modeArg === "auto" ? {} : { structuredOutputMode: modeArg }) } };
if (!runDir || !spec) throw new Error("usage: diagnose-reviser.ts <run folder> <provider>/<model> [attempts]");
const ref = parseModelSpec(spec);
const rubric = loadRubric();
const rec = await replayRun(runDir, "001");
const pkg = readPackage("spikes/skill-pilot/craft-glirol");
const ctx = { candidateName: skillName(pkg["SKILL.md"] ?? ""), runs: [{ label: "001", callCount: rec.callCount }] };
const verdict = parseVerdict(rubric, {
  overall: "revise",
  questions: Object.fromEntries(rubric.questions.map((q) => [q.id, { value: "no", reason: "The skill has no recipe." }])),
  reasons: "Add the recorded chain.",
  proposedRevisions: ["Lead with the chain of placements and the craft."],
});
const p = reviserPrompt({ rubric, goals: [rec.goal], recordings: [rec], pkg, verdict });
const zod = revisionSchema(ctx);
const SOURCE = /^run (\d{3}) call (\d+)$/;
console.log(`options: thinking budget ${thinkingArg}, structured output mode ${modeArg}`);
console.log(`model ${ref.spec}; recording ${rec.callCount} calls; candidate skill name length ${ctx.candidateName.length}`);
for (let i = 1; i <= Number(attempts); i++) {
  const r = await generateText({ model: await languageModel(ref), messages: [{ role: "user", content: p.prompt }], ...(p.system === undefined ? {} : { system: p.system }), output: Output.object({ schema: jsonSchema(toJsonSchema(zod)) }), maxOutputTokens: 32_000, maxRetries: 0, ...(ref.provider === "anthropic" ? { providerOptions } : {}) }).catch((e: unknown) => e as Error);
  if (r instanceof Error) { console.log(`attempt ${i}: call failed (${r.name})`); continue; }
  const a = r.output as { skillMd?: string; provenanceMd?: string; changes?: { sourceCalls?: string[] }[] };
  const md = a.skillMd ?? "";
  const fm = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(md);
  const sources = (a.changes ?? []).flatMap((c) => c.sourceCalls ?? []);
  const parsed = sources.map((s) => SOURCE.exec(s));
  console.log(
    `attempt ${i}: finish=${r.finishReason} out=${r.usage.outputTokens} reasoningTokens=${r.usage.outputTokenDetails.reasoningTokens} reasoningChars=${r.reasoningText?.length ?? 0} warnings=${JSON.stringify((r.warnings ?? []).map((w) => (w as { feature?: string }).feature ?? w.type))} | skillMd chars=${md.length} startsWithDashes=${md.startsWith("---")} startsWithFence=${md.startsWith("```")} literalBackslashN=${md.includes("\\n")} realNewlines=${(md.match(/\n/g) ?? []).length} hasCR=${md.includes("\r")} frontMatterMatched=${fm !== null} | ` +
      `sources=${sources.length} wellFormed=${parsed.filter(Boolean).length} labelIs001=${parsed.filter((m) => m?.[1] === "001").length} callInRange=${parsed.filter((m) => m !== null && Number(m[2]) >= 1 && Number(m[2]) <= rec.callCount).length} maxCall=${Math.max(0, ...parsed.map((m) => Number(m?.[2] ?? 0)))} | valid=${zod.safeParse(r.output).success}`,
  );
  const issues = zod.safeParse(r.output);
  if (!issues.success) console.log(`   issues: ${describeIssues(issues.error)}`.slice(0, 400));
}
