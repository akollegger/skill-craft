import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { UnknownModel, UnknownProvider } from "./errors.js";
import { REPO } from "./paths.js";
import { findProvider, providerPrefixes } from "./providers.js";

/** Used when a run names no model. A run still records which model it asked for (null here) and which ran. */
export const DEFAULT_MODEL = "anthropic/claude-sonnet-5-5";

export interface ModelRef {
  /** The provider's prefix. */
  provider: string;
  /** The id the provider's API takes. */
  id: string;
  /** The canonical form, `<provider>/<model>`, which is what a run records and what the price table is keyed by. */
  spec: string;
}

/**
 * `<provider>/<model>`, or a bare `claude-<id>` as shorthand for `anthropic/claude-<id>`. A short model name is
 * expanded by its provider's row, and the spec returned is always canonical. An unknown provider and a bad model
 * name are different errors, both with fixed text.
 */
export function parseModelSpec(spec: string): ModelRef {
  const trimmed = spec.trim();
  const slash = trimmed.indexOf("/");
  let prefix: string;
  let short: string;
  if (slash > 0) {
    prefix = trimmed.slice(0, slash);
    short = trimmed.slice(slash + 1);
  } else {
    prefix = "anthropic";
    short = trimmed;
  }
  const row = findProvider(prefix);
  if (row === undefined) {
    if (slash > 0) throw new UnknownProvider(prefix, providerPrefixes());
    throw new UnknownModel(spec);
  }
  if (!row.shortPattern.test(short)) throw new UnknownModel(spec);
  const id = row.expand(short);
  return { provider: prefix, id, spec: row.normaliseId(id) };
}

/**
 * A recorded model name in canonical form: a bare `claude-<id>`, as earlier run folders hold it, is read as
 * `anthropic/<id>`. It never throws and never rewrites a file; a name it does not recognise is returned as found.
 */
export function canonicalSpec(spec: string): string {
  return /^claude-[a-z0-9.-]+$/.test(spec) ? `anthropic/${spec}` : spec;
}

/** US dollars per million tokens. `cacheWrite` is absent for a provider that does not charge for it separately. */
export interface Price {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export type PriceTable = Record<string, Price>;

export const PRICES_PATH = join(REPO, "prices.json");

/** The operator's price table, keyed by canonical spec (a bare Claude key is read as `anthropic/<id>`). A missing file is an empty table: costs are then null. */
export function loadPrices(path = PRICES_PATH): PriceTable {
  if (!existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const table: PriceTable = {};
  for (const [key, p] of Object.entries(raw)) {
    if (key.startsWith("_")) continue; // notes
    const spec = canonicalSpec(key);
    const price = p as Partial<Price>;
    if (typeof price.input !== "number" || typeof price.output !== "number") continue;
    table[spec] = { input: price.input, output: price.output, ...(typeof price.cacheRead === "number" ? { cacheRead: price.cacheRead } : {}), ...(typeof price.cacheWrite === "number" ? { cacheWrite: price.cacheWrite } : {}) };
  }
  return table;
}

export interface Tokens {
  /** Input tokens that were not served from or written to the cache, as the run's usage has always counted them. */
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * The cost of one set of tokens, or null when there is no price for the model. Cached reads and writes are priced
 * separately when the table has a rate for them; otherwise they count at the input rate.
 */
export function costOf(tokens: Tokens, price: Price | undefined): number | null {
  if (price === undefined) return null;
  const usd = tokens.input * price.input + tokens.cacheRead * (price.cacheRead ?? price.input) + tokens.cacheWrite * (price.cacheWrite ?? price.input) + tokens.output * price.output;
  return usd / 1_000_000;
}

/** The price for a model given in either form, or undefined when the table has none. */
export const priceFor = (spec: string, table: PriceTable = loadPrices()): Price | undefined => table[canonicalSpec(spec)];
