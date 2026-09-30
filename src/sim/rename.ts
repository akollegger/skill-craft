import { WorldError } from "./errors.js";
import type { Goal } from "./goals.js";
import { checkWorld, validateWorld } from "./loader.js";
import { trimPattern, type Grid } from "./matcher.js";
import { rng } from "./prng.js";
import type { Recipe, World } from "./schema.js";
import { solve } from "./solver.js";

export interface RenameOptions {
  seed: number;
  /** Also change some quantities and patterns, so the variant is not just a relabelling. */
  perturb?: boolean;
  /** Keep the base world's descriptions instead of reducing them to a bare category. */
  keepDescriptions?: boolean;
  /** How many perturbations to draw before giving up. Default 40. */
  retries?: number;
}

export interface Renamed {
  world: World;
  goals: Goal[];
}

const ONSETS = ["b", "d", "f", "g", "k", "l", "m", "n", "p", "r", "s", "t", "v", "z", "br", "dr", "gl", "kr", "pl", "th", "vr", "zh"];
const VOWELS = ["a", "e", "i", "o", "u", "ae", "io", "ou"];
const CODAS = ["", "", "n", "r", "s", "x", "th", "m", "l"];

/** An invented, pronounceable word that is not in `taken`; added to it. */
function word(next: () => number, taken: Set<string>): string {
  const pick = <T>(xs: T[]): T => xs[Math.floor(next() * xs.length)] as T;
  for (;;) {
    const syllables = 2 + Math.floor(next() * 2);
    let w = "";
    for (let i = 0; i < syllables; i++) w += pick(ONSETS) + pick(VOWELS) + (i === syllables - 1 ? pick(CODAS) : "");
    if (!taken.has(w)) {
      taken.add(w);
      return w;
    }
  }
}

/** Nudge some recipes: a shapeless quantity by one, or a shaped pattern by moving or swapping cells. */
function perturb(recipes: readonly Recipe[], next: () => number): Recipe[] {
  return recipes.map((recipe) => {
    if (next() > 0.35) return recipe;
    if (recipe.kind === "shapeless") {
      const which = Math.floor(next() * recipe.inputs.length);
      const up = next() < 0.5;
      return {
        ...recipe,
        inputs: recipe.inputs.map((input, i) =>
          i === which ? { ...input, qty: input.qty === 1 || up ? input.qty + 1 : input.qty - 1 } : input,
        ),
      };
    }
    const pattern: Grid = trimPattern(recipe.pattern).map((row) => [...row]);
    const filled: [number, number][] = [];
    const empty: [number, number][] = [];
    pattern.forEach((row, r) => row.forEach((cell, c) => (cell === null ? empty : filled).push([r, c])));
    const at = (cells: [number, number][]) => cells[Math.floor(next() * cells.length)] as [number, number];
    if (empty.length > 0 && (next() < 0.5 || filled.length < 2)) {
      const [fr, fc] = at(filled);
      const [er, ec] = at(empty);
      (pattern[er] as (string | null)[])[ec] = pattern[fr]?.[fc] ?? null;
      (pattern[fr] as (string | null)[])[fc] = null;
    } else if (filled.length >= 2) {
      const [ar, ac] = at(filled);
      const [br, bc] = at(filled);
      const held = pattern[ar]?.[ac] ?? null;
      (pattern[ar] as (string | null)[])[ac] = pattern[br]?.[bc] ?? null;
      (pattern[br] as (string | null)[])[bc] = held;
    }
    return { ...recipe, pattern: trimPattern(pattern) };
  });
}

/**
 * Re-skin a world with invented item names (and, by default, category-only descriptions), mapping
 * its goals along (without their notes). Structure is preserved unless `perturb` is set. Reproducible from the seed.
 * Throws WorldError if no valid, solvable variant can be produced.
 */
export function renameWorld(base: World, goals: readonly Goal[], options: RenameOptions): Renamed {
  const next = rng(options.seed);
  const taken = new Set(base.items.map((i) => i.id));
  const names = new Map(base.items.map((i) => [i.id, word(next, taken)]));
  const name = (id: string): string => names.get(id) ?? id;
  const worldName = `${word(next, taken)}-${options.seed}`;

  const description = (id: string, original: string): string =>
    options.keepDescriptions ? original : id in base.stock ? "A raw material." : "A made item.";

  const renamed: World = {
    name: worldName,
    description: options.keepDescriptions ? base.description : "An unfamiliar workshop. Find out what can be made.",
    grid: base.grid,
    hints: base.hints,
    stock: Object.fromEntries(Object.entries(base.stock).map(([item, qty]) => [name(item), qty])),
    items: base.items.map((i) => ({ id: name(i.id), description: description(i.id, i.description) })),
    recipes: base.recipes.map((r, index): Recipe => {
      const id = `r${index + 1}-${name(r.output.item)}`;
      const output = { item: name(r.output.item), qty: r.output.qty };
      return r.kind === "shapeless"
        ? { id, kind: "shapeless", inputs: r.inputs.map((i) => ({ item: name(i.item), qty: i.qty })), output }
        : { id, kind: "shaped", pattern: r.pattern.map((row) => row.map((cell) => (cell === null ? null : name(cell)))), output };
    }),
  };
  // Notes are authored prose that names base items and can hint at recipes, so they are not carried over.
  const mappedGoals: Goal[] = goals.map((g) => ({ item: name(g.item), qty: g.qty }));

  const solvable = (world: World): boolean => mappedGoals.every((g) => solve(world, g).reachable);

  if (!options.perturb) {
    checkWorld(renamed);
    if (!solvable(renamed)) throw new WorldError([`the re-skinned world is not solvable for its goals (seed ${options.seed})`]);
    return { world: renamed, goals: mappedGoals };
  }

  const attempts = options.retries ?? 40;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const recipes = perturb(renamed.recipes, next);
    if (JSON.stringify(recipes) === JSON.stringify(renamed.recipes)) continue;
    const candidate: World = { ...renamed, recipes };
    if (validateWorld(candidate).length === 0 && solvable(candidate)) return { world: candidate, goals: mappedGoals };
  }
  throw new WorldError([`no valid perturbed variant found for seed ${options.seed} after ${attempts} attempts`]);
}
