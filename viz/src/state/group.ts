import type { AttributeValue, CatalogEntry } from "../../../src/viz/contract.ts";
import { attributeLabel } from "./attributes.ts";

export interface Group {
  /** Stable for a value, so a component can keep a group's state (collapsed or not) across changes. */
  key: string;
  label: string;
  runs: CatalogEntry[];
}

const order = (a: AttributeValue, b: AttributeValue): number => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
};

const labelFor = (attr: string, value: AttributeValue): string => (typeof value === "boolean" ? `${attributeLabel(attr)}: ${value ? "yes" : "no"}` : String(value));

/**
 * Split runs into groups by an attribute's value, keeping each run's order inside its group. Runs that lack the
 * attribute form one labelled group at the end; they are not placed as if they had a value. With no attribute the
 * runs are one unlabelled group.
 */
export function groupRuns(runs: readonly CatalogEntry[], attr: string | null): Group[] {
  if (attr === null) return [{ key: "", label: "", runs: [...runs] }];
  const byValue = new Map<string, { value: AttributeValue; runs: CatalogEntry[] }>();
  const missing: CatalogEntry[] = [];
  for (const r of runs) {
    const v = r.attributes[attr];
    if (v === undefined) {
      missing.push(r);
      continue;
    }
    const key = `${typeof v}:${String(v)}`;
    (byValue.get(key) ?? byValue.set(key, { value: v, runs: [] }).get(key)!).runs.push(r);
  }
  const groups: Group[] = [...byValue.entries()]
    .sort(([, a], [, b]) => order(a.value, b.value))
    .map(([key, g]) => ({ key, label: labelFor(attr, g.value), runs: g.runs }));
  if (missing.length > 0) groups.push({ key: "missing", label: `no ${attributeLabel(attr)}`, runs: missing });
  return groups;
}
