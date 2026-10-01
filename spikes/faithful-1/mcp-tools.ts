/** Spike: list the tools of the NAMS MCP endpoint (read-only), to learn how workspace_create takes its arguments. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const key = process.env.NAMS_API_KEY;
if (!key) throw new Error("NAMS_API_KEY must be set");
const base = process.env.NAMS_BASE_URL ?? "https://memory.neo4jlabs.com";
const client = new Client({ name: "faithful-1", version: "0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
const { tools } = await client.listTools();
for (const t of tools.filter((x) => /workspace/.test(x.name))) console.log(t.name, "-", (t.description ?? "").slice(0, 160).replace(/\n/g, " "), "\n   ", JSON.stringify(t.inputSchema.properties ?? {}).slice(0, 400), "required", JSON.stringify(t.inputSchema.required ?? []));
await client.close();
