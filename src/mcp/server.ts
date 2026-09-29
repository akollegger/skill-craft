import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Game } from "../sim/engine.js";
import type { World } from "../sim/schema.js";
import { loadWorld } from "../sim/world-loader.js";

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

/** Build an MCP server exposing one Game. State lives as long as the server object. */
export function createCraftServer(world: World): { server: McpServer; game: Game } {
  const game = new Game(world);
  const server = new McpServer({ name: "craft", version: "0.1.0" });

  server.registerTool(
    "survey",
    { description: "Look around: what raw materials can be gathered (and the tool tier each needs), which stations exist, and the current tasks. Does not list recipes." },
    async () => text(game.survey()),
  );

  server.registerTool(
    "recipe_lookup",
    {
      description: "Look up how one item is made: its ingredients, any station or fuel it needs.",
      inputSchema: { item: z.string().describe("item id") },
    },
    async ({ item }) => text(game.recipeLookup(item)),
  );

  server.registerTool(
    "recipes_using",
    {
      description: "Find what an item can be used for: the items it is an ingredient or fuel for, and any station it sets up.",
      inputSchema: { item: z.string().describe("item id") },
    },
    async ({ item }) => text(game.recipesUsing(item)),
  );

  server.registerTool(
    "inventory",
    { description: "Show what you are carrying, stations set up, your best tool tier, and which tasks are done." },
    async () => text(game.inventory()),
  );

  server.registerTool(
    "gather",
    {
      description: "Gather a raw material from the environment. May need a tool of sufficient tier.",
      inputSchema: {
        resource: z.string().describe("item id of a raw material"),
        qty: z.number().int().positive().describe("how many units"),
      },
    },
    async ({ resource, qty }) => text(game.gather(resource, qty)),
  );

  server.registerTool(
    "place_station",
    {
      description: "Set up a station, consuming the item it is built from. Some recipes need a station in place.",
      inputSchema: { station: z.string().describe("station id") },
    },
    async ({ station }) => text(game.placeStation(station)),
  );

  server.registerTool(
    "craft",
    {
      description: "Make an item from ingredients you hold. Covers all making and refining; recipes may need a station and fuel.",
      inputSchema: {
        item: z.string().describe("item id to make"),
        qty: z.number().int().positive().describe("how many units"),
      },
    },
    async ({ item, qty }) => text(game.craft(item, qty)),
  );

  return { server, game };
}

async function main(): Promise<void> {
  const path = process.env["SIM_WORLD"];
  if (!path) throw new Error("SIM_WORLD must point at a world JSON file");
  const { server } = createCraftServer(loadWorld(path));
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
