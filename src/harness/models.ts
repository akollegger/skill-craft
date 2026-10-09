import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { UnknownModel } from "./errors.js";
import { REPO } from "./paths.js";

export type Provider = "anthropic" | "fireworks";

/** Used when a run names no model. A run still records which model it asked for (null here) and which ran. */
export const DEFAULT_MODEL = "claude-sonnet-5-5";

export interface ModelRef {
  provider: Provider;
  /** The id the provider's API takes. */
  id: string;
  /** The form that round-trips through `parseModelSpec` and is what a run records: a bare id for Claude. */
  spec: string;
}

/**
 * `claude-…` or `anthropic/claude-…` is Anthropic; `fireworks/<model>` is Fireworks, where a short name is the
 * model under `accounts/fireworks/models/` and a path starting `accounts/` is used as given.
 */
export function parseModelSpec(spec: string): ModelRef {
  const trimmed = spec.trim();
  if (trimmed.startsWith("fireworks/")) {
    const rest = trimmed.slice("fireworks/".length);
    if (rest === "") throw new UnknownModel(spec);
    return { provider: "fireworks", id: rest.startsWith("accounts/") ? rest : `accounts/fireworks/models/${rest}`, spec: `fireworks/${rest}` };
  }
  const bare = trimmed.startsWith("anthropic/") ? trimmed.slice("anthropic/".length) : trimmed;
  if (!/^claude-[a-z0-9.-]+$/.test(bare)) throw new UnknownModel(spec);
  return { provider: "anthropic", id: bare, spec: bare };
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

/** The operator's price table, keyed by `ModelRef.spec`. A missing file is an empty table: costs are then null. */
export function loadPrices(path = PRICES_PATH): PriceTable {
  if (!existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const table: PriceTable = {};
  for (const [spec, p] of Object.entries(raw)) {
    if (spec.startsWith("_")) continue; // notes
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
