/** Spike: list the account's workspaces through the NAMS MCP tools (read-only): name, id, status. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const key = process.env.NAMS_API_KEY;
if (!key) throw new Error("NAMS_API_KEY must be set");
const client = new Client({ name: "faithful-1", version: "0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${process.env.NAMS_BASE_URL ?? "https://memory.neo4jlabs.com"}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
const res = (await client.callTool({ name: "workspace_list", arguments: {} })) as { content: { text?: string }[] };
const text = res.content.map((c) => c.text ?? "").join("");
try {
  const data = JSON.parse(text) as Record<string, any>;
  const list = (Array.isArray(data) ? data : (data["workspaces"] ?? [])) as Record<string, any>[];
  for (const w of list) console.log(w["name"], w["id"] ?? w["workspace_id"], w["status"], w["db_mode"] ?? w["dbMode"] ?? "");
} catch {
  console.log(text.slice(0, 600));
}
await client.close();
