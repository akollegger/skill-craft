// Step 2 of the spike: can a Fireworks model drive the craft server's tools through chat/completions?
// Usage: pnpm dev spikes/fireworks/probe-tools.ts <world.json> <model-name>...
// Prints structure only (finish reasons, tool names, argument validity, usage keys); model text and reasoning are
// counted, never printed or stored.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const key = process.env["FIREWORKS_API_KEY"];
if (!key) throw new Error("FIREWORKS_API_KEY is not set");
const [worldPath, ...models] = process.argv.slice(2);
if (!worldPath || models.length === 0) throw new Error("usage: probe-tools.ts <world.json> <model>...");

const client = new Client({ name: "probe", version: "0.0.0" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/mcp/server.ts"],
    env: { ...(process.env as Record<string, string>), SIM_WORLD: worldPath },
  }),
);
const listed = (await client.listTools()).tools;
const tools = listed.map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.inputSchema } }));
console.log("craft tools:", listed.map((t) => t.name).join(", "));

type Msg = Record<string, unknown>;
for (const model of models) {
  const id = `accounts/fireworks/models/${model}`;
  const messages: Msg[] = [
    { role: "user", content: "You are at a crafting table. Use the tools: look at the table, check your inventory, then reply with the single word done." },
  ];
  console.log(`\n== ${model}`);
  for (let turn = 1; turn <= 5; turn++) {
    const t0 = Date.now();
    const res = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: id, messages, tools, max_tokens: 2000, temperature: 0 }),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      console.log(`turn ${turn}: HTTP ${res.status} ${(await res.text()).slice(0, 160).replace(/\s+/g, " ")}`);
      break;
    }
    const body = (await res.json()) as any;
    const choice = body.choices?.[0];
    const msg = choice?.message ?? {};
    const calls = (msg.tool_calls ?? []) as { id: string; function: { name: string; arguments: string } }[];
    const argsOk = calls.map((c) => { try { JSON.parse(c.function.arguments || "{}"); return true; } catch { return false; } });
    console.log(
      `turn ${turn}: ${ms}ms finish=${choice?.finish_reason} calls=[${calls.map((c) => c.function.name).join(",")}] argsValid=[${argsOk.join(",")}]` +
        ` textChars=${(msg.content ?? "").length} reasoningField=${["reasoning_content", "reasoning"].filter((k) => msg[k]).join("|") || "none"}` +
        ` usage=${JSON.stringify(body.usage)}`,
    );
    messages.push(msg);
    if (calls.length === 0) break;
    for (const c of calls) {
      let out = "{}";
      try {
        const r = await client.callTool({ name: c.function.name, arguments: JSON.parse(c.function.arguments || "{}") });
        out = (r.content as { text: string }[])[0]?.text ?? "{}";
      } catch (e) {
        out = JSON.stringify({ error: "call failed" });
      }
      messages.push({ role: "tool", tool_call_id: c.id, content: out });
    }
  }
}
await client.close();
