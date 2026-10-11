// Provider admission probe, part 1 (spec 007, contracts/provider-table.md): can a model of a provider drive the craft
// server's tools through the harness's own runtime? It makes the model through the provider table, so it works for any
// row. Usage: pnpm dev spikes/fireworks/probe-tools.ts <world.json> <provider>/<model>...
// Prints structure only: finish reasons, tool names, whether calls arrived together, the usage fields reported and the
// model the provider says answered. Agent text and reasoning are counted, never printed or stored.
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { generateText, isStepCount } from "ai";
import { languageModel, newProbe, observed } from "../../src/harness/ai-driver.js";
import { craftServer } from "../../src/harness/craft-server.js";
import { parseModelSpec } from "../../src/harness/models.js";
import { findProvider, normaliseReported } from "../../src/harness/providers.js";

const [worldPath, ...specs] = process.argv.slice(2);
if (!worldPath || specs.length === 0) throw new Error("usage: probe-tools.ts <world.json> <provider>/<model>...");

const server = craftServer(worldPath, `${process.env["TMPDIR"] ?? "/tmp"}/probe-${process.pid}.jsonl`);
const client = await createMCPClient({ transport: new StdioMCPTransport({ command: server.command, args: server.args, env: { ...server.env, PATH: process.env["PATH"] ?? "" } }) });
const tools = await client.tools();
console.log("craft tools:", Object.keys(tools).join(", "));

for (const spec of specs) {
  const ref = parseModelSpec(spec);
  const row = findProvider(ref.provider);
  console.log(`\n== ${ref.spec}  (key ${row?.keyEnv}: ${process.env[row?.keyEnv ?? ""] ? "set" : "NOT SET"}; usage report: ${row?.usageReport ?? "none"})`);
  const probe = newProbe();
  try {
    const result = await generateText({
      model: observed(await languageModel(ref), probe),
      prompt: "You are at a crafting table. Use the tools: look at the table, check your inventory, then reply with the single word done.",
      tools,
      stopWhen: isStepCount(6),
      maxOutputTokens: 2000,
    });
    result.steps.forEach((step, i) => {
      const calls = step.toolCalls.map((c) => c.toolName);
      const u = step.usage;
      console.log(
        `step ${i + 1}: finish=${step.finishReason} calls=[${calls.join(",")}]${calls.length > 1 ? " (together)" : ""}` +
          ` textChars=${step.text.length} reasoningChars=${step.reasoningText?.length ?? 0}` +
          ` usage: in=${u.inputTokens} noCache=${u.inputTokenDetails.noCacheTokens} cacheRead=${u.inputTokenDetails.cacheReadTokens} cacheWrite=${u.inputTokenDetails.cacheWriteTokens} out=${u.outputTokens} reasoning=${u.outputTokenDetails.reasoningTokens}`,
      );
    });
    console.log(`answered by: ${probe.last === undefined ? "(provider reported none)" : normaliseReported(ref.provider, probe.last)}; attempts=${probe.attempts} failedAttempts=${probe.failedAttempts}`);
  } catch (e) {
    console.log(`failed: ${(e as { name?: string }).name ?? "error"}, status ${(e as { statusCode?: number }).statusCode ?? "-"}`); // never the message: it can echo a request
  }
}
await client.close();
