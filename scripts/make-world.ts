import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { WorldError } from "../src/sim/errors.js";
import { goalsPathFor, loadGoals } from "../src/sim/goals.js";
import { loadWorld } from "../src/sim/loader.js";
import { renameWorld } from "../src/sim/rename.js";
import { notesPathFor } from "../src/sim/notes.js";
import { toRepoPath } from "../src/harness/paths.js";

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "worlds/forge.json" },
    seed: { type: "string", default: "1" },
    out: { type: "string" },
    perturb: { type: "boolean", default: false },
    "keep-descriptions": { type: "boolean", default: false },
  },
});

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

try {
  const seed = Number(values.seed);
  if (!Number.isInteger(seed)) fail("--seed must be an integer");
  const basePath = values.base as string;
  const base = loadWorld(basePath);
  const goals = loadGoals(goalsPathFor(basePath), base);
  const { world, goals: mapped } = renameWorld(base, goals, {
    seed,
    perturb: values.perturb ?? false,
    keepDescriptions: values["keep-descriptions"] ?? false,
  });
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

  if (values.out) {
    mkdirSync(dirname(values.out), { recursive: true });
    writeFileSync(values.out, json(world));
    writeFileSync(goalsPathFor(values.out), json({ goals: mapped }));
    // Names are invented whether or not recipes were nudged; the notes file says so and where it came from.
    writeFileSync(notesPathFor(values.out), json({ priorFit: "invented", derivedFrom: toRepoPath(resolve(basePath)) }));
    console.error(`wrote ${values.out}, ${goalsPathFor(values.out)} and ${notesPathFor(values.out)} (${world.name})`);
  } else {
    process.stdout.write(json(world));
  }
} catch (e) {
  if (e instanceof WorldError) fail(e.message);
  throw e;
}
