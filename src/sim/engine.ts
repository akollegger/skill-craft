import type { Item, Recipe, Station, World } from "./schema.js";

export type ErrorCode =
  | "unknown_item"
  | "unknown_station"
  | "not_gatherable"
  | "not_craftable"
  | "wrong_tool_tier"
  | "missing_ingredient"
  | "no_station_nearby"
  | "missing_fuel"
  | "invalid_quantity";

export interface Failure {
  ok: false;
  error: ErrorCode;
  message: string;
  hint?: string;
  details?: Record<string, unknown>;
}

export type Outcome<T extends object = object> = ({ ok: true; tick: number } & T) | Failure;

export interface LogEntry {
  tick: number;
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  error?: ErrorCode;
}

const fail = (error: ErrorCode, message: string, hint?: string, details?: Record<string, unknown>): Failure => ({
  ok: false,
  error,
  message,
  ...(hint === undefined ? {} : { hint }),
  ...(details === undefined ? {} : { details }),
});

/**
 * Deterministic crafting simulation over a World. No randomness, no clock: the same sequence of
 * calls always produces the same results, so runs are comparable.
 */
export class Game {
  readonly world: World;
  readonly log: LogEntry[] = [];
  private tick = 0;
  private readonly stock = new Map<string, number>();
  private readonly placed = new Set<string>();
  private readonly items: Map<string, Item>;
  private readonly stations: Map<string, Station>;
  private readonly producers: Map<string, Recipe>;

  constructor(world: World) {
    this.world = world;
    this.items = new Map(world.items.map((i) => [i.id, i]));
    this.stations = new Map(world.stations.map((s) => [s.id, s]));
    this.producers = new Map(world.recipes.map((r) => [r.output.item, r]));
  }

  get ticks(): number {
    return this.tick;
  }

  count(item: string): number {
    return this.stock.get(item) ?? 0;
  }

  private bestTier(): number {
    let best = 0;
    for (const [id, n] of this.stock) {
      if (n > 0) best = Math.max(best, this.items.get(id)?.toolTier ?? 0);
    }
    return best;
  }

  private record<T extends Outcome>(tool: string, args: Record<string, unknown>, result: T): T {
    this.log.push({
      tick: this.tick,
      tool,
      args,
      ok: result.ok,
      ...(result.ok ? {} : { error: result.error }),
    });
    return result;
  }

  survey() {
    const gatherable = this.world.items
      .filter((i) => i.gather)
      .map((i) => ({ item: i.id, description: i.description, tierNeeded: i.gather?.minTier ?? 0, perTick: i.gather?.yield ?? 1 }));
    return this.record("survey", {}, {
      ok: true as const,
      tick: this.tick,
      world: this.world.name,
      description: this.world.description,
      gatherable,
      stations: this.world.stations.map((s) => s.id),
      tasks: this.world.tasks.map((t) => ({ id: t.id, goal: t.goal, ...(t.note ? { note: t.note } : {}) })),
    });
  }

  recipeLookup(item: string) {
    const known = this.items.get(item);
    if (!known) return this.record("recipe_lookup", { item }, fail("unknown_item", `There is no item called '${item}'.`));
    const recipe = this.producers.get(item);
    if (!recipe) {
      return this.record("recipe_lookup", { item }, {
        ok: true as const,
        tick: this.tick,
        item,
        description: known.description,
        craftable: false,
        gatherable: known.gather !== undefined,
        ...(known.toolTier ? { toolTier: known.toolTier } : {}),
      });
    }
    return this.record("recipe_lookup", { item }, {
      ok: true as const,
      tick: this.tick,
      item,
      description: known.description,
      craftable: true,
      output: recipe.output,
      inputs: recipe.inputs,
      ...(recipe.station ? { station: recipe.station } : {}),
      ...(recipe.fuel ? { fuel: recipe.fuel } : {}),
      ...(known.toolTier ? { toolTier: known.toolTier } : {}),
    });
  }

  recipesUsing(item: string) {
    if (!this.items.has(item)) return this.record("recipes_using", { item }, fail("unknown_item", `There is no item called '${item}'.`));
    const uses = this.world.recipes
      .filter((r) => r.inputs.some((i) => i.item === item) || r.fuel?.item === item)
      .map((r) => r.output.item);
    const stationUses = this.world.stations.filter((s) => s.item === item).map((s) => s.id);
    return this.record("recipes_using", { item }, {
      ok: true as const,
      tick: this.tick,
      item,
      makes: uses,
      placesAsStation: stationUses,
    });
  }

  inventory() {
    const items = Object.fromEntries([...this.stock].filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
    return this.record("inventory", {}, {
      ok: true as const,
      tick: this.tick,
      items,
      stations: [...this.placed].sort(),
      toolTier: this.bestTier(),
      tasks: this.world.tasks.map((t) => ({ id: t.id, done: this.count(t.goal.item) >= t.goal.qty })),
    });
  }

  gather(resource: string, qty: number) {
    const args = { resource, qty };
    const item = this.items.get(resource);
    if (!Number.isInteger(qty) || qty <= 0) return this.record("gather", args, fail("invalid_quantity", "Quantity must be a positive whole number."));
    if (!item) return this.record("gather", args, fail("unknown_item", `There is no item called '${resource}'.`));
    if (!item.gather) {
      return this.record("gather", args, fail("not_gatherable", `'${resource}' cannot be gathered from the environment.`, "Some things must be made instead."));
    }
    const have = this.bestTier();
    if (have < item.gather.minTier) {
      return this.record("gather", args, fail("wrong_tool_tier", `Your tools are not strong enough to gather '${resource}'.`, "A better tool is needed.", { toolTier: have, tierNeeded: item.gather.minTier }));
    }
    this.tick += Math.ceil(qty / item.gather.yield);
    this.stock.set(resource, this.count(resource) + qty);
    return this.record("gather", args, { ok: true as const, tick: this.tick, gathered: { item: resource, qty }, have: this.count(resource) });
  }

  placeStation(station: string) {
    const args = { station };
    const def = this.stations.get(station);
    if (!def) return this.record("place_station", args, fail("unknown_station", `There is no station called '${station}'.`));
    if (this.count(def.item) < 1) {
      return this.record("place_station", args, fail("missing_ingredient", `You do not have what is needed to set up '${station}'.`, undefined, { needs: { item: def.item, qty: 1 } }));
    }
    this.tick += 1;
    this.stock.set(def.item, this.count(def.item) - 1);
    this.placed.add(station);
    return this.record("place_station", args, { ok: true as const, tick: this.tick, placed: station });
  }

  craft(item: string, qty: number) {
    const args = { item, qty };
    if (!Number.isInteger(qty) || qty <= 0) return this.record("craft", args, fail("invalid_quantity", "Quantity must be a positive whole number."));
    if (!this.items.has(item)) return this.record("craft", args, fail("unknown_item", `There is no item called '${item}'.`));
    const recipe = this.producers.get(item);
    if (!recipe) {
      return this.record("craft", args, fail("not_craftable", `'${item}' cannot be crafted.`, "Try gathering it, or look up what it is."));
    }
    if (recipe.station && !this.placed.has(recipe.station)) {
      return this.record("craft", args, fail("no_station_nearby", "This recipe must be made at a station, and none is set up here.", "Look at the recipe to see what it requires."));
    }
    const runs = Math.ceil(qty / recipe.output.qty);
    const short = recipe.inputs
      .map((i) => ({ item: i.item, need: i.qty * runs, have: this.count(i.item) }))
      .filter((i) => i.have < i.need);
    if (short.length > 0) {
      return this.record("craft", args, fail("missing_ingredient", "You are missing ingredients.", undefined, { short }));
    }
    if (recipe.fuel && this.count(recipe.fuel.item) < recipe.fuel.qty * runs) {
      return this.record("craft", args, fail("missing_fuel", "This recipe burns fuel and you do not have enough.", undefined, {
        fuel: { item: recipe.fuel.item, need: recipe.fuel.qty * runs, have: this.count(recipe.fuel.item) },
      }));
    }
    for (const i of recipe.inputs) this.stock.set(i.item, this.count(i.item) - i.qty * runs);
    if (recipe.fuel) this.stock.set(recipe.fuel.item, this.count(recipe.fuel.item) - recipe.fuel.qty * runs);
    const made = runs * recipe.output.qty;
    this.stock.set(item, this.count(item) + made);
    this.tick += runs;
    return this.record("craft", args, { ok: true as const, tick: this.tick, crafted: { item, qty: made }, have: this.count(item) });
  }
}
