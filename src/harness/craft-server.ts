import { resolve } from "node:path";
import { REPO } from "./paths.js";

/**
 * The craft MCP server as the player starts it: absolute paths, because it runs in the run folder, not the
 * repo. This is also what `mcp.json` records, so it holds no environment beyond the two variables the server
 * reads; the operator's PATH stays in memory (see `ai-driver.ts`) and is never written or printed.
 */
export function craftServer(world: string, runLog: string) {
  return {
    type: "stdio" as const,
    command: resolve(REPO, "node_modules/.bin/tsx"),
    args: [resolve(REPO, "src/mcp/server.ts")],
    env: { SIM_WORLD: world, SIM_RUN_LOG: runLog } as Record<string, string>,
  };
}
