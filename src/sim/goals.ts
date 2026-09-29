import { readFileSync } from "node:fs";
import { z } from "zod";
import { WorldError } from "./errors.js";
import { idSchema, issueMessages, qtySchema, type World } from "./schema.js";

const goalSchema = z.strictObject({ item: idSchema, qty: qtySchema, note: z.string().optional() });
const goalsFileSchema = z.strictObject({ goals: z.array(goalSchema).min(1) });

/** An item and quantity an agent is asked to hold. Lives outside the world; the engine never reads it. */
export type Goal = z.infer<typeof goalSchema>;

/** `worlds/forge.json` is paired with `worlds/forge.goals.json`. */
export function goalsPathFor(worldPath: string): string {
  return worldPath.replace(/\.json$/, ".goals.json");
}

/** Parse goals data and check every goal's item exists in the world. */
export function parseGoals(data: unknown, world: World): Goal[] {
  const parsed = goalsFileSchema.safeParse(data);
  if (!parsed.success) throw new WorldError(issueMessages(parsed.error));
  const known = new Set(world.items.map((i) => i.id));
  const problems = parsed.data.goals.filter((g) => !known.has(g.item)).map((g) => `goal wants unknown item '${g.item}'`);
  if (problems.length > 0) throw new WorldError(problems);
  return parsed.data.goals;
}

export function loadGoals(path: string, world: World): Goal[] {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new WorldError([`cannot read ${path}: ${e instanceof Error ? e.message : String(e)}`]);
  }
  return parseGoals(data, world);
}
