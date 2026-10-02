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
  ready({ label: "alpha", run: "001", world: "forge", goalItem: "glirol", goalQty: 1, outcome: "reached", actionCalls: 3, bestCalls: 3, modelRan: "claude-haiku" }),
  ready({ label: "alpha", run: "002", world: "forge", goalItem: "glirol", goalQty: 1, outcome: "gave up", actionCalls: 40, bestCalls: 3, modelRan: "claude-haiku" }),
  ready({ label: "beta", run: "001", world: "workshop", goalItem: "pickaxe", goalQty: 2, outcome: "out of turns", actionCalls: 90, modelRan: "claude-sonnet" }),
  notReady("unfinished", "Unfinished: the run has no score.json yet", { label: "beta", run: "002", world: "workshop", outcome: "unfinished" }),
  notReady("unreadable", "WorldMissing: the world file the run used is missing or does not load", { label: "gamma", run: "001", goalItem: "x", goalQty: 1 }),
];

/** What the page hands the picker: runs already arranged into groups. */
const props = (groupBy: string | null, onOpen: (e: CatalogEntry) => void = () => {}, presentation: "grid" | "list" = "list") => ({
  groups: groupRuns(runs, groupBy), presentation, showHeaders: groupBy !== null, onOpen,
});

describe("the picker", () => {
  it("lists every run, whatever its status", () => {
    render(Picker, props(null));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("shows what a person needs to tell runs apart", () => {
    render(Picker, props(null));
    const first = screen.getAllByRole("listitem")[0]!;
    for (const text of ["alpha / 001", "forge", "glirol", "reached", "3 calls", "best 3", "claude-haiku"]) expect(first.textContent, text).toContain(text);
    const third = screen.getAllByRole("listitem")[2]!;
    expect(third.textContent).toContain("2 pickaxe"); // a goal of two
    expect(third.textContent).not.toContain("best"); // no best run is known
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

  it("groups by an attribute: each value once, with its runs, and runs that lack it together", () => {
    render(Picker, props("world"));
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent ?? "");
    expect(headings.filter((h) => h.includes("forge"))).toHaveLength(1);
    expect(headings.filter((h) => h.includes("workshop"))).toHaveLength(1);
    expect(headings.some((h) => /no world/i.test(h))).toBe(true);
    expect(headings.find((h) => h.includes("forge"))).toContain("2");
    expect(headings.find((h) => h.includes("workshop"))).toContain("2");
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("collapses and expands a group with its header", async () => {
    render(Picker, props("world"));
    const toggle = screen.getByRole("button", { name: /forge/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
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
