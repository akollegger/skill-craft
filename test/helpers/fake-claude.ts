/**
 * A stand-in for the `claude` CLI, used by test/harness.test.ts. It reads the MCP config the harness
 * passes, plays the real engine, writes the run log where the config says, and prints a result in the
 * shape `claude -p --output-format json` uses. Behaviour comes from FAKE_CLAUDE_MODE.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Game } from "../../src/sim/engine.js";
import { loadWorld } from "../../src/sim/loader.js";
import { createRunLog } from "../../src/sim/runlog.js";
import { solve } from "../../src/sim/solver.js";

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => argv[argv.indexOf(name) + 1];
const config = JSON.parse(readFileSync(flag("--mcp-config") as string, "utf8")) as { mcpServers: { craft: { env: Record<string, string> } } };
const env = config.mcpServers.craft.env;
const mode = process.env["FAKE_CLAUDE_MODE"] ?? "solve";

const world = loadWorld(env["SIM_WORLD"] as string);
const logPath = env["SIM_RUN_LOG"] as string;
writeFileSync(join(dirname(logPath), "argv.json"), JSON.stringify(argv));

if (mode === "crash") {
  console.error("fake claude crashed");
  process.exit(1);
}

const game = new Game(world, { log: createRunLog(logPath) });
game.record("help", {}, { ok: true });
const [goalItem = "", goalQty = "1"] = (process.env["FAKE_CLAUDE_GOAL"] ?? "").split(":");

if (mode === "solve") {
  const best = solve(world, { item: goalItem, qty: Number(goalQty) });
  if (best.reachable) {
    for (const call of best.calls) {
      if (call.tool === "craft") game.craft();
      else game.place(String(call.args["item"]), Number(call.args["row"]), Number(call.args["col"]));
    }
  }
} else {
  // wander: look around, place two different items, try to craft, and stop without the goal
  const held = Object.keys(game.inventory().items);
  game.look();
  game.place(held[0] as string, 0, 0);
  game.place(held[1] as string, 0, 1);
  game.craft();
}

// Like the real CLI, a spent turn budget is an error result and a non-zero exit.
console.log(
  JSON.stringify({
    type: "result",
    subtype: mode === "budget" ? "error_max_turns" : "success",
    is_error: mode === "budget",
    num_turns: mode === "budget" ? Number(flag("--max-turns")) : 4,
    total_cost_usd: 0.01,
    result: mode === "solve" ? "I hold it." : "I could not find it. Any hints?",
  }),
);
if (mode === "budget") process.exit(1);
