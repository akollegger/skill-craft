import type { AttributeValue, CatalogEntry } from "../../../src/viz/contract.ts";
import type { AttributeKind } from "./attributes.ts";
import { groupRuns, type Group } from "./group.ts";

export type Op = "is" | "is not" | "contains" | "=" | ">=" | "<=" | "missing";

export interface Filter {
  attr: string;
  op: Op;
  value?: AttributeValue;
}

export interface Sort {
  attr: string;
  dir: "asc" | "desc";
}

/** How the person is looking at the runs. Nothing here is saved; it is the whole of the arrangement. */
export interface View {
  group: string | null;
  sort: Sort | null;
  filters: Filter[];
  search: string;
  presentation: "grid" | "list";
}

export const defaultView = (): View => ({ group: null, sort: null, filters: [], search: "", presentation: "list" });

export const opsFor = (kind: AttributeKind): Op[] => (kind === "text" ? ["is", "is not", "contains", "missing"] : kind === "number" ? ["=", ">=", "<=", "missing"] : ["is", "missing"]);

function passes(run: CatalogEntry, f: Filter): boolean {
  const v = run.attributes[f.attr];
  if (f.op === "missing") return v === undefined;
  // A run that lacks the attribute fails every other test: it is not placed as if it had a value.
  if (v === undefined || f.value === undefined) return false;
  switch (f.op) {
    case "is": return typeof v === "string" ? v === String(f.value) : v === f.value;
    case "is not": return typeof v === "string" ? v !== String(f.value) : v !== f.value;
    case "contains": return String(v).toLowerCase().includes(String(f.value).toLowerCase());
    case "=": return typeof v === "number" && typeof f.value === "number" && v === f.value;
    case ">=": return typeof v === "number" && typeof f.value === "number" && v >= f.value;
    case "<=": return typeof v === "number" && typeof f.value === "number" && v <= f.value;
  }
}

/** Runs that pass every filter and, if there is search text, have it in some text attribute. */
export function filterRuns(runs: readonly CatalogEntry[], filters: readonly Filter[], search = ""): CatalogEntry[] {
  const needle = search.trim().toLowerCase();
  return runs.filter(
    (r) =>
      filters.every((f) => passes(r, f)) &&
      (needle === "" || Object.values(r.attributes).some((v) => typeof v === "string" && v.toLowerCase().includes(needle))),
  );
}

const compareValues = (a: AttributeValue, b: AttributeValue): number => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true });
};

/** Sorted by an attribute, either way. Runs that lack it come last whichever way it goes; equals keep their order. */
export function sortRuns(runs: readonly CatalogEntry[], sort: Sort | null): CatalogEntry[] {
  if (!sort) return [...runs];
  const sign = sort.dir === "asc" ? 1 : -1;
  return runs
    .map((r, i) => ({ r, i }))
    .sort((x, y) => {
      const a = x.r.attributes[sort.attr];
      const b = y.r.attributes[sort.attr];
      if (a === undefined && b === undefined) return x.i - y.i;
      if (a === undefined) return 1;
      if (b === undefined) return -1;
      return sign * compareValues(a, b) || x.i - y.i;
    })
    .map((x) => x.r);
}

/** The runs as the view shows them: filtered, then sorted, then grouped. */
export function arrange(runs: readonly CatalogEntry[], view: View): Group[] {
  return groupRuns(sortRuns(filterRuns(runs, view.filters, view.search), view.sort), view.group);
}
