import type { World } from "./schema.js";
import { validateWorld, WorldError } from "./world-loader.js";

export interface RenameOptions {
  seed: number;
  /** Also nudge some input quantities, so a re-skinned world is not just a relabelling. */
  perturb?: boolean;
  /** Replace flavour text with category-only descriptions, so prose can't reveal what an item is. */
  opaque?: boolean;
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ONSETS = ["b", "d", "f", "g", "k", "l", "m", "n", "p", "r", "s", "t", "v", "z", "br", "dr", "gl", "kr", "pl", "th", "vr", "zh"];
const VOWELS = ["a", "e", "i", "o", "u", "ae", "io", "ou"];
const CODAS = ["", "", "n", "r", "s", "x", "th", "m", "l"];

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

/**
 * Re-skin a world with invented vocabulary. Structure (quantities, tiers, stations, task shapes)
 * is preserved unless `perturb` is set, so an agent cannot lean on names to guess recipes.
 */
export function renameWorld(base: World, options: RenameOptions): World {
  const next = rng(options.seed);
  const taken = new Set<string>([...base.items.map((i) => i.id), ...base.stations.map((s) => s.id)]);
  const map = new Map<string, string>();
  for (const i of base.items) map.set(i.id, word(next, taken));
  const stationMap = new Map<string, string>();
  for (const s of base.stations) stationMap.set(s.id, word(next, taken));

  const item = (id: string) => map.get(id) ?? id;
  const station = (id: string) => stationMap.get(id) ?? id;
  const bump = (n: number): number => {
    if (!options.perturb || next() > 0.35) return n;
    return Math.max(1, n + (next() < 0.5 ? -1 : 1));
  };

  const world: World = {
    name: `${word(next, taken)}-${options.seed}`,
    description: options.opaque ? "An unfamiliar workshop. Find out what can be made." : base.description,
    items: base.items.map((i) => ({
      ...i,
      id: item(i.id),
      description: options.opaque ? (i.gather ? "A raw material." : i.toolTier ? "A tool." : "A made item.") : i.description,
    })),
    stations: base.stations.map((s) => ({ id: station(s.id), item: item(s.item) })),
    recipes: base.recipes.map((r) => ({
      id: `r-${item(r.output.item)}`,
      output: { item: item(r.output.item), qty: r.output.qty },
      inputs: r.inputs.map((i) => ({ item: item(i.item), qty: bump(i.qty) })),
      ...(r.station ? { station: station(r.station) } : {}),
      ...(r.fuel ? { fuel: { item: item(r.fuel.item), qty: r.fuel.qty } } : {}),
    })),
    tasks: base.tasks.map((t) => ({
      id: `make-${item(t.goal.item)}`,
      goal: { item: item(t.goal.item), qty: t.goal.qty },
      ...(t.note ? { note: t.note } : {}),
    })),
  };

  const problems = validateWorld(world);
  if (problems.length > 0) throw new WorldError(problems);
  return world;
}
