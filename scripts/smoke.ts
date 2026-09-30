/**
 * Spawn the craft server over stdio, as an agent harness would, and replay the best run for a goal
 * using only its tools. Usage: node --import tsx scripts/smoke.ts <world.json> <item>[:<qty>]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { loadWorld } from "../src/sim/loader.js";
import { solve } from "../src/sim/solver.js";

const [worldPath, goalText] = process.argv.slice(2);
if (!worldPath || !goalText) {
  console.error("usage: smoke.ts <world.json> <item>[:<qty>]");
  process.exit(2);
}
const [item = "", qty = "1"] = goalText.split(":");
const goal = { item, qty: Number(qty) };

const world = loadWorld(worldPath);
const best = solve(world, goal);
if (!best.reachable) {
  console.error(`goal ${item}:${goal.qty} cannot be reached in ${worldPath}`);
  process.exit(1);
}

const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/mcp/server.ts"],
    env: { ...(process.env as Record<string, string>), SIM_WORLD: worldPath },
  }),
);

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { text: string }[])[0]?.text ?? "{}";
  return { isError: res.isError === true, json: JSON.parse(text) as Record<string, any> };
};

let sent = 0;
for (const step of best.calls) {
  const res = await call(step.tool, step.args);
  sent++;
  if (res.isError) {
    console.error(`step ${sent} was refused: ${JSON.stringify(step)} -> ${res.json["error"]}`);
    await client.close();
    process.exit(1);
  }
}
const held = ((await call("inventory")).json["items"] as Record<string, number>)[item] ?? 0;
await client.close();

console.log(`world-changing calls: ${sent} (best run: ${best.minCalls})`);
console.log(`goal held: ${held >= goal.qty ? "yes" : "no"}`);
process.exit(sent === best.minCalls && held >= goal.qty ? 0 : 1);
