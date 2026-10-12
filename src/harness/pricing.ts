import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PriceAliasesInvalid } from "./errors.js";
import { canonicalSpec, loadPrices, type Price, type PriceTable } from "./models.js";
import { REPO } from "./paths.js";

/**
 * Where a price comes from when the provider does not report a cost (ADR-006 §2.4, amended 2026-10-12): a pin in
 * `prices.json`, else a market quote read from OpenRouter's public model list for a model with an explicit alias, else none.
 * A provider-reported cost is read from the responses by the driver and never reaches this file.
 */

/** A price a run was costed with, and where it came from, as recorded in the run's score. */
export interface PriceQuote {
  source: "pin" | "market-quote";
  /** The OpenRouter id for a quote; null for a pin. */
  openRouterId: string | null;
  /** When the list was read, for a quote (the cache's time when the cache was used); null for a pin. */
  fetchedAt: string | null;
  /** US dollars per million tokens. */
  perMillion: Price;
  /** Something the reader should know about the quote, such as that a long-prompt tier was ignored. */
  note?: string;
}

export type PriceResolver = (spec: string) => Promise<PriceQuote | undefined>;

/** A pin as a quote, for a price taken straight from `prices.json`. */
export const pinQuote = (price: Price): PriceQuote => ({ source: "pin", openRouterId: null, fetchedAt: null, perMillion: price });

export const ALIASES_PATH = join(REPO, "src/harness/price-aliases.json");
export const QUOTE_CACHE_PATH = join(REPO, ".cache/openrouter-models.json");
const LIST_URL = "https://openrouter.ai/api/v1/models";
const DAY_MS = 24 * 3_600_000;

/** The aliases from a canonical model spec to an OpenRouter id: ids only, and a value that is not an id is refused so a rate cannot be slipped in. */
export function loadAliases(path = ALIASES_PATH): Record<string, string> {
  if (!existsSync(path)) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new PriceAliasesInvalid("it is not valid JSON");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new PriceAliasesInvalid("it is not an object");
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("_")) continue; // notes
    if (typeof value !== "string" || !/^[A-Za-z0-9._:/-]+$/.test(value)) throw new PriceAliasesInvalid("a value is not an OpenRouter id");
    out[canonicalSpec(key)] = value;
  }
  return out;
}

/** What the cache keeps of one entry: the rates as OpenRouter gives them (dollars per token, as strings) and whether it has tiers. */
interface ListEntry {
  prompt: string;
  completion: string;
  input_cache_read?: string;
  input_cache_write?: string;
  tiered?: boolean;
}
interface List {
  fetchedAt: string;
  models: Record<string, ListEntry>;
}

const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? v : undefined);

/** The list as the service answers it, or undefined when the answer is not the list. */
function parseList(body: unknown, fetchedAt: string): List | undefined {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return undefined;
  const models: Record<string, ListEntry> = {};
  for (const e of data as { id?: unknown; pricing?: Record<string, unknown> }[]) {
    if (typeof e?.id !== "string" || typeof e.pricing !== "object" || e.pricing === null) continue;
    const prompt = text(e.pricing["prompt"]);
    const completion = text(e.pricing["completion"]);
    if (prompt === undefined || completion === undefined) continue;
    const read = text(e.pricing["input_cache_read"]);
    const write = text(e.pricing["input_cache_write"]);
    models[e.id] = { prompt, completion, ...(read === undefined ? {} : { input_cache_read: read }), ...(write === undefined ? {} : { input_cache_write: write }), ...(Array.isArray(e.pricing["overrides"]) && e.pricing["overrides"].length > 0 ? { tiered: true } : {}) };
  }
  return Object.keys(models).length === 0 ? undefined : { fetchedAt, models };
}

function readCache(path: string): List | undefined {
  try {
    const c = JSON.parse(readFileSync(path, "utf8")) as { fetchedAt?: unknown; models?: unknown };
    if (typeof c.fetchedAt !== "string" || Number.isNaN(Date.parse(c.fetchedAt)) || typeof c.models !== "object" || c.models === null) return undefined;
    return { fetchedAt: c.fetchedAt, models: c.models as Record<string, ListEntry> };
  } catch {
    return undefined;
  }
}

export interface PriceSourceOptions {
  /** The pins; default `prices.json`. */
  pins?: PriceTable;
  /** The aliases; default `src/harness/price-aliases.json`. */
  aliases?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
  cachePath?: string;
  now?: () => number;
  /** How old a cached list may be before it is read again. Default a day. */
  maxAgeMs?: number;
}

/** The dollars per million tokens for one OpenRouter rate (dollars per token, as a string). */
const perMillion = (perToken: string): number => Number((Number(perToken) * 1e6).toPrecision(12));

/**
 * A resolver for the price a model's runs are costed with: a pin first, then a market quote for a model with an alias, else none.
 * The list is read once per resolver and kept in a cache file, so a session makes at most one request and a stale cache serves
 * when the network does not.
 */
export function priceSource(o: PriceSourceOptions = {}): { resolve: PriceResolver } {
  const pins = o.pins ?? loadPrices();
  const aliases = o.aliases ?? loadAliases();
  const doFetch = o.fetch ?? globalThis.fetch;
  const cachePath = o.cachePath ?? QUOTE_CACHE_PATH;
  const now = o.now ?? Date.now;
  const maxAge = o.maxAgeMs ?? DAY_MS;
  let list: Promise<List | undefined> | undefined;

  async function load(): Promise<List | undefined> {
    const cached = readCache(cachePath);
    if (cached !== undefined && now() - Date.parse(cached.fetchedAt) <= maxAge) return cached;
    const fetchedAt = new Date(now()).toISOString();
    try {
      const res = await doFetch(LIST_URL, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
      const fresh = res.ok ? parseList(await res.json().catch(() => undefined), fetchedAt) : undefined;
      if (fresh !== undefined) {
        try {
          mkdirSync(dirname(cachePath), { recursive: true });
          writeFileSync(cachePath, `${JSON.stringify(fresh)}\n`);
        } catch {
          // an unwritable cache only costs a fetch next time
        }
        return fresh;
      }
    } catch {
      // no network: the stale list, if there is one, serves; the error's text is never kept
    }
    return cached;
  }

  return {
    async resolve(spec) {
      const canonical = canonicalSpec(spec);
      const pin = pins[canonical];
      if (pin !== undefined) return pinQuote(pin);
      const id = aliases[canonical];
      // Only the base entry of an aliased model: a `:batch`, `:free` or other variant is a different offer, and a name is never matched.
      if (id === undefined || id.includes(":")) return undefined;
      const entry = (await (list ??= load()))?.models[id];
      if (entry === undefined) return undefined;
      const fetchedAt = (await list)!.fetchedAt;
      return {
        source: "market-quote",
        openRouterId: id,
        fetchedAt,
        perMillion: {
          input: perMillion(entry.prompt),
          output: perMillion(entry.completion),
          ...(entry.input_cache_read === undefined ? {} : { cacheRead: perMillion(entry.input_cache_read) }),
          ...(entry.input_cache_write === undefined ? {} : { cacheWrite: perMillion(entry.input_cache_write) }),
        },
        ...(entry.tiered === true ? { note: "tiers ignored" } : {}),
      };
    },
  };
}
