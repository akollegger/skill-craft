import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";
import Toolbar from "../src/shell/Toolbar.svelte";
import { defaultView, type View } from "../src/state/view.ts";
import type { CatalogEntry } from "../../src/viz/contract.ts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

let n = 0;
const run = (attributes: CatalogEntry["attributes"]): CatalogEntry => {
  const id = (n++).toString(16).padStart(16, "0");
  return { id, kind: "run", status: "ready", attributes, preview: { strip: "pc", table: [["a"]] }, bundle: `bundles/${id}/` };
};
const runs = [
  run({ label: "alpha", run: "001", world: "forge", outcome: "reached", actionCalls: 11, skillLoaded: true }),
  run({ label: "alpha", run: "002", world: "forge", outcome: "gave up", actionCalls: 90, skillLoaded: false }),
  run({ label: "beta", run: "001", world: "workshop", outcome: "reached", actionCalls: 3 }),
];

function toolbar(view: View = defaultView()) {
  const changes: View[] = [];
  render(Toolbar, { view, onChange: (v: View) => changes.push(v) });
  return changes;
}

describe("the toolbar", () => {
  const option = (group: string, value: string) => within(screen.getByRole("group", { name: group })).getByRole("button", { name: new RegExp(`^${value}`) });

  it("is buttons and one text field, with no native select and no filter controls", () => {
    toolbar();
    expect(document.querySelectorAll("select")).toHaveLength(0);
    expect(document.querySelectorAll("input")).toHaveLength(1);
    expect(screen.queryByText(/filter/i)).toBeNull();
    expect(screen.queryByLabelText(/filter/i)).toBeNull();
  });

  it("offers sort by calls or time, group by world or goal, and list or grid", () => {
    toolbar();
    const names = (g: string) => within(screen.getByRole("group", { name: g })).getAllByRole("button").map((b) => b.textContent?.trim());
    expect(names("Sort")).toEqual(["Calls", "Time"]);
    expect(names("Group")).toEqual(["World", "Goal"]);
    expect(names("View")).toEqual(["List", "Grid"]);
  });

  it("sorts by the one chosen, and turns the direction round when it is chosen again", async () => {
    const changes = toolbar({ ...defaultView(), sort: null });
    await fireEvent.click(option("Sort", "Time"));
    expect(changes.at(-1)?.sort).toEqual({ attr: "durationMs", dir: "asc" });
    cleanup();
    const again = toolbar();
    expect(option("Sort", "Calls").getAttribute("aria-pressed")).toBe("true");
    await fireEvent.click(option("Sort", "Calls"));
    expect(again.at(-1)?.sort).toEqual({ attr: "actionCalls", dir: "desc" });
    cleanup();
    const back = toolbar({ ...defaultView(), sort: { attr: "actionCalls", dir: "desc" } });
    await fireEvent.click(option("Sort", "Calls"));
    expect(back.at(-1)?.sort).toEqual({ attr: "actionCalls", dir: "asc" });
  });

  it("shows a triangle on the sort that is on, up for ascending and down for descending, and a square on the group", () => {
    toolbar({ ...defaultView(), group: "world" });
    expect(option("Sort", "Calls").querySelector("[data-sort-pip]")!.getAttribute("data-dir")).toBe("asc");
    expect(option("Sort", "Time").querySelector("[data-sort-pip]")).toBeNull();
    expect(option("Group", "World").querySelector("[data-group-pip]")).not.toBeNull();
    expect(option("Group", "Goal").querySelector("[data-group-pip]")).toBeNull();
    cleanup();
    toolbar({ ...defaultView(), sort: { attr: "durationMs", dir: "desc" } });
    expect(option("Sort", "Time").querySelector("[data-sort-pip]")!.getAttribute("data-dir")).toBe("desc");
    expect(document.querySelectorAll("[data-group-pip]")).toHaveLength(0);
  });

  it("groups by the one chosen, and by nothing when it is chosen again", async () => {
    const changes = toolbar();
    await fireEvent.click(option("Group", "Goal"));
    expect(changes.at(-1)).toMatchObject({ group: "goalItem" });
    cleanup();
    const again = toolbar({ ...defaultView(), group: "world" });
    await fireEvent.click(option("Group", "World"));
    expect(again.at(-1)).toMatchObject({ group: null });
  });

  it("searches, and switches between list and grid", async () => {
    const changes = toolbar();
    await fireEvent.input(screen.getByLabelText("Search"), { target: { value: "forge" } });
    expect(changes.at(-1)?.search).toBe("forge");
    expect(option("View", "List").getAttribute("aria-pressed")).toBe("true");
    await fireEvent.click(option("View", "Grid"));
    expect(changes.at(-1)?.presentation).toBe("grid");
  });

  it("stays at the top of the frame while the runs scroll, in the grid as well as the list", () => {
    toolbar();
    expect(screen.getByRole("group", { name: "Sort" }).parentElement!.className).toMatch(/sticky -top-4/);
  });
});

describe("the page with its controls", () => {
  const serve = () => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ format: 1, runs }))));
  
  const first = () => document.querySelectorAll("[data-run-id]")[0]!.textContent;
  const click = (group: string, name: RegExp) => fireEvent.click(within(screen.getByRole("group", { name: group })).getByRole("button", { name }));

  it("starts with the fewest calls first, and turns the order round", async () => {
    serve();
    render(App);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(3));
    await click("Group", /^World/); // world is grouped by default; off
    expect(first()).toContain("beta / 001");
    await click("Sort", /^Calls/);
    expect(first()).toContain("alpha / 002");
  });

  it("finds runs by their outcome, world, goal or model with the search box", async () => {
    serve();
    render(App);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(3));
    await fireEvent.input(screen.getByLabelText("Search"), { target: { value: "gave up" } });
    expect(document.querySelectorAll("[data-run-id]")).toHaveLength(1);
    await fireEvent.input(screen.getByLabelText("Search"), { target: { value: "workshop" } });
    expect(first()).toContain("beta / 001");
  });

  it("says when no run matches", async () => {
    serve();
    render(App);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(3));
    await fireEvent.input(screen.getByLabelText("Search"), { target: { value: "zzz-nothing" } });
    expect(screen.getByRole("status").textContent).toMatch(/no run matches/i);
  });

  it("shows the same runs as tiles when switched to the grid", async () => {
    serve();
    render(App);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(3));
    const before = [...document.querySelectorAll("[data-run-id]")].map((e) => e.getAttribute("data-run-id"));
    await fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect([...document.querySelectorAll("[data-run-id]")].map((e) => e.getAttribute("data-run-id"))).toEqual(before);
    expect(document.querySelectorAll("li[data-run-id] > button")).toHaveLength(3);
  });
});
