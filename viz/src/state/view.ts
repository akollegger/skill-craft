import type { AttributeValue, CatalogEntry } from "../../../src/viz/contract.ts";
import { groupRuns, type Group } from "./group.ts";

export interface Sort {
  attr: string;
  dir: "asc" | "desc";
}

/** How the person is looking at the runs. Nothing here is saved; it is the whole of the arrangement. */
export interface View {
  group: string | null;
  sort: Sort | null;
  search: string;
  presentation: "grid" | "list";
}

// Fewest calls first: the best runs lead.
export const defaultView = (): View => ({ group: null, sort: { attr: "actionCalls", dir: "asc" }, search: "", presentation: "list" });

/** Runs that have the search text in some text attribute: the world, the goal, the outcome, the model, the name and so on. */
export function searchRuns(runs: readonly CatalogEntry[], search = ""): CatalogEntry[] {
  const needle = search.trim().toLowerCase();
  if (needle === "") return [...runs];
  return runs.filter((r) => Object.values(r.attributes).some((v) => typeof v === "string" && v.toLowerCase().includes(needle)));
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

/** The runs as the view shows them: searched, then sorted, then grouped. */
export function arrange(runs: readonly CatalogEntry[], view: View): Group[] {
  return groupRuns(sortRuns(searchRuns(runs, view.search), view.sort), view.group);
}
