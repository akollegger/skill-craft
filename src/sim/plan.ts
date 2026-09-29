import type { Recipe, Stack, World } from "./schema.js";

export type PlanStep =
  | { action: "gather"; item: string; qty: number }
  | { action: "craft"; item: string; qty: number; recipe: string }
  | { action: "place_station"; station: string };

export interface Plan {
  steps: PlanStep[];
  /** Total number of tool calls a perfect run needs. */
  length: number;
}

/**
 * Expand a goal into a minimal ordered list of actions, assuming a fresh inventory.
 * Tools and stations are acquired once and kept. Throws if the goal is unreachable.
 */
export function planFor(world: World, goal: Stack): Plan {
  const items = new Map(world.items.map((i) => [i.id, i]));
  const producers = new Map<string, Recipe>();
  for (const r of world.recipes) {
    if (!producers.has(r.output.item)) producers.set(r.output.item, r);
  }
  const stationFor = new Map(world.stations.map((s) => [s.id, s]));

  const steps: PlanStep[] = [];
  const have = new Map<string, number>();
  const placed = new Set<string>();
  let bestTier = 0;

  const add = (item: string, n: number) => have.set(item, (have.get(item) ?? 0) + n);
  const take = (item: string, n: number) => have.set(item, (have.get(item) ?? 0) - n);

  const ensureTier = (need: number, trail: string[]) => {
    while (bestTier < need) {
      const tool = world.items
        .filter((i) => (i.toolTier ?? 0) > bestTier)
        .sort((a, b) => (a.toolTier ?? 0) - (b.toolTier ?? 0))[0];
      if (!tool) throw new Error(`no tool reaches tier ${need} (needed for ${trail.join(" > ")})`);
      obtain({ item: tool.id, qty: 1 }, trail);
      bestTier = Math.max(bestTier, tool.toolTier ?? 0);
    }
  };

  const ensureStation = (id: string, trail: string[]) => {
    if (placed.has(id)) return;
    const station = stationFor.get(id);
    if (!station) throw new Error(`unknown station ${id}`);
    obtain({ item: station.item, qty: 1 }, trail);
    take(station.item, 1);
    steps.push({ action: "place_station", station: id });
    placed.add(id);
  };

  const obtain = (want: Stack, trail: string[]) => {
    const missing = want.qty - (have.get(want.item) ?? 0);
    if (missing <= 0) return;
    if (trail.includes(want.item)) throw new Error(`cycle: ${[...trail, want.item].join(" > ")}`);
    const item = items.get(want.item);
    if (!item) throw new Error(`unknown item ${want.item}`);
    const next = [...trail, want.item];

    if (item.gather) {
      ensureTier(item.gather.minTier, next);
      steps.push({ action: "gather", item: item.id, qty: missing });
      add(item.id, missing);
      return;
    }

    const recipe = producers.get(want.item);
    if (!recipe) throw new Error(`nothing produces ${want.item}`);
    const runs = Math.ceil(missing / recipe.output.qty);
    if (recipe.station) ensureStation(recipe.station, next);
    // Reserve each input as soon as it is in hand, so siblings sharing an intermediate don't double-count it.
    for (const input of recipe.inputs) {
      obtain({ item: input.item, qty: input.qty * runs }, next);
      take(input.item, input.qty * runs);
    }
    if (recipe.fuel) {
      obtain({ item: recipe.fuel.item, qty: recipe.fuel.qty * runs }, next);
      take(recipe.fuel.item, recipe.fuel.qty * runs);
    }
    steps.push({ action: "craft", item: recipe.output.item, qty: runs * recipe.output.qty, recipe: recipe.id });
    add(recipe.output.item, runs * recipe.output.qty);
  };

  obtain(goal, []);
  return { steps, length: steps.length };
}
