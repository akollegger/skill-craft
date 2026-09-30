import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { WorldError } from "../src/sim/errors.js";
import { loadWorld } from "../src/sim/loader.js";
import type { RunLogEntry } from "../src/sim/runlog.js";
import { ReplayError, scoreRun } from "../src/sim/score.js";

const { values } = parseArgs({
  options: { world: { type: "string" }, goal: { type: "string" }, log: { type: "string", multiple: true } },
});

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

try {
  if (!values.world || !values.goal || !values.log?.length) {
    fail("usage: score.ts --world <world.json> --goal <item>[:<qty>] --log <run.jsonl> [--log <run.jsonl> ...]");
  }
  const world = loadWorld(values.world as string);
  const [item = "", qty = "1"] = (values.goal as string).split(":");
  const goal = { item, qty: Number(qty) };
  if (!world.items.some((i) => i.id === item)) fail(`goal wants unknown item '${item}'`);
  if (!Number.isInteger(goal.qty) || goal.qty < 1) fail(`bad --goal '${values.goal}'; expected <item> or <item>:<qty>`);

  const results = (values.log as string[]).map((log) => {
    let text: string;
    try {
      text = readFileSync(log, "utf8");
    } catch {
      return fail(`cannot read ${log}`);
    }
    const entries = text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as RunLogEntry);
    return { log, ...scoreRun(world, goal, entries) };
  });
  console.log(JSON.stringify(results, null, 2));
} catch (e) {
  if (e instanceof WorldError || e instanceof ReplayError) fail(e.message);
  throw e;
}
