import { readFileSync } from "node:fs";
import { WorldError } from "./errors.js";
import { MAX_ITEMS, MAX_RECIPES, MAX_STOCK_UNITS, MAX_TABLE_CELLS } from "./limits.js";
import { buildMatcher, itemsOf, trimPattern } from "./matcher.js";
import { parseWorld, type Recipe, type World } from "./schema.js";

/** Every item a recipe needs on the table. */
export function inputsOf(recipe: Recipe): string[] {
  return recipe.kind === "shapeless" ? recipe.inputs.map((i) => i.item) : itemsOf(recipe.pattern);
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) (seen.has(id) ? dupes : seen).add(id);
  return [...dupes];
}

/**
 * Semantic checks on a schema-valid world: size limits, duplicate ids, references, fit, recipe
 * conflicts and obtainability. Returns every problem found; an empty list means the world is valid.
 */
export function validateWorld(world: World): string[] {
  const problems: string[] = [];
  const cells = world.grid.rows * world.grid.cols;
  const stockUnits = Object.values(world.stock).reduce((sum, n) => sum + n, 0);

  if (world.items.length > MAX_ITEMS) problems.push(`world has ${world.items.length} items, above the limit of ${MAX_ITEMS}`);
  if (world.recipes.length > MAX_RECIPES) problems.push(`world has ${world.recipes.length} recipes, above the limit of ${MAX_RECIPES}`);
  if (cells > MAX_TABLE_CELLS) problems.push(`table has ${cells} cells, above the limit of ${MAX_TABLE_CELLS}`);
  if (stockUnits > MAX_STOCK_UNITS) problems.push(`total stock is ${stockUnits} units, above the limit of ${MAX_STOCK_UNITS}`);

  for (const id of duplicates(world.items.map((i) => i.id))) problems.push(`duplicate item id '${id}'`);
  for (const id of duplicates(world.recipes.map((r) => r.id))) problems.push(`duplicate recipe id '${id}'`);

  const known = new Set(world.items.map((i) => i.id));
  for (const item of Object.keys(world.stock)) {
    if (!known.has(item)) problems.push(`stock lists unknown item '${item}'`);
  }
  for (const recipe of world.recipes) {
    const refs = new Set([recipe.output.item, ...inputsOf(recipe)]);
    for (const ref of refs) {
      if (!known.has(ref)) problems.push(`recipe '${recipe.id}' uses unknown item '${ref}'`);
    }
  }

  for (const recipe of world.recipes) {
    if (recipe.kind === "shapeless") {
      const total = recipe.inputs.reduce((sum, i) => sum + i.qty, 0);
      if (total > cells) problems.push(`recipe '${recipe.id}' needs ${total} items on the table but the table has ${cells} cells`);
    } else {
      const trimmed = trimPattern(recipe.pattern);
      const rows = trimmed.length;
      const cols = trimmed[0]?.length ?? 0;
      if (rows > world.grid.rows || cols > world.grid.cols) {
        problems.push(`recipe '${recipe.id}' has a pattern of ${rows}x${cols}, which does not fit the ${world.grid.rows}x${world.grid.cols} table`);
      }
    }
  }

  for (const [a, b] of buildMatcher(world.recipes).conflicts) {
    problems.push(`recipes '${a}' and '${b}' can match the same table state`);
  }

  // An input is obtainable if it is in the stock, or is the output of a recipe whose own inputs are
  // all obtainable. A fixpoint over the recipes; no search.
  const obtainable = new Set(Object.keys(world.stock));
  for (let changed = true; changed; ) {
    changed = false;
    for (const recipe of world.recipes) {
      if (!obtainable.has(recipe.output.item) && inputsOf(recipe).every((i) => obtainable.has(i))) {
        obtainable.add(recipe.output.item);
        changed = true;
      }
    }
  }
  for (const recipe of world.recipes) {
    for (const input of new Set(inputsOf(recipe))) {
      if (known.has(input) && !obtainable.has(input)) problems.push(`recipe '${recipe.id}' needs '${input}', which cannot be obtained`);
    }
  }

  return problems;
}

/** Parse and fully validate world data. Throws one WorldError listing every problem. */
export function checkWorld(data: unknown): World {
  const world = parseWorld(data);
  const problems = validateWorld(world);
  if (problems.length > 0) throw new WorldError(problems);
  return world;
}

/** Read and validate a world file. Throws WorldError if it is unreadable or invalid. */
export function loadWorld(path: string): World {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new WorldError([`cannot read ${path}: ${e instanceof Error ? e.message : String(e)}`]);
  }
  return checkWorld(data);
}
