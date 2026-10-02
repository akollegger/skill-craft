import type { AttributeValue, CatalogEntry } from "../../../src/viz/contract.ts";

export type AttributeKind = "text" | "number" | "flag";

export interface AttributeInfo {
  name: string;
  kind: AttributeKind;
  /** Distinct values, in a sensible order for the kind. */
  values: AttributeValue[];
  /** Runs that have the attribute. */
  present: number;
  /** Runs that lack it. */
  missing: number;
}

const kindOf = (values: readonly AttributeValue[]): AttributeKind => {
  if (values.every((v) => typeof v === "boolean")) return "flag";
  if (values.every((v) => typeof v === "number")) return "number";
  return "text";
};

const compare = (kind: AttributeKind) => (a: AttributeValue, b: AttributeValue): number => {
  if (kind === "number") return Number(a) - Number(b);
  if (kind === "flag") return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
};

/**
 * The attributes the runs carry, discovered from their values and not from a list of names, so a field added to
 * runs later can be grouped, sorted and filtered with no change here. An attribute whose values disagree in kind
 * is text. Every status counts, so runs that cannot be opened still show what they say.
 */
export function describeAttributes(runs: readonly CatalogEntry[]): AttributeInfo[] {
  const seen = new Map<string, AttributeValue[]>();
  for (const r of runs) for (const [name, value] of Object.entries(r.attributes)) (seen.get(name) ?? seen.set(name, []).get(name)!).push(value);
  return [...seen.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, all]) => {
      const kind = kindOf(all);
      const values = [...new Map(all.map((v) => [`${typeof v}:${String(v)}`, v])).values()].sort(compare(kind));
      return { name, kind, values, present: all.length, missing: runs.length - all.length };
    });
}

// Plainer words for a few names people look for; every other name is shown as its camelCase words.
const PLAIN: Record<string, string> = { actionCalls: "calls", costUsd: "cost", durationMs: "time", modelRan: "model", extraCalls: "extra calls" };

export const attributeLabel = (name: string): string => PLAIN[name] ?? name.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);
