/**
 * Spike: the experiment's workspace lifecycle through the NAMS MCP tools, with the guard ADR-003 asks for.
 * `create <name>` makes a managed workspace and records its id in <experiment>/workspace.json.
 * `wait` polls until its database is active. `delete` retires only the id that file records, never another.
 * Usage: tsx workspace.ts <experiment folder> create <name> | wait | delete
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const [folder, action, name] = process.argv.slice(2);
if (!folder || !["create", "wait", "delete"].includes(action ?? "")) throw new Error("usage: workspace.ts <experiment folder> create <name> | wait | delete");
const key = process.env.NAMS_API_KEY;
if (!key) throw new Error("NAMS_API_KEY must be set");
const file = join(folder, "workspace.json");

const client = new Client({ name: "faithful-1", version: "0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${process.env.NAMS_BASE_URL ?? "https://memory.neo4jlabs.com"}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
const call = async (tool: string, args: Record<string, unknown>) => {
  const res = (await client.callTool({ name: tool, arguments: args })) as { content: { text?: string }[]; isError?: boolean };
  const text = res.content.map((c) => c.text ?? "").join("");
  if (res.isError) throw new Error(`${tool} failed: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text) as Record<string, any>;
  } catch {
    return { text } as Record<string, any>;
  }
};
const recorded = (): { id: string; name: string } => {
  if (!existsSync(file)) throw new Error(`no ${file}: this experiment created no workspace`);
  return JSON.parse(readFileSync(file, "utf8"));
};

if (action === "create") {
  if (!name) throw new Error("create needs a name");
  if (existsSync(file)) throw new Error(`${file} already exists; this experiment already has a workspace`);
  const r = await call("workspace_create", { name, db_mode: "managed" });
  let id = (r["id"] ?? r["workspace_id"] ?? r["workspace"]?.["id"]) as string | undefined;
  if (!id) {
    // The reply may not carry the id in a shape we expect; the workspace exists by now, so find it by name.
    const list = (await call("workspace_list", {}))["workspaces"] as { id: string; name: string }[] | undefined;
    const mine = (list ?? []).filter((w) => w.name === name);
    if (mine.length !== 1) throw new Error(`workspace_create gave no id and the list has ${mine.length} workspaces named ${name}`);
    id = mine[0]!.id;
  }
  writeFileSync(file, `${JSON.stringify({ id, name, createdBy: "experiment" }, null, 2)}\n`);
  console.log(`created ${name} (${id}); recorded in ${file}`);
} else if (action === "wait") {
  const { id } = recorded();
  for (let i = 0; i < 40; i++) {
    const r = await call("workspace_get", { workspace_id: id });
    const status = String(r["status"] ?? r["workspace"]?.["status"] ?? "?");
    const db = String(r["database_status"] ?? r["db_status"] ?? r["database"]?.["status"] ?? "");
    console.log(`${i}: status ${status}${db ? `, database ${db}` : ""}`);
    if (status === "active") break;
    await new Promise((res) => setTimeout(res, 15_000));
  }
} else {
  const { id } = recorded();
  const mine = await call("workspace_list", {});
  const text = JSON.stringify(mine);
  if (!text.includes(id)) throw new Error("the recorded workspace is not in the account's list; refusing to delete");
  await call("workspace_delete", { workspace_id: id });
  writeFileSync(file, `${JSON.stringify({ ...recorded(), retired: true }, null, 2)}\n`);
  console.log(`retired ${id}`);
}
await client.close();
