// Does the runtime send a model's reasoning back to the provider on the next turn of a tool loop? Free: no network, no key. The provider package is
// given a scripted fetch that answers a first turn with reasoning and a tool call and a second with text, and keeps the second request's messages.
// Usage: pnpm dev spikes/fireworks/probe-roundtrip.ts [model id]
// Prints the shape of each message sent on turn two (role, which fields, how long) and never any text.
import { createFireworks } from "@ai-sdk/fireworks";
import { generateText, isStepCount, tool, jsonSchema } from "ai";

const modelId = process.argv[2] ?? "nemotron-lightning-3p5-30b-a3b";
const bodies: { messages: Record<string, unknown>[] }[] = [];
const turn = (message: Record<string, unknown>, finish: string) => ({ id: "x", object: "chat.completion", created: 0, model: modelId, choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
const answers = [
  turn({ content: "I will look.", reasoning_content: "REASONING-TEXT-MARK the table should be checked first", tool_calls: [{ id: "call_1", type: "function", function: { name: "look", arguments: "{}" } }] }, "tool_calls"),
  turn({ content: "done" }, "stop"),
];
const fetch = (async (_url: string, init?: RequestInit) => {
  bodies.push(JSON.parse(String(init?.body)));
  return new Response(JSON.stringify(answers[bodies.length - 1]), { status: 200, headers: { "content-type": "application/json" } });
}) as unknown as typeof globalThis.fetch;

const provider = createFireworks({ apiKey: "not-a-real-key", fetch });
const result = await generateText({
  model: provider(`accounts/fireworks/models/${modelId}`),
  prompt: "go",
  tools: { look: tool({ description: "look", inputSchema: jsonSchema({ type: "object", properties: {}, additionalProperties: false }), execute: async () => "table" }) },
  stopWhen: isStepCount(3),
});
console.log(`steps: ${result.steps.length}; step 1 reasoningChars=${result.steps[0]?.reasoningText?.length ?? 0}`);
const second = bodies[1]?.messages ?? [];
for (const m of second) {
  const fields = Object.entries(m).map(([k, v]) => `${k}${typeof v === "string" ? `(${v.length})` : Array.isArray(v) ? `[${v.length}]` : ""}`);
  console.log(`  turn-2 request message: role=${m["role"]} fields: ${fields.join(", ")}`);
}
const sentBack = JSON.stringify(second).includes("REASONING-TEXT-MARK");
console.log(`reasoning text sent back on turn 2: ${sentBack ? "YES" : "NO"}`);
console.log(`request body keys on turn 2: ${Object.keys(bodies[1] ?? {}).join(", ")}`);
