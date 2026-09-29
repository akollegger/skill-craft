import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCraftServer, type CraftServerOptions } from "../../src/mcp/server.js";
import type { World } from "../../src/sim/schema.js";

export interface CallResult {
  isError: boolean;
  text: string;
  /** The parsed JSON body, or undefined when the text is not JSON (for example an input-schema error). */
  json: Record<string, any> | undefined;
}

/** Start the craft server on an in-memory transport and return a client for it. */
export async function connect(world: World, options: CraftServerOptions = {}) {
  const { server, game } = createCraftServer(world, options);
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

  const call = async (name: string, args: Record<string, unknown> = {}): Promise<CallResult> => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as { type: string; text: string }[])[0]?.text ?? "";
    let json: Record<string, any> | undefined;
    try {
      json = JSON.parse(text) as Record<string, any>;
    } catch {
      json = undefined;
    }
    return { isError: res.isError === true, text, json };
  };

  return { client, game, call };
}
