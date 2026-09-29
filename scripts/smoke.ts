/**
 * Spawns the craft MCP server over stdio (like Claude Code does) and solves a task using only
 * the tools, following the planner's steps. Usage: pnpm dev scripts/smoke.ts [world.json] [task-index]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { planFor } from "../src/sim/plan.js";
import { loadWorld } from "../src/sim/world-loader.js";

const worldPath = process.argv[2] ?? "worlds/generated/ember-7.json";
const world = loadWorld(worldPath);
const task = world.tasks[Number(process.argv[3] ?? world.tasks.length - 1)];
if (!task) throw new Error("no such task");

const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(
  new StdioClientTransport({
    command: "pnpm",
    args: ["exec", "tsx", "src/mcp/server.ts"],
    env: { ...(process.env as Record<string, string>), SIM_WORLD: worldPath },
  }),
);

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return JSON.parse((res.content as { text: string }[])[0]!.text) as { ok: boolean; error?: string; tick: number };
};

console.log("tools:", (await client.listTools()).tools.map((t) => t.name).join(", "));
const naive = await call("gather", { resource: world.items.find((i) => (i.gather?.minTier ?? 0) >= 1)!.id, qty: 1 });
console.log("naive gather ->", naive.ok ? "ok?!" : naive.error);

const plan = planFor(world, task.goal);
for (const s of plan.steps) {
  const r =
    s.action === "gather" ? await call("gather", { resource: s.item, qty: s.qty })
    : s.action === "craft" ? await call("craft", { item: s.item, qty: s.qty })
    : await call("place_station", { station: s.station });
  if (!r.ok) throw new Error(`step failed: ${JSON.stringify(s)} -> ${r.error}`);
}
const inv = (await call("inventory")) as unknown as { tasks: { id: string; done: boolean }[]; tick: number };
console.log(`task ${task.id}:`, inv.tasks.find((t) => t.id === task.id)?.done ? "DONE" : "not done", `in ${plan.length} actions, ${inv.tick} ticks`);
await client.close();
