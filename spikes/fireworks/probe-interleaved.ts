// Does Anthropic's interleaved-thinking beta make a Claude model reason between tool results, not only before the first call?
// Usage: pnpm dev spikes/fireworks/probe-interleaved.ts <world.json> <goal-item> <claude model> <budget> [--header]
// One short capped run through the craft server, with a thinking budget, with or without the beta header. Prints counts only:
// per step, the characters of text and of reasoning and the tools called. Agent text and reasoning are never printed or stored.
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { generateText, isStepCount } from "ai";
import { languageModel } from "../../src/harness/ai-driver.js";
import { craftServer } from "../../src/harness/craft-server.js";
import { parseModelSpec } from "../../src/harness/models.js";
import { buildPrompt } from "../../src/harness/run.js";

const [world, item, model, budget] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const withHeader = process.argv.includes("--header");
if (!world || !item || !model || !budget) throw new Error("usage: probe-interleaved.ts <world.json> <goal-item> <claude model> <budget> [--header]");

const server = craftServer(world, `${process.env["TMPDIR"] ?? "/tmp"}/probe-interleaved-${process.pid}.jsonl`);
const client = await createMCPClient({ transport: new StdioMCPTransport({ command: server.command, args: server.args, env: { ...server.env, PATH: process.env["PATH"] ?? "" } }) });
console.log(`== ${parseModelSpec(model).spec}, thinking budget ${budget}, interleaved header ${withHeader ? "ON" : "off"}`);
try {
  const result = await generateText({
    model: await languageModel(parseModelSpec(model)),
    prompt: buildPrompt({ item, qty: 1 }, 6),
    tools: await client.tools(),
    stopWhen: isStepCount(6),
    maxOutputTokens: 40000,
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" }, thinking: { type: "enabled", budgetTokens: Number(budget) } } },
    ...(withHeader ? { headers: { "anthropic-beta": "interleaved-thinking-2025-05-14" } } : {}),
  });
  result.steps.forEach((s, i) => console.log(`step ${i + 1}: textChars=${s.text.length} reasoningChars=${s.reasoningText?.length ?? 0} calls=[${s.toolCalls.map((c) => c.toolName).join(",")}] finish=${s.finishReason}`));
  console.log(`warnings: ${result.steps.flatMap((s) => s.warnings ?? []).map((w) => `${w.type}:${(w as { feature?: string }).feature ?? ""}`).join(", ") || "none"}`);
} catch (e) {
  console.log(`failed: ${(e as { name?: string }).name ?? "error"}, status ${(e as { statusCode?: number }).statusCode ?? "-"}`); // never the message: it can echo a request
}
await client.close();
