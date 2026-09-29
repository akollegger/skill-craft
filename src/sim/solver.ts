import { SLACK_CAP, SOLVER_STATE_BUDGET } from "./limits.js";
import { trimPattern } from "./matcher.js";
import type { Recipe, World } from "./schema.js";

export interface SolverGoal {
  item: string;
  qty: number;
}

export interface ToolCall {
  tool: "place" | "craft";
  args: Record<string, unknown>;
}

export interface BestRun {
  goal: SolverGoal;
  reachable: true;
  /** Fewest recipe applications that reach the goal. */
  minCrafts: number;
  /** Fewest world-changing tool calls (`place` and `craft`) that reach the goal. */
  minCalls: number;
  /** Largest w, up to the cap, such that any w recipe applications still leave the goal reachable. */
  slack: number;
  statesVisited: number;
  /** The tool calls of the minimum-call path, replayable against a fresh world. */
  calls: ToolCall[];
}

export interface UnreachableGoal {
  goal: SolverGoal;
  reachable: false;
  statesVisited: number;
}

export interface SolveOptions {
  stateBudget?: number;
  slackCap?: number;
}

/** Thrown when the search would visit more inventory states than the budget allows. */
export class SolverBudgetError extends Error {
  readonly budget: number;

  constructor(budget: number) {
    super(`the search exceeded its state budget of ${budget}; the world is too large to solve exactly`);
    this.name = "SolverBudgetError";
    this.budget = budget;
  }
}

interface Compiled {
  /** [item index, count] pairs the recipe consumes. */
  inputs: [number, number][];
  output: [number, number];
  /** Tool calls to make it: one `place` per item plus the `craft`. */
  cost: number;
  /** The `place` calls that put its items on the table. */
  places: ToolCall[];
}

function compile(world: World, recipe: Recipe, index: Map<string, number>): Compiled {
  const at = (item: string): number => {
    const i = index.get(item);
    if (i === undefined) throw new Error(`recipe '${recipe.id}' uses unknown item '${item}'`);
    return i;
  };
  const counts = new Map<number, number>();
  const places: ToolCall[] = [];
  const place = (item: string, row: number, col: number) => places.push({ tool: "place", args: { item, row, col } });

  if (recipe.kind === "shapeless") {
    let n = 0;
    for (const { item, qty } of recipe.inputs) {
      counts.set(at(item), (counts.get(at(item)) ?? 0) + qty);
      for (let k = 0; k < qty; k++, n++) place(item, Math.floor(n / world.grid.cols), n % world.grid.cols);
    }
  } else {
    trimPattern(recipe.pattern).forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell === null) return;
        counts.set(at(cell), (counts.get(at(cell)) ?? 0) + 1);
        place(cell, r, c);
      }),
    );
  }
  return {
    inputs: [...counts],
    output: [at(recipe.output.item), recipe.output.qty],
    cost: places.length + 1,
    places,
  };
}

/** A minimal binary min-heap of [priority, value]. */
class Heap {
  private readonly data: [number, number][] = [];
  get size(): number {
    return this.data.length;
  }
  push(priority: number, value: number): void {
    const d = this.data;
    d.push([priority, value]);
    for (let i = d.length - 1; i > 0; ) {
      const parent = (i - 1) >> 1;
      if ((d[parent] as [number, number])[0] <= (d[i] as [number, number])[0]) break;
      [d[parent], d[i]] = [d[i] as [number, number], d[parent] as [number, number]];
      i = parent;
    }
  }
  pop(): [number, number] {
    const d = this.data;
    const top = d[0] as [number, number];
    const last = d.pop() as [number, number];
    if (d.length > 0) {
      d[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < d.length && (d[l] as [number, number])[0] < (d[m] as [number, number])[0]) m = l;
        if (r < d.length && (d[r] as [number, number])[0] < (d[m] as [number, number])[0]) m = r;
        if (m === i) break;
        [d[m], d[i]] = [d[i] as [number, number], d[m] as [number, number]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Find the best run for a goal. Between crafts the table is empty, so the search is over inventory
 * states: applying a recipe removes its inputs and adds its output. Once the goal is held the run
 * is done, so goal states are not expanded. Throws SolverBudgetError if more than `stateBudget`
 * distinct inventories are reachable.
 */
export function solve(world: World, goal: SolverGoal, options: SolveOptions = {}): BestRun | UnreachableGoal {
  const budget = options.stateBudget ?? SOLVER_STATE_BUDGET;
  const cap = options.slackCap ?? SLACK_CAP;
  const index = new Map(world.items.map((item, i) => [item.id, i]));
  const goalIndex = index.get(goal.item);
  if (goalIndex === undefined) throw new Error(`goal wants unknown item '${goal.item}'`);
  const recipes = world.recipes.map((r) => compile(world, r, index));

  const start = world.items.map((item) => world.stock[item.id] ?? 0);
  const states: number[][] = [start];
  const byKey = new Map<string, number>([[start.join(","), 0]]);
  const isGoal: boolean[] = [];
  /** For each state, the [recipe, next state] edges out of it. */
  const edges: [number, number][][] = [];

  for (let i = 0; i < states.length; i++) {
    const state = states[i] as number[];
    const met = (state[goalIndex] as number) >= goal.qty;
    isGoal.push(met);
    const out: [number, number][] = [];
    edges.push(out);
    if (met) continue;
    recipes.forEach((recipe, r) => {
      if (!recipe.inputs.every(([item, n]) => (state[item] as number) >= n)) return;
      const next = state.slice();
      for (const [item, n] of recipe.inputs) next[item] = (next[item] as number) - n;
      next[recipe.output[0]] = (next[recipe.output[0]] as number) + recipe.output[1];
      const key = next.join(",");
      let j = byKey.get(key);
      if (j === undefined) {
        if (states.length >= budget) throw new SolverBudgetError(budget);
        j = states.length;
        states.push(next);
        byKey.set(key, j);
      }
      out.push([r, j]);
    });
  }

  const goalStates = isGoal.flatMap((met, i) => (met ? [i] : []));
  if (goalStates.length === 0) return { goal, reachable: false, statesVisited: states.length };

  // Fewest crafts: breadth-first from the start.
  const depth = new Array<number>(states.length).fill(-1);
  depth[0] = 0;
  for (let queue = [0], head = 0; head < queue.length; head++) {
    const i = queue[head] as number;
    for (const [, j] of edges[i] as [number, number][]) {
      if (depth[j] === -1) {
        depth[j] = (depth[i] as number) + 1;
        queue.push(j);
      }
    }
  }
  const minCrafts = Math.min(...goalStates.map((i) => depth[i] as number));

  // Fewest tool calls: least-cost search where applying a recipe costs one place per item plus a craft.
  const dist = new Array<number>(states.length).fill(Infinity);
  const via = new Array<[number, number] | undefined>(states.length).fill(undefined);
  dist[0] = 0;
  const heap = new Heap();
  heap.push(0, 0);
  while (heap.size > 0) {
    const [d, i] = heap.pop();
    if (d > (dist[i] as number)) continue;
    for (const [r, j] of edges[i] as [number, number][]) {
      const nd = d + (recipes[r] as Compiled).cost;
      if (nd < (dist[j] as number)) {
        dist[j] = nd;
        via[j] = [i, r];
        heap.push(nd, j);
      }
    }
  }
  const best = goalStates.reduce((a, b) => ((dist[b] as number) < (dist[a] as number) ? b : a));
  const path: number[] = [];
  for (let at = best; at !== 0; ) {
    const [prev, r] = via[at] as [number, number];
    path.unshift(r);
    at = prev;
  }
  const calls = path.flatMap((r) => [...(recipes[r] as Compiled).places, { tool: "craft" as const, args: {} }]);

  // Slack: which states can still reach a goal state?
  const reverse: number[][] = states.map(() => []);
  edges.forEach((out, i) => out.forEach(([, j]) => (reverse[j] as number[]).push(i)));
  const canReach = new Array<boolean>(states.length).fill(false);
  const stack = [...goalStates];
  for (const g of goalStates) canReach[g] = true;
  while (stack.length > 0) {
    const j = stack.pop() as number;
    for (const i of reverse[j] as number[]) {
      if (!canReach[i]) {
        canReach[i] = true;
        stack.push(i);
      }
    }
  }
  const memo = new Map<number, boolean>();
  const survives = (i: number, w: number): boolean => {
    if (isGoal[i]) return true;
    if (!canReach[i]) return false;
    if (w === 0) return true;
    const key = i * (cap + 1) + w;
    const known = memo.get(key);
    if (known !== undefined) return known;
    const result = (edges[i] as [number, number][]).every(([, j]) => survives(j, w - 1));
    memo.set(key, result);
    return result;
  };
  let slack = 0;
  while (slack < cap && survives(0, slack + 1)) slack++;

  return { goal, reachable: true, minCrafts, minCalls: dist[best] as number, slack, statesVisited: states.length, calls };
}
