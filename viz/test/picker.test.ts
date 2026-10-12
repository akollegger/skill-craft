import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import Picker from "../src/shell/Picker.svelte";
import { groupRuns } from "../src/state/group.ts";
import Empty from "../src/shell/Empty.svelte";
import type { CatalogEntry } from "../../src/viz/contract.ts";

afterEach(cleanup);

let n = 0;
const ready = (attributes: CatalogEntry["attributes"]): CatalogEntry => {
  const id = (n++).toString(16).padStart(16, "0");
  return { id, kind: "run", status: "ready", attributes, preview: { strip: "pc", table: [] }, bundle: `bundles/${id}/` };
};
const notReady = (status: "unfinished" | "unreadable", reason: string, attributes: CatalogEntry["attributes"]): CatalogEntry => ({
  id: (n++).toString(16).padStart(16, "0"), kind: "run", status, reason, attributes,
});

const runs: CatalogEntry[] = [
  ready({ label: "alpha", run: "001", world: "forge", goalItem: "glirol", goalQty: 1, outcome: "reached", actionCalls: 3, bestCalls: 3, modelRan: "claude-haiku", durationMs: 4200 }),
  ready({ label: "alpha", run: "002", world: "forge", goalItem: "glirol", goalQty: 1, outcome: "gave up", actionCalls: 40, bestCalls: 3, modelRan: "claude-haiku" }),
  ready({ label: "beta", run: "001", world: "workshop", goalItem: "pickaxe", goalQty: 2, outcome: "out of turns", actionCalls: 90, modelRan: "claude-sonnet" }),
  notReady("unfinished", "Unfinished: the run has no score.json yet", { label: "beta", run: "002", world: "workshop", outcome: "unfinished" }),
  notReady("unreadable", "WorldMissing: the world file the run used is missing or does not load", { label: "gamma", run: "001", goalItem: "x", goalQty: 1 }),
];

/** What the page hands the picker: runs already arranged into groups. */
const props = (groupBy: string | null, onOpen: (e: CatalogEntry) => void = () => {}, presentation: "grid" | "list" = "list") => ({
  groups: groupRuns(runs, groupBy), presentation, onOpen, group: groupBy,
});

describe("the picker", () => {
  it("lists every run, whatever its status", () => {
    render(Picker, props(null));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("shows what a person needs to tell runs apart", () => {
    render(Picker, props(null));
    const first = screen.getAllByRole("listitem")[0]!;
    for (const text of ["alpha / 001", "forge", "glirol", "reached", "3 calls", "claude-haiku"]) expect(first.textContent, text).toContain(text);
    const third = screen.getAllByRole("listitem")[2]!;
    expect(third.textContent).toContain("2 pickaxe"); // a goal of two
  });

  it("opens a ready run when it is activated, and says which", async () => {
    const onOpen = vi.fn();
    render(Picker, props(null, onOpen));
    await fireEvent.click(within(screen.getAllByRole("listitem")[1]!).getByRole("button"));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpen.mock.calls[0]![0].attributes.run).toBe("002");
  });

  it("shows the reason for a run that cannot be opened and gives it no way to open", () => {
    render(Picker, props(null));
    const items = screen.getAllByRole("listitem");
    expect(items[3]!.textContent).toContain("the run has no score.json yet");
    expect(items[4]!.textContent).toContain("the world file the run used is missing");
    expect(within(items[3]!).queryByRole("button")).toBeNull();
    expect(within(items[4]!).queryByRole("button")).toBeNull();
    expect(items[3]!.getAttribute("aria-disabled")).toBe("true");
  });

  it("groups by an attribute with no heading: each value once, its runs together, and runs that lack it together", () => {
    render(Picker, props("world"));
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
    expect(document.querySelectorAll("section")).toHaveLength(3); // forge, workshop, and the run with no world
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    const worlds = screen.getAllByRole("listitem").map((li) => li.querySelector("span.truncate")?.textContent?.trim() ?? "");
    expect(worlds.slice(0, 4)).toEqual(["forge", "forge", "workshop", "workshop"]); // the world's value is read from the rows
  });

  it("has nothing to collapse: no disclosure button, no triangle, every run always shown", () => {
    render(Picker, props("world"));
    expect(document.querySelector("[aria-expanded]")).toBeNull();
    expect(document.body.textContent).not.toMatch(/[▸▾]/);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("moves between runs with the arrow keys", async () => {
    render(Picker, props(null));
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3); // the runs that can be opened
    buttons[0]!.focus();
    await fireEvent.keyDown(buttons[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(buttons[1]);
    await fireEvent.keyDown(buttons[1]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(buttons[2]);
    await fireEvent.keyDown(buttons[2]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(buttons[2]); // stops at the end
    await fireEvent.keyDown(buttons[2]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(buttons[1]);
  });
});

describe("the empty state", () => {
  it("says no runs were found and what the visualizer looks for", () => {
    render(Empty, {});
    expect(screen.getByRole("status").textContent).toMatch(/no runs/i);
    expect(screen.getByRole("status").textContent).toContain("run.jsonl");
    expect(screen.getByRole("status").textContent).toContain("bundle.json");
  });
});

describe("the list's column headers", () => {
  const headers = () => document.querySelector("[data-list-header]") as HTMLElement | null;
  const column = (label: string) => [...headers()!.querySelectorAll("[data-column]")].find((c) => c.textContent?.trim() === label) as HTMLElement;
  /** A sort triangle is rectangles of art pixels, one per row, so its edges step: [y, width] from the top. */
  const rows = (svg: Element) => [...svg.querySelectorAll("rect")].map((r) => [Number(r.getAttribute("y")), Number(r.getAttribute("width"))]).sort((a, b) => a[0]! - b[0]!);
  const withView = (group: string | null, sort: { attr: string; dir: "asc" | "desc" } | null) => ({ ...props(group), sort });

  it("label the columns once, at the top, even when the runs are grouped", () => {
    render(Picker, props("world"));
    expect(document.querySelectorAll("[data-list-header]")).toHaveLength(1);
    expect([...headers()!.querySelectorAll("[data-column]")].map((c) => c.textContent?.trim())).toEqual(["", "World", "Goal", "Calls", "Time", "Outcome", "Model", "Skill"]);
  });

  it("show a run's time beside its calls, as a clock, and nothing when it was not measured", () => {
    render(Picker, props(null));
    const [first, , third] = screen.getAllByRole("listitem");
    expect(first!.textContent).toContain("4.2s");
    expect(third!.textContent).not.toMatch(/\d+s\b|:\d\d/);
  });

  it("put a triangle on the Time column when the runs are sorted by time", () => {
    render(Picker, withView(null, { attr: "durationMs", dir: "desc" }));
    expect(column("Time").querySelector("[data-sort-pip]")!.getAttribute("data-dir")).toBe("desc");
  });

  it("are not shown in the grid", () => {
    render(Picker, { ...props(null), presentation: "grid" });
    expect(headers()).toBeNull();
  });

  it("use the same columns as every row, so the cells line up under them", () => {
    render(Picker, props(null));
    const columns = (el: Element) => el.className.split(/\s+/).find((c) => c.startsWith("grid-cols-"));
    expect(columns(headers()!)).toBeTruthy();
    for (const row of screen.getAllByRole("listitem")) expect(columns(row.firstElementChild!)).toBe(columns(headers()!));
  });

  it("carry no pip when the runs are neither grouped nor sorted", () => {
    render(Picker, props(null));
    expect(headers()!.querySelector("[data-group-pip], [data-sort-pip]")).toBeNull();
  });

  it("put a square beside the column the runs are grouped by, and only there", () => {
    render(Picker, props("world"));
    expect(column("World").querySelector("[data-group-pip]")).not.toBeNull();
    expect(headers()!.querySelectorAll("[data-group-pip]")).toHaveLength(1);
    cleanup();
    render(Picker, props("modelRan"));
    expect(column("Model").querySelector("[data-group-pip]")).not.toBeNull();
    expect(column("World").querySelector("[data-group-pip]")).toBeNull();
  });

  it("put a triangle beside the column the runs are sorted by: up for ascending and down for descending", () => {
    render(Picker, withView(null, { attr: "actionCalls", dir: "asc" }));
    const up = column("Calls").querySelector("[data-sort-pip]") as HTMLElement;
    expect(up.getAttribute("data-dir")).toBe("asc");
    expect(rows(up)).toEqual([[0, 1], [1, 3], [2, 5], [3, 7]]); // stepped, apex at the top: [y, width] of each row of art pixels
    cleanup();
    render(Picker, withView(null, { attr: "actionCalls", dir: "desc" }));
    const down = column("Calls").querySelector("[data-sort-pip]") as HTMLElement;
    expect(down.getAttribute("data-dir")).toBe("desc");
    expect(rows(down)).toEqual([[0, 7], [1, 5], [2, 3], [3, 1]]); // apex at the bottom
  });

  it("can mark one column for grouping and another for sorting at the same time", () => {
    render(Picker, withView("world", { attr: "outcome", dir: "asc" }));
    expect(column("World").querySelector("[data-group-pip]")).not.toBeNull();
    expect(column("Outcome").querySelector("[data-sort-pip]")).not.toBeNull();
    expect(column("World").querySelector("[data-sort-pip]")).toBeNull();
  });

  it("show nothing for an attribute that has no column", () => {
    render(Picker, withView("priorFit", { attr: "priorFit", dir: "asc" }));
    expect(headers()!.querySelector("[data-group-pip], [data-sort-pip]")).toBeNull();
  });

  it("let a row show values only: the goal is the item, with a count only when it is more than one, and no 'make' or '(best …)' wording", () => {
    render(Picker, props(null));
    const [first, , third] = screen.getAllByRole("listitem");
    expect(first!.textContent).not.toMatch(/\bmake\b/i);
    expect(first!.textContent).not.toContain("(best");
    expect(first!.textContent).toContain("glirol");
    expect(first!.textContent).not.toContain("1 glirol");
    expect(third!.textContent).toContain("2 pickaxe");
  });

  it("show the calls as a large numeral, with nothing beside it, colored by how the run ended", () => {
    render(Picker, props(null));
    const numeral = (row: HTMLElement) => row.querySelector(".font-score") as HTMLElement;
    const [first, second, third] = screen.getAllByRole("listitem") as HTMLElement[];
    expect(numeral(first!).textContent).toContain("3");
    expect(first!.textContent).not.toContain("best");
    expect(numeral(first!).className).toMatch(/text-light-forest/); // reached, and in the best number of calls
    expect(numeral(second!).className).toMatch(/text-mid-hibiscus/); // gave up: failed, so red
    expect(numeral(third!).className).toMatch(/text-mid-hibiscus/); // ran out of turns: failed, so red
    expect(within(first!).getByText(/calls/, { selector: ".sr-only" })).toBeTruthy(); // and says "calls" to a screen reader
  });
});
