// A run record from a replayed finished run (ADR-008, spec 009, research R5). The recording already replayed the log on a fresh game and regenerated each
// call's output, so this only maps it, and drops what the contract excludes: the goal, the world's path, the hashes and the timings.
import type { Recording } from "../loop/transcript.js";
import type { RunRecord } from "./schemas.js";

/** The refusal shown for a call that never reached the craft server. */
export const INVALID_CALL = "invalid_call";

export function toRunRecord(rec: Recording): RunRecord {
  const byId = new Map(rec.calls.map((c) => [c.toolUseId, c]));
  const call = (c: Recording["calls"][number]) => ({
    id: c.toolUseId,
    tool: c.tool,
    arguments: c.args,
    status: c.ok ? ("ok" as const) : ("failed" as const),
    output: c.output,
    ...(c.ok || c.error === undefined ? {} : { refusal: c.error }),
  });

  // A run that kept no conversation has its calls and nothing else: one turn for each, with no text and no reasoning, which is not invented.
  const turns =
    rec.conversation === null
      ? rec.calls.map((c) => ({ text: "", calls: [call(c)] }))
      : rec.conversation.map((t) => ({
          text: t.text,
          ...(t.reasoning.trim() === "" ? {} : { reasoning: t.reasoning }),
          // A call the model made that never reached the craft server (malformed arguments, an unknown tool) has no outcome in the log: it is shown as
          // a failed call with a fixed refusal, so a harness sees that the model tried it and nothing is invented about what came back.
          calls: t.calls.map((tc) => {
            const c = byId.get(tc.id);
            return c === undefined ? { id: tc.id, tool: tc.tool, arguments: {}, status: "failed" as const, output: "", refusal: INVALID_CALL } : call(c);
          }),
        }));

  const calling = rec.conversation === null ? [] : rec.conversation.filter((t) => t.calls.length > 0);
  const given = calling.filter((t) => t.reasoning.trim() !== "").length;
  const reasoning = rec.conversation === null ? "not-kept" : given === 0 ? "none" : given === calling.length ? "returned" : "partial";

  return {
    id: rec.label,
    prompt: rec.prompt,
    models: { requested: rec.requestedModel ?? null, resolved: rec.models },
    settings: rec.settings === null ? null : { temperature: rec.settings.temperature ?? null, effort: rec.settings.effort ?? null, thinking: rec.settings.thinking ?? null },
    reasoning,
    turns,
    finalAnswer: rec.finalAnswer,
  };
}
