import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Game } from "../sim/engine.js";
import { loadWorld } from "../sim/loader.js";
import { createRunLog, RunLogInUseError, type RunLog } from "../sim/runlog.js";
import type { World } from "../sim/schema.js";

export interface CraftServerOptions {
  /** Where to record every tool call. Defaults to an in-memory log. */
  log?: RunLog;
}

/** One JSON text block per result. A refusal (`ok: false`) also sets the MCP error flag. */
function respond(outcome: object): CallToolResult {
  const refused = "ok" in outcome && outcome.ok === false;
  return {
    content: [{ type: "text", text: JSON.stringify(outcome, null, 2) }],
    ...(refused ? { isError: true } : {}),
  };
}

const PARAM_TYPES: Record<string, string> = { item: "string", row: "integer", col: "integer" };
const ROW = z.number().int().describe("zero-based row, 0 is the top");
const COL = z.number().int().describe("zero-based column, 0 is the left");

interface ToolDoc {
  name: string;
  purpose: string;
  inputs?: Record<string, string>;
}

/** Build the craft server for one world. Game state lives as long as the returned server. */
export function createCraftServer(world: World, options: CraftServerOptions = {}): { server: McpServer; game: Game } {
  const game = new Game(world, options.log ? { log: options.log } : {});
  const server = new McpServer({ name: "craft", version: "0.2.0" });
  // `help` describes the tools that are actually registered, so it cannot drift from the code.
  const registry: ToolDoc[] = [];

  function tool(name: string, purpose: string, handler: () => object): void;
  function tool<S extends z.ZodRawShape>(name: string, purpose: string, shape: S, handler: (args: { [K in keyof S]: z.infer<S[K]> }) => object): void;
  function tool(name: string, purpose: string, second: unknown, third?: unknown): void {
    if (typeof second === "function") {
      const handler = second as () => object;
      server.registerTool(name, { description: purpose }, async () => respond(handler()));
      registry.push({ name, purpose });
      return;
    }
    const shape = second as z.ZodRawShape;
    const handler = third as (args: never) => object;
    server.registerTool(name, { description: purpose, inputSchema: shape }, (async (args: never) => respond(handler(args))) as never);
    registry.push({ name, purpose, inputs: Object.fromEntries(Object.keys(shape).map((k) => [k, PARAM_TYPES[k] ?? "string"])) });
  }

  tool("help", "Describe the world briefly and each tool. Changes nothing.", () =>
    game.record("help", {}, {
      world: { name: world.name, description: world.description, grid: { rows: world.grid.rows, cols: world.grid.cols } },
      coordinates: "zero-based; row 0 is the top, col 0 is the left",
      tools: registry.map((t) => ({ name: t.name, purpose: t.purpose, ...(t.inputs ? { inputs: t.inputs } : {}) })),
      preview:
        "grid is the table's contents; craftable is what craft would make now, or null" +
        (world.hints === "partial" ? "; partial is true when adding more items could still make something" : ""),
    }),
  );

  tool("inventory", "List the items you hold and how many of each. Changes nothing.", () => game.inventory());

  tool("look", "Show the table as it is now and what craft would make. Changes nothing.", () => game.look());

  tool(
    "place",
    "Move one unit of an item you hold onto a cell of the table. Returns what the table shows and what craft would make.",
    { item: z.string().describe("item id"), row: ROW, col: COL },
    ({ item, row, col }) => game.place(item, row, col),
  );

  tool(
    "remove",
    "Move the item in a cell back to your inventory. Returns what the table shows and what craft would make.",
    { row: ROW, col: COL },
    ({ row, col }) => game.remove(row, col),
  );

  tool("clear", "Move every item on the table back to your inventory. Returns what the table shows.", () => game.clear());

  tool("craft", "Make the item the table currently matches. Consumes everything on the table. Irreversible.", () => game.craft());

  return { server, game };
}

async function main(): Promise<void> {
  const path = process.env["SIM_WORLD"];
  if (!path) throw new Error("SIM_WORLD must point at a world JSON file");
  let log: RunLog;
  try {
    log = createRunLog(process.env["SIM_RUN_LOG"]);
  } catch (e) {
    if (!(e instanceof RunLogInUseError)) throw e;
    console.error(e.message);
    process.exit(1);
  }
  const { server } = createCraftServer(loadWorld(path), { log });
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
