import type { JSONValue } from "ai";
import { BackendNotPinned } from "./errors.js";

/**
 * The provider table: one row per source of models (ADR-005 §2.2). It is data. A row names the package and factory
 * that create its models as strings, and `ai-driver.ts` imports them, so this file loads no provider package and no
 * SDK at run time (a type-only import is erased). Spec parsing, the dry run and the report all read it without paying for either.
 */

export type SettingName = "temperature" | "effort" | "thinking";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** The settings a run can pin (spec 007, FR-009). A setting left out is unset: the provider's own default applies. */
export interface ModelSettings {
  temperature?: number;
  effort?: Effort;
  thinking?: "adaptive" | "off";
}

/** What a row turns a model's settings into: the call's own temperature and the provider's option block. */
export interface CallOptions {
  temperature?: number;
  providerOptions?: Record<string, Record<string, JSONValue>>;
}

export interface ProviderRow {
  /** The spec prefix: `anthropic`, `fireworks`. */
  prefix: string;
  /** The npm package (or a module path, for a scripted provider) that creates the provider. Imported by `ai-driver.ts`. */
  package: string;
  /** The package's export that creates the provider, such as `createFireworks`. */
  factory: string;
  /** The environment variable that holds the provider's key. */
  keyEnv: string;
  /** What a short model name must look like. */
  shortPattern: RegExp;
  /** A short model name to the provider's id. */
  expand(short: string): string;
  /** A provider id, as sent or as reported, to the canonical spec (`<prefix>/<model>`). */
  normaliseId(id: string): string;
  /** A router serves one model name from several backends; it must pin one (`pinnedBackend`) or it is refused. */
  routed?: boolean;
  pinnedBackend?: { allowFallbacks: false; order: string[] };
  /** The name of the provider's usage report for the billing check, or null when it has none. */
  usageReport: string | null;
  /** Which settings the provider takes, and a way to say a particular model refuses one. */
  settings: { accepts: SettingName[]; refuses?: (modelId: string, setting: SettingName, value: unknown) => boolean };
  /** Provider call options for a model's settings, such as the cache option. */
  callOptions(settings: ModelSettings, modelId: string): CallOptions;
  /** Optional: a per-request cost the provider reports in its metadata, in US dollars. */
  reportedCost?(meta: unknown): number | undefined;
  /** Optional, for a routed row: the backend a response reports. */
  backend?(meta: unknown): string | undefined;
}

/** A row is refused when it is routed and pins no backend (FR-004). */
export function validateRow(row: ProviderRow): void {
  if (row.routed === true && row.pinnedBackend === undefined) throw new BackendNotPinned(row.prefix);
}

const FIREWORKS_MODELS = "accounts/fireworks/models/";

// What Anthropic's models take, by id prefix, from its published notes. The table can only know what it was told; a
// setting it does not know a model refuses is sent, and a provider's rejection ends that run as `request_rejected`.
const ALWAYS_THINKING = /^claude-(fable|mythos|opus-5-5|sonnet-5-5)/; // thinking cannot be switched off
const NO_SAMPLING = /^claude-(fable|mythos|opus-5|opus-4-[78]|sonnet-5)/; // temperature is not taken
const TAKES_ADAPTIVE = /^claude-(fable|mythos|opus-5|opus-4-[678]|sonnet-5|sonnet-4-6)/; // adaptive thinking
const TAKES_EFFORT = /^claude-(fable|mythos|opus-5|opus-4-[5-8]|sonnet-5|sonnet-4-6)/; // effort levels

const anthropic: ProviderRow = {
  prefix: "anthropic",
  package: "@ai-sdk/anthropic",
  factory: "createAnthropic",
  keyEnv: "ANTHROPIC_API_KEY",
  shortPattern: /^claude-[a-z0-9.-]+$/,
  expand: (short) => short,
  normaliseId: (id) => `anthropic/${id}`,
  usageReport: null,
  settings: {
    accepts: ["temperature", "effort", "thinking"],
    refuses: (modelId, setting, value) => {
      if (setting === "temperature") return NO_SAMPLING.test(modelId);
      if (setting === "effort") return !TAKES_EFFORT.test(modelId);
      return value === "off" ? ALWAYS_THINKING.test(modelId) : !TAKES_ADAPTIVE.test(modelId);
    },
  },
  // Anthropic caches only what a request asks it to, and a run repeats a long prefix (the tool list and the history) on
  // every turn; without this the spike's Claude runs read 0% of their input from the cache. Pinned settings ride beside it.
  callOptions: (s) => ({
    ...(s.temperature === undefined ? {} : { temperature: s.temperature }),
    providerOptions: {
      anthropic: {
        cacheControl: { type: "ephemeral" },
        ...(s.thinking === undefined ? {} : { thinking: { type: s.thinking === "adaptive" ? "adaptive" : "disabled" } }),
        ...(s.effort === undefined ? {} : { effort: s.effort }),
      },
    },
  }),
};

const fireworks: ProviderRow = {
  prefix: "fireworks",
  package: "@ai-sdk/fireworks",
  factory: "createFireworks",
  keyEnv: "FIREWORKS_API_KEY",
  shortPattern: /^[A-Za-z0-9._/-]+$/,
  expand: (short) => (short.startsWith("accounts/") ? short : `${FIREWORKS_MODELS}${short}`),
  normaliseId: (id) => (id.startsWith(FIREWORKS_MODELS) ? `fireworks/${id.slice(FIREWORKS_MODELS.length)}` : `fireworks/${id}`),
  usageReport: "firectl billing get-usage",
  settings: { accepts: ["temperature"] },
  callOptions: (s) => (s.temperature === undefined ? {} : { temperature: s.temperature }),
};

/** The rows. Adding a provider is one entry here, its package in `package.json`, and its price entries. */
export const PROVIDERS: ProviderRow[] = [anthropic, fireworks];
for (const row of PROVIDERS) validateRow(row);

export const findProvider = (prefix: string): ProviderRow | undefined => PROVIDERS.find((r) => r.prefix === prefix);

export const providerPrefixes = (): string[] => PROVIDERS.map((r) => r.prefix);

/** What a provider reported as the model that ran, as a canonical spec. An id the row cannot place is kept as reported. */
export function normaliseReported(prefix: string, id: string): string {
  const row = findProvider(prefix);
  return row === undefined ? `${prefix}/${id}` : row.normaliseId(id);
}
