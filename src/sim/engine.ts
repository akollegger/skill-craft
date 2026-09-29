import { buildMatcher, couldBecomeMatch, type Grid, type Matcher } from "./matcher.js";
import { RunLog } from "./runlog.js";
import type { World } from "./schema.js";

export type ErrorCode =
  | "out_of_bounds"
  | "cell_occupied"
  | "cell_empty"
  | "not_in_inventory"
  | "nothing_to_craft"
  | "unknown_item";

/** A refused call. Messages state the violated constraint and never the remedy. */
export interface Refusal {
  ok: false;
  error: ErrorCode;
  message: string;
}

/** What the agent sees of the table: its contents and what `craft` would make right now. */
export interface Preview {
  ok: true;
  grid: Grid;
  craftable: string | null;
  /** Only in worlds with `hints: "partial"`: whether adding items could still reach a match. */
  partial?: boolean;
}

export interface Crafted {
  ok: true;
  crafted: { item: string; qty: number };
}

const refuse = (error: ErrorCode, message: string): Refusal => ({ ok: false, error, message });

/**
 * One run of the crafting table. Deterministic: no randomness and no clock, so the same world and
 * the same sequence of calls always give the same results.
 */
export class Game {
  readonly world: World;
  /** Every tool call in this run, in order. */
  readonly log: RunLog;
  private readonly matcher: Matcher;
  private readonly known: ReadonlySet<string>;
  private readonly held = new Map<string, number>();
  private grid: Grid;

  constructor(world: World, options: { log?: RunLog } = {}) {
    this.world = world;
    this.log = options.log ?? new RunLog();
    this.matcher = buildMatcher(world.recipes);
    this.known = new Set(world.items.map((i) => i.id));
    for (const [item, qty] of Object.entries(world.stock)) this.held.set(item, qty);
    this.grid = Array.from({ length: world.grid.rows }, () => Array<string | null>(world.grid.cols).fill(null));
  }

  /** Units of an item currently held (not counting items on the table). */
  count(item: string): number {
    return this.held.get(item) ?? 0;
  }

  private inBounds(row: number, col: number): boolean {
    return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0 && row < this.grid.length && col < (this.grid[0]?.length ?? 0);
  }

  preview(): Preview {
    return {
      ok: true,
      grid: this.grid.map((row) => [...row]),
      craftable: this.matcher.match(this.grid)?.output.item ?? null,
      ...(this.world.hints === "partial" ? { partial: couldBecomeMatch(this.grid, this.world.recipes) } : {}),
    };
  }

  /** Append a call to the run log and return its outcome unchanged. */
  record<T extends object>(tool: string, args: Record<string, unknown>, outcome: T): T {
    const refused = "ok" in outcome && outcome.ok === false;
    this.log.append({
      tool,
      args,
      ok: !refused,
      ...(refused && "error" in outcome ? { error: String(outcome.error) } : {}),
      ...("crafted" in outcome ? { crafted: outcome.crafted as { item: string; qty: number } } : {}),
    });
    return outcome;
  }

  /** The table as it is now. Changes nothing. */
  look(): Preview {
    return this.record("look", {}, this.preview());
  }

  /** Items held and their quantities, keys sorted, zero quantities omitted. Nothing else. */
  inventory(): { items: Record<string, number> } {
    return this.record("inventory", {}, this.heldItems());
  }

  private heldItems(): { items: Record<string, number> } {
    const entries = [...this.held].filter(([, n]) => n > 0).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return { items: Object.fromEntries(entries) };
  }

  /** Move one unit of `item` from the inventory to a cell. */
  place(item: string, row: number, col: number): Preview | Refusal {
    return this.record("place", { item, row, col }, this.doPlace(item, row, col));
  }

  private doPlace(item: string, row: number, col: number): Preview | Refusal {
    if (!this.inBounds(row, col)) return refuse("out_of_bounds", `Row ${row}, column ${col} is outside the table.`);
    if (!this.known.has(item)) return refuse("unknown_item", `There is no item called '${item}'.`);
    if (this.grid[row]?.[col] !== null) return refuse("cell_occupied", "That cell already holds an item.");
    if (this.count(item) < 1) return refuse("not_in_inventory", `You hold none of '${item}'.`);
    this.held.set(item, this.count(item) - 1);
    (this.grid[row] as (string | null)[])[col] = item;
    return this.preview();
  }

  /** Move the item in a cell back to the inventory. */
  remove(row: number, col: number): Preview | Refusal {
    return this.record("remove", { row, col }, this.doRemove(row, col));
  }

  private doRemove(row: number, col: number): Preview | Refusal {
    if (!this.inBounds(row, col)) return refuse("out_of_bounds", `Row ${row}, column ${col} is outside the table.`);
    const item = this.grid[row]?.[col];
    if (item === null || item === undefined) return refuse("cell_empty", "That cell holds nothing.");
    this.held.set(item, this.count(item) + 1);
    (this.grid[row] as (string | null)[])[col] = null;
    return this.preview();
  }

  /** Move every item on the table back to the inventory. Never refused. */
  clear(): Preview {
    this.putAllBack();
    return this.record("clear", {}, this.preview());
  }

  private putAllBack(): void {
    for (const item of this.grid.flat()) {
      if (item !== null) this.held.set(item, this.count(item) + 1);
    }
    this.grid = this.grid.map((row) => row.map(() => null));
  }

  /** Commit the recipe the table matches: consume the table, add the output to the inventory. */
  craft(): Crafted | Refusal {
    return this.record("craft", {}, this.doCraft());
  }

  private doCraft(): Crafted | Refusal {
    const recipe = this.matcher.match(this.grid);
    if (!recipe) return refuse("nothing_to_craft", "Nothing can be made from what is on the table.");
    this.grid = this.grid.map((row) => row.map(() => null));
    this.held.set(recipe.output.item, this.count(recipe.output.item) + recipe.output.qty);
    return { ok: true, crafted: { item: recipe.output.item, qty: recipe.output.qty } };
  }
}
