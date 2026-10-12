import { FAMILIES, glyphOf, ownPair, PALETTE_COUNT, type Glyph } from "../glyphs.js";

const PAIRS = FAMILIES.length * PALETTE_COUNT;

/** Nine and 64 share no factor, so stepping by nine visits every pair, and each step changes both the family and the palette. */
const STEP = 9;

/**
 * Gives each of a world's items without drawn art a glyph, so that no two share a family and a palette while there are 64 or fewer. The items
 * are taken in code-unit order of their names, each starting from the pair its own name hashes to and stepping on while that pair is taken, so
 * an item whose pair is free wears exactly the glyph `glyphOf` gives its name, and the result does not depend on the order of the list. Past
 * 64 items the pairs start over and the variant and the marks are what separate the rest. A pure function of the names: no clock, no randomness.
 */
export function allocate(names: readonly string[]): Map<string, Glyph> {
  const out = new Map<string, Glyph>();
  let taken = new Set<number>();
  for (const name of [...new Set(names)].sort()) {
    if (taken.size === PAIRS) taken = new Set();
    let pair = ownPair(name);
    while (taken.has(pair)) pair = (pair + STEP) % PAIRS;
    taken.add(pair);
    out.set(name, glyphOf(name, pair));
  }
  return out;
}
