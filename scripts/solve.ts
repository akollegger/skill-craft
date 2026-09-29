import { parseArgs } from "node:util";
import { WorldError } from "../src/sim/errors.js";
import { goalsPathFor, loadGoals } from "../src/sim/goals.js";
import { loadWorld } from "../src/sim/loader.js";
import { solve, SolverBudgetError, type SolverGoal } from "../src/sim/solver.js";

const { values } = parseArgs({
  options: {
    world: { type: "string" },
    goal: { type: "string", multiple: true },
    "goals-file": { type: "string" },
    "state-budget": { type: "string" },
  },
});

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

function parseGoal(text: string): SolverGoal {
  const [item, qty = "1"] = text.split(":");
  const n = Number(qty);
  if (!item || !Number.isInteger(n) || n < 1) return fail(`bad --goal '${text}'; expected <item> or <item>:<qty>`);
  return { item, qty: n };
}

try {
  if (!values.world) fail("usage: solve.ts --world <world.json> (--goal <item>[:<qty>] ... | --goals-file <goals.json>) [--state-budget <n>]");
  const world = loadWorld(values.world as string);
  const goals: SolverGoal[] = [
    ...(values["goals-file"] ? loadGoals(values["goals-file"], world).map(({ item, qty }) => ({ item, qty })) : []),
    ...(values.goal ?? []).map(parseGoal),
  ];
  if (goals.length === 0) fail(`no goals given; pass --goal or --goals-file (for example ${goalsPathFor(values.world as string)})`);
  const stateBudget = values["state-budget"] === undefined ? undefined : Number(values["state-budget"]);
  const results = goals.map((goal) => solve(world, goal, stateBudget === undefined ? {} : { stateBudget }));
  console.log(JSON.stringify(results, null, 2));
} catch (e) {
  if (e instanceof WorldError || e instanceof SolverBudgetError) fail(e.message);
  throw e;
}
