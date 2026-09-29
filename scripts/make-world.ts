import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { renameWorld } from "../src/sim/rename.js";
import { loadWorld } from "../src/sim/world-loader.js";

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "worlds/ember-forge.json" },
    seed: { type: "string", default: "1" },
    out: { type: "string" },
    perturb: { type: "boolean", default: false },
    "keep-descriptions": { type: "boolean", default: false },
  },
});

const seed = Number(values.seed);
if (!Number.isInteger(seed)) throw new Error("--seed must be an integer");

const world = renameWorld(loadWorld(values.base ?? "worlds/ember-forge.json"), { seed, perturb: values.perturb ?? false, opaque: !values["keep-descriptions"] });
const json = `${JSON.stringify(world, null, 2)}\n`;

if (values.out) {
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, json);
  console.error(`wrote ${values.out} (${world.name}; tasks: ${world.tasks.map((t) => t.goal.item).join(", ")})`);
} else {
  process.stdout.write(json);
}
