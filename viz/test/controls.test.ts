import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";
import Toolbar from "../src/shell/Toolbar.svelte";
import { describeAttributes } from "../src/state/attributes.ts";
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
const attributes = describeAttributes(runs);

function toolbar(view: View = defaultView()) {
  const changes: View[] = [];
  render(Toolbar, { attributes, view, onChange: (v: View) => changes.push(v) });
  return changes;
}

describe("the toolbar", () => {
  it("lists every attribute the runs carry, without the page naming any", () => {
    toolbar();
    const group = screen.getByLabelText("Group by") as HTMLSelectElement;
    expect([...group.options].map((o) => o.value)).toEqual(["", ...attributes.map((a) => a.name)]);
    expect(attributes.map((a) => a.name)).toContain("skillLoaded");
  });

  it("groups by the attribute chosen, and by nothing", async () => {
    const changes = toolbar();
    await fireEvent.change(screen.getByLabelText("Group by"), { target: { value: "outcome" } });
    expect(changes.at(-1)).toMatchObject({ group: "outcome" });
    await fireEvent.change(screen.getByLabelText("Group by"), { target: { value: "" } });
    expect(changes.at(-1)).toMatchObject({ group: null });
  });

  it("sorts by an attribute and turns the direction round", async () => {
    const changes = toolbar();
    await fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "actionCalls" } });
    expect(changes.at(-1)?.sort).toEqual({ attr: "actionCalls", dir: "asc" });
    cleanup();
    const again = toolbar({ ...defaultView(), sort: { attr: "actionCalls", dir: "asc" } });
    await fireEvent.click(screen.getByRole("button", { name: /sort direction/i }));
    expect(again.at(-1)?.sort).toEqual({ attr: "actionCalls", dir: "desc" });
  });

  it("builds a text filter with the operators that suit text", async () => {
    const changes = toolbar();
    await fireEvent.change(screen.getByLabelText("Filter attribute"), { target: { value: "outcome" } });
    const ops = [...(screen.getByLabelText("Filter operator") as HTMLSelectElement).options].map((o) => o.value);
    expect(ops).toEqual(["is", "is not", "contains", "missing"]);
    const add = screen.getByRole("button", { name: /add filter/i }) as HTMLButtonElement;
    expect(add.disabled).toBe(true); // no value yet
    await fireEvent.input(screen.getByLabelText("Filter value"), { target: { value: "reached" } });
    await fireEvent.click(add);
    expect(changes.at(-1)?.filters).toEqual([{ attr: "outcome", op: "is", value: "reached" }]);
  });

  it("builds a number filter, a flag filter and an is-missing filter", async () => {
    const changes = toolbar();
    await fireEvent.change(screen.getByLabelText("Filter attribute"), { target: { value: "actionCalls" } });
    expect([...(screen.getByLabelText("Filter operator") as HTMLSelectElement).options].map((o) => o.value)).toEqual(["=", ">=", "<=", "missing"]);
    await fireEvent.change(screen.getByLabelText("Filter operator"), { target: { value: ">=" } });
    await fireEvent.input(screen.getByLabelText("Filter value"), { target: { value: "10" } });
    await fireEvent.click(screen.getByRole("button", { name: /add filter/i }));
    expect(changes.at(-1)?.filters).toEqual([{ attr: "actionCalls", op: ">=", value: 10 }]);

    await fireEvent.change(screen.getByLabelText("Filter attribute"), { target: { value: "skillLoaded" } });
    await fireEvent.change(screen.getByLabelText("Filter value"), { target: { value: "true" } });
    await fireEvent.click(screen.getByRole("button", { name: /add filter/i }));
    expect(changes.at(-1)?.filters.at(-1)).toEqual({ attr: "skillLoaded", op: "is", value: true });

    await fireEvent.change(screen.getByLabelText("Filter attribute"), { target: { value: "world" } });
    await fireEvent.change(screen.getByLabelText("Filter operator"), { target: { value: "missing" } });
    expect(screen.queryByLabelText("Filter value")).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: /add filter/i }));
    expect(changes.at(-1)?.filters.at(-1)).toEqual({ attr: "world", op: "missing" });
  });

  it("lists the active filters and removes one", async () => {
    const changes = toolbar({ ...defaultView(), filters: [{ attr: "outcome", op: "is", value: "reached" }, { attr: "actionCalls", op: ">=", value: 5 }] });
    const items = within(screen.getByRole("list", { name: /active filters/i })).getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual([expect.stringContaining("outcome is reached"), expect.stringContaining("calls >= 5")]);
    await fireEvent.click(screen.getByRole("button", { name: /remove filter: outcome is reached/i }));
    expect(changes.at(-1)?.filters).toEqual([{ attr: "actionCalls", op: ">=", value: 5 }]);
  });

  it("searches, and switches between list and grid", async () => {
    const changes = toolbar();
    await fireEvent.input(screen.getByLabelText("Search"), { target: { value: "forge" } });
    expect(changes.at(-1)?.search).toBe("forge");
    expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("true");
    await fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(changes.at(-1)?.presentation).toBe("grid");
  });
});

describe("the page with its controls", () => {
  const serve = () => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ format: 1, runs }))));
  const names = () => [...document.querySelectorAll("[data-run-id]")].map((e) => e.querySelector("button, span")?.textContent ?? "");

  it("sorts the runs when asked and filters them down", async () => {
    serve();
    render(App);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(3));
    await fireEvent.change(screen.getByLabelText("Group by"), { target: { value: "" } });
    await fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "actionCalls" } });
    expect(document.querySelectorAll("[data-run-id]")[0]!.textContent).toContain("beta / 001");
    await fireEvent.click(screen.getByRole("button", { name: /sort direction/i }));
    expect(document.querySelectorAll("[data-run-id]")[0]!.textContent).toContain("alpha / 002");

    await fireEvent.change(screen.getByLabelText("Filter attribute"), { target: { value: "outcome" } });
    await fireEvent.input(screen.getByLabelText("Filter value"), { target: { value: "reached" } });
    await fireEvent.click(screen.getByRole("button", { name: /add filter/i }));
    expect(screen.getAllByRole("listitem").filter((li) => li.hasAttribute("data-run-id"))).toHaveLength(2);
    expect(names()).toHaveLength(2);
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
