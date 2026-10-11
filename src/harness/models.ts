import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SettingRefused, SettingsInvalid, UnknownModel, UnknownProvider } from "./errors.js";
import { REPO } from "./paths.js";
import { findProvider, providerPrefixes, validateRow, type Effort, type ModelSettings } from "./providers.js";

export type { ModelSettings };

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
  validateRow(row); // a router without a pinned backend is refused here, before a run or a dry run goes any further
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

const SETTING_NAMES = ["temperature", "effort", "thinking"] as const;
const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

/**
 * Refuse a pinned setting the model's provider does not take for it, before anything is spent. The table only knows
 * what it was told (providers.ts); a setting it does not know a model refuses is sent, and a rejection ends the run.
 */
export function checkSettings(spec: string, settings: ModelSettings): void {
  const ref = parseModelSpec(spec);
  const row = findProvider(ref.provider);
  if (row === undefined) return;
  for (const name of SETTING_NAMES) {
    const value = settings[name];
    if (value === undefined) continue;
    if (!row.settings.accepts.includes(name) || row.settings.refuses?.(ref.id, name, value) === true) throw new SettingRefused(ref.spec, name);
  }
}

/** A settings file: model spec to the settings to pin for it. Keys are read in canonical form; a key starting `_` is a note. */
export function loadSettings(path: string): Record<string, ModelSettings> {
  if (!existsSync(path)) throw new SettingsInvalid(`${path} does not exist`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new SettingsInvalid("not valid JSON");
  }
  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  if (!isObject(raw)) throw new SettingsInvalid("it must be an object that maps a model to its settings");
  const map: Record<string, ModelSettings> = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (key.startsWith("_")) continue;
    if (!isObject(entry)) throw new SettingsInvalid("it must be an object that maps a model to its settings");
    const spec = canonicalSpec(key);
    const settings: ModelSettings = {};
    for (const [name, value] of Object.entries(entry)) {
      if (!(SETTING_NAMES as readonly string[]).includes(name)) throw new SettingsInvalid(`setting '${name}' is not one of ${SETTING_NAMES.join(", ")}`);
      const bad = () => new SettingsInvalid(`the value of '${name}' for model '${spec}' is not allowed`);
      if (name === "temperature") {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw bad();
        settings.temperature = value;
      } else if (name === "effort") {
        if (typeof value !== "string" || !EFFORTS.includes(value as Effort)) throw bad();
        settings.effort = value as Effort;
      } else {
        if (value !== "adaptive" && value !== "off") throw bad();
        settings.thinking = value;
      }
    }
    map[spec] = settings;
  }
  return map;
}
