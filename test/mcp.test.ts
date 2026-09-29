import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createCraftServer } from "../src/mcp/server.js";
import { renameWorld } from "../src/sim/rename.js";
import { loadWorld } from "../src/sim/world-loader.js";

async function connect() {
  const world = renameWorld(loadWorld("worlds/ember-forge.json"), { seed: 7 });
  const { server, game } = createCraftServer(world);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const content = res.content as { type: string; text: string }[];
    return JSON.parse(content[0]!.text) as Record<string, any>;
  };
  return { world, game, client, call };
}

describe("craft MCP server", () => {
  it("exposes the seven tools", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["craft", "gather", "inventory", "place_station", "recipe_lookup", "recipes_using", "survey"],
    );
  });

  it("supports discovery without ever listing all recipes", async () => {
    const { call, world } = await connect();
    const survey = await call("survey");
    expect(survey["ok"]).toBe(true);
    expect(survey["gatherable"].length).toBeGreaterThan(0);
    expect(JSON.stringify(survey)).not.toContain('"inputs"');

    const goal = world.tasks.at(-1)!.goal.item;
    const recipe = await call("recipe_lookup", { item: goal });
    expect(recipe["craftable"]).toBe(true);
    const first = recipe["inputs"][0].item as string;
    const uses = await call("recipes_using", { item: first });
    expect(uses["makes"]).toContain(goal);
  });

  it("returns structured errors for naive actions", async () => {
    const { call, world } = await connect();
    const raw = world.items.find((i) => i.gather && i.gather.minTier >= 1)!.id;
    const res = await call("gather", { resource: raw, qty: 1 });
    expect(res).toMatchObject({ ok: false, error: "wrong_tool_tier" });
  });
});
