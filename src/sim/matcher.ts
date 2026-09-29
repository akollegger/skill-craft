import type { Recipe } from "./schema.js";

/** The table: rows of cells, each an item id or null. */
export type Grid = (string | null)[][];

interface Stack {
  item: string;
  qty: number;
}

/** Remove empty border rows and columns. A pattern with no items becomes an empty array. */
export function trimPattern(pattern: Grid): Grid {
  let top = Infinity;
  let bottom = -1;
  let left = Infinity;
  let right = -1;
  pattern.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell === null) return;
      top = Math.min(top, r);
      bottom = Math.max(bottom, r);
      left = Math.min(left, c);
      right = Math.max(right, c);
    }),
  );
  if (bottom < 0) return [];
  return pattern.slice(top, bottom + 1).map((row) => row.slice(left, right + 1));
}

/** Every item in a pattern or grid, one entry per occupied cell. */
export function itemsOf(grid: Grid): string[] {
  return grid.flat().filter((cell): cell is string => cell !== null);
}

/** Canonical form of a multiset of items, for example `a:2|b:1`. */
export function multisetKey(items: Iterable<string>): string {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([item, n]) => `${item}:${n}`)
    .join("|");
}

export function shapelessKey(inputs: readonly Stack[]): string {
  return multisetKey(inputs.flatMap(({ item, qty }) => Array<string>(qty).fill(item)));
}

/** Canonical form of a pattern: its trimmed bounding box, so position does not matter. */
export function shapedKey(pattern: Grid): string {
  return JSON.stringify(trimPattern(pattern));
}

export function tableKeys(grid: Grid): { multiset: string; shaped: string } {
  return { multiset: multisetKey(itemsOf(grid)), shaped: shapedKey(grid) };
}

export interface Matcher {
  /** The single recipe whose items (and arrangement, for shaped recipes) equal the table exactly. */
  match(grid: Grid): Recipe | null;
  /** Pairs of recipe ids that could match the same table state. Empty for a valid world. */
  conflicts: [string, string][];
}

function conflict(a: Recipe, b: Recipe): boolean {
  if (a.kind === "shapeless" && b.kind === "shapeless") return shapelessKey(a.inputs) === shapelessKey(b.inputs);
  if (a.kind === "shaped" && b.kind === "shaped") return shapedKey(a.pattern) === shapedKey(b.pattern);
  const [sl, sh] = a.kind === "shapeless" ? [a, b] : [b, a];
  if (sl.kind !== "shapeless" || sh.kind !== "shaped") return false;
  // A shaped recipe's arrangement is itself a table state whose items equal the shapeless multiset.
  return shapelessKey(sl.inputs) === multisetKey(itemsOf(sh.pattern));
}

export function buildMatcher(recipes: readonly Recipe[]): Matcher {
  const byMultiset = new Map<string, Recipe>();
  const byPattern = new Map<string, Recipe>();
  for (const r of recipes) {
    if (r.kind === "shapeless") {
      const key = shapelessKey(r.inputs);
      if (!byMultiset.has(key)) byMultiset.set(key, r);
    } else {
      const key = shapedKey(r.pattern);
      if (!byPattern.has(key)) byPattern.set(key, r);
    }
  }

  const conflicts: [string, string][] = [];
  for (let i = 0; i < recipes.length; i++) {
    for (let j = i + 1; j < recipes.length; j++) {
      const a = recipes[i];
      const b = recipes[j];
      if (a && b && conflict(a, b)) conflicts.push([a.id, b.id]);
    }
  }

  return {
    match(grid) {
      if (itemsOf(grid).length === 0) return null;
      const keys = tableKeys(grid);
      return byMultiset.get(keys.multiset) ?? byPattern.get(keys.shaped) ?? null;
    },
    conflicts,
  };
}

/**
 * Whether the table could still become an exact match by adding at least one item, without
 * removing any. Used for the `partial` hint; it never says which recipe or item.
 */
export function couldBecomeMatch(grid: Grid, recipes: readonly Recipe[]): boolean {
  const placed = itemsOf(grid);
  if (placed.length === 0) return false;
  const have = new Map<string, number>();
  for (const item of placed) have.set(item, (have.get(item) ?? 0) + 1);
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  for (const recipe of recipes) {
    if (recipe.kind === "shapeless") {
      const need = new Map<string, number>();
      let total = 0;
      for (const { item, qty } of recipe.inputs) {
        need.set(item, (need.get(item) ?? 0) + qty);
        total += qty;
      }
      if (placed.length < total && [...have].every(([item, n]) => n <= (need.get(item) ?? 0))) return true;
      continue;
    }
    const pattern = trimPattern(recipe.pattern);
    const height = pattern.length;
    const width = pattern[0]?.length ?? 0;
    if (placed.length >= itemsOf(pattern).length) continue;
    for (let dr = 0; dr + height <= rows; dr++) {
      for (let dc = 0; dc + width <= cols; dc++) {
        const fits = grid.every((row, r) =>
          row.every((cell, c) => cell === null || pattern[r - dr]?.[c - dc] === cell),
        );
        if (fits) return true;
      }
    }
  }
  return false;
}
