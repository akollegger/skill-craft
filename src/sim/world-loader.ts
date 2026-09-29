import { readFileSync } from "node:fs";
import { planFor } from "./plan.js";
import { worldSchema, type World } from "./schema.js";

export class WorldError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`invalid world:\n- ${problems.join("\n- ")}`);
    this.name = "WorldError";
    this.problems = problems;
  }
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) (seen.has(id) ? dupes : seen).add(id);
  return [...dupes];
}

/** Check referential integrity and that every task can be completed from an empty inventory. */
export function validateWorld(world: World): string[] {
  const problems: string[] = [];
  const itemIds = new Set(world.items.map((i) => i.id));
  const stationIds = new Set(world.stations.map((s) => s.id));

  for (const d of duplicates(world.items.map((i) => i.id))) problems.push(`duplicate item id '${d}'`);
  for (const d of duplicates(world.stations.map((s) => s.id))) problems.push(`duplicate station id '${d}'`);
  for (const d of duplicates(world.recipes.map((r) => r.id))) problems.push(`duplicate recipe id '${d}'`);
  for (const d of duplicates(world.recipes.map((r) => r.output.item))) problems.push(`more than one recipe makes '${d}'`);

  for (const s of world.stations) {
    if (!itemIds.has(s.item)) problems.push(`station '${s.id}' needs unknown item '${s.item}'`);
  }
  const producible = new Set(world.recipes.map((r) => r.output.item));
  for (const i of world.items) {
    if (i.gather && producible.has(i.id)) problems.push(`item '${i.id}' is both gatherable and craftable`);
    if (!i.gather && !producible.has(i.id)) problems.push(`item '${i.id}' can neither be gathered nor crafted`);
  }
  for (const r of world.recipes) {
    const refs = [r.output.item, ...r.inputs.map((i) => i.item), ...(r.fuel ? [r.fuel.item] : [])];
    for (const ref of refs) if (!itemIds.has(ref)) problems.push(`recipe '${r.id}' uses unknown item '${ref}'`);
    if (r.station && !stationIds.has(r.station)) problems.push(`recipe '${r.id}' uses unknown station '${r.station}'`);
  }
  for (const t of world.tasks) {
    if (!itemIds.has(t.goal.item)) problems.push(`task '${t.id}' wants unknown item '${t.goal.item}'`);
  }
  if (problems.length > 0) return problems;

  for (const t of world.tasks) {
    try {
      planFor(world, t.goal);
    } catch (e) {
      problems.push(`task '${t.id}' is not solvable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return problems;
}

export function parseWorld(data: unknown): World {
  const parsed = worldSchema.safeParse(data);
  if (!parsed.success) {
    throw new WorldError(parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
  }
  const problems = validateWorld(parsed.data);
  if (problems.length > 0) throw new WorldError(problems);
  return parsed.data;
}

export function loadWorld(path: string): World {
  return parseWorld(JSON.parse(readFileSync(path, "utf8")));
}
