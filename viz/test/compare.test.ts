import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";
import { createScenePool } from "../src/scene/pool.ts";
import type { SceneFactory, SceneHandle } from "../src/scene/handle.ts";
import { closeRun, initialSelection, openRun, toggleSelected, type Selection } from "../src/state/selection.ts";
import { sampleBundle } from "./helpers/bundle.ts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("selection", () => {
  const empty = initialSelection();
  it("selects up to two runs, dropping the oldest for a third, and deselects", () => {
    let s: Selection = toggleSelected(empty, "a");
    s = toggleSelected(s, "b");
    expect(s.selected).toEqual(["a", "b"]);
    s = toggleSelected(s, "c");
    expect(s.selected).toEqual(["b", "c"]);
    expect(toggleSelected(s, "b").selected).toEqual(["c"]);
  });

  it("opens runs into at most two tables; a third replaces the second", () => {
    let s = openRun(empty, "a");
    expect(s.open).toEqual(["a"]);
    s = openRun(s, "b");
    expect(s.open).toEqual(["a", "b"]);
    s = openRun(s, "c");
    expect(s.open).toEqual(["a", "c"]);
    expect(openRun(s, "a").open).toEqual(["a", "c"]); // already open: nothing changes
  });

  it("closes a table and keeps the other where it was", () => {
    const s = openRun(openRun(empty, "a"), "b");
    expect(closeRun(s, "a").open).toEqual(["b"]);
    expect(closeRun(closeRun(s, "a"), "b").open).toEqual([]);
  });

  it("opens exactly the two selected runs when asked to compare", () => {
    const s = toggleSelected(toggleSelected(empty, "x"), "y");
    expect(openRun(openRun({ ...s, open: [] }, s.selected[0]!), s.selected[1]!).open).toEqual(["x", "y"]);
  });
});

describe("the scene pool", () => {
  const stub = () => {
    const made: { destroyed: boolean }[] = [];
    const factory: SceneFactory = () => {
      const scene = { destroyed: false };
      made.push(scene);
      return { show() {}, destroy: () => void (scene.destroyed = true) } as SceneHandle;
    };
    return { factory, made };
  };

  it("keeps at most two scenes alive and says so when a third is asked for", async () => {
    const { factory, made } = stub();
    const pool = createScenePool(factory, 2);
    const host = document.createElement("div");
    const a = await pool.factory(host, { reducedMotion: false });
    await pool.factory(host, { reducedMotion: false });
    expect(pool.live()).toBe(2);
    await expect(pool.factory(host, { reducedMotion: false })).rejects.toThrow(/two tables/i);
    expect(pool.live()).toBe(2);
    expect(made).toHaveLength(2);
    a.destroy();
    expect(pool.live()).toBe(1);
    await pool.factory(host, { reducedMotion: false });
    expect(pool.live()).toBe(2);
  });

  it("counts a scene once however many times it is destroyed", async () => {
    const pool = createScenePool(stub().factory, 2);
    const s = await pool.factory(document.createElement("div"), { reducedMotion: false });
    s.destroy();
    s.destroy();
    expect(pool.live()).toBe(0);
  });
});

describe("comparing in the page", () => {
  const entry = (run: string, over: Record<string, string | number> = {}) => {
    const id = run.padStart(16, "0");
    return { id, kind: "run", status: "ready", attributes: { label: "lab", run, world: "forge", outcome: "reached", actionCalls: 5, bestCalls: 3, modelRan: "claude-x", goalItem: "d", goalQty: 1, ...over }, preview: { strip: "pc", table: [["a"]] }, bundle: `bundles/${id}/` };
  };
  const runs = [entry("1"), entry("2", { world: "workshop", goalItem: "e", outcome: "gave up" }), entry("3")];
  const bundle = sampleBundle();
  const serve = () =>
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "catalog.json") return new Response(JSON.stringify({ format: 1, runs }));
      const file = url.split("/").pop();
      const body = file === "bundle.json" ? bundle.manifest : file === "score.json" ? bundle.result : null;
      if (body) return new Response(JSON.stringify(body));
      if (file === "frames.jsonl") return new Response(bundle.frames.map((f) => JSON.stringify(f)).join("\n") + "\n");
      if (file === "trace.jsonl") return new Response(bundle.trace.map((t) => JSON.stringify(t)).join("\n") + "\n");
      return new Response("no", { status: 404 });
    }));
  const live = { n: 0 };
  const scene: SceneFactory = () => {
    live.n++;
    return { show() {}, destroy: () => void live.n-- } as SceneHandle;
  };
  /** Shift-click a run, as a person does (and as Shift+Enter or Shift+Space on a focused run does). */
  const select = (name: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${name}\\b`) }), { shiftKey: true });
  const start = async () => {
    serve();
    live.n = 0;
    render(App, { createScene: scene });
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBeGreaterThan(2));
    await fireEvent.click(within(screen.getByRole("group", { name: "Group" })).getByRole("button", { name: /^World/ })); // off: one flat list
  };

  it("offers Open both tables only when exactly two runs are selected, and Clear selection once any is", async () => {
    await start();
    const open = () => screen.queryByRole("button", { name: /open both tables/i });
    const clear = () => screen.queryByRole("button", { name: /clear selection/i });
    expect(open()).toBeNull();
    expect(clear()).toBeNull(); // nothing selected: no bar at all
    await select("lab / 1");
    expect(open()).toBeNull();
    expect(clear()).not.toBeNull();
    await select("lab / 2");
    expect(open()).not.toBeNull();
    expect((open() as HTMLButtonElement).disabled).toBe(false);
    await select("lab / 2");
    expect(open()).toBeNull();
  });

  it("adds no panel of its own when two runs are selected: they stay where they are in the list, highlighted", async () => {
    await start();
    await select("lab / 1");
    await select("lab / 2");
    expect(screen.queryByRole("group", { name: /comparing/i })).toBeNull();
    expect(document.querySelectorAll("[data-run-id]")).toHaveLength(3); // no second copy of a run anywhere
    expect(document.querySelectorAll("[data-selected]")).toHaveLength(2);
  });

  it("opens both tables side by side, each with its own playhead", async () => {
    await start();
    await select("lab / 1");
    await select("lab / 2");
    await fireEvent.click(screen.getByRole("button", { name: /open both tables/i }));
    const regions = await screen.findAllByRole("region", { name: /run/i });
    expect(regions).toHaveLength(2);
    const calls = (r: HTMLElement) => within(r).getByLabelText(/calls so far/i).textContent?.trim();
    await fireEvent.click(within(regions[0]!).getByRole("button", { name: /step forward/i }));
    await fireEvent.click(within(regions[0]!).getByRole("button", { name: /step forward/i }));
    expect(calls(regions[0]!)).toBe("2");
    expect(calls(regions[1]!)).toBe("0");
    expect(live.n).toBe(2);
  });

  it("has no way to add a second table from an open one: a comparison always starts from the list, and closing one leaves the other", async () => {
    await start();
    await fireEvent.click(screen.getByRole("button", { name: /^lab \/ 1\b/ }));
    await screen.findByRole("region", { name: /run/i });
    expect(screen.queryByRole("button", { name: /open beside/i })).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: /close table/i }));
    await select("lab / 1");
    await select("lab / 3");
    await fireEvent.click(screen.getByRole("button", { name: /open both tables/i }));
    await waitFor(() => expect(screen.getAllByRole("region", { name: /run/i })).toHaveLength(2));
    expect(live.n).toBe(2);
    await fireEvent.click(within(screen.getAllByRole("region", { name: /run/i })[0]!).getByRole("button", { name: /close table/i }));
    await waitFor(() => expect(screen.getAllByRole("region", { name: /run/i })).toHaveLength(1));
    expect(live.n).toBe(1);
  });

  // The comparison panel above the list repeats the selected runs' ids, so look in the list itself: the last match.
  const item = (n: number) => [...document.querySelectorAll(`[data-run-id="${String(n).padStart(16, "0")}"]`)].at(-1) as HTMLElement;

  it("has no checkboxes anywhere, in the list or the grid", async () => {
    await start();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    await fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("marks a shift-clicked row as selected, in the document and for a screen reader, and shift-clicking again clears it", async () => {
    await start();
    expect(item(1).hasAttribute("data-selected")).toBe(false);
    await select("lab / 1");
    expect(item(1).hasAttribute("data-selected")).toBe(true);
    expect(item(1).querySelector("[data-open]")!.className).toMatch(/ring-highlight-yellow/);
    expect(within(item(1)).getByText("Selected for comparison")).toBeTruthy();
    await select("lab / 1");
    expect(item(1).hasAttribute("data-selected")).toBe(false);
    expect(within(item(1)).queryByText("Selected for comparison")).toBeNull();
  });

  it("selects when the shift-click lands anywhere on the row, not only on its name, and opens nothing", async () => {
    await start();
    await fireEvent.click(within(item(2)).getByText("workshop"), { shiftKey: true });
    expect(item(2).hasAttribute("data-selected")).toBe(true);
    expect(screen.queryByRole("region", { name: /run/i })).toBeNull();
  });

  it("opens a run on a plain click, and does not select it", async () => {
    await start();
    await fireEvent.click(screen.getByRole("button", { name: /^lab \/ 1\b/ }));
    await screen.findByRole("region", { name: /run/i });
    expect(document.querySelector("[data-selected]")).toBeNull();
  });

  it("selects tiles in the grid the same way, with a highlighted border, and a plain click on the tile opens it", async () => {
    await start();
    await fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    const tile = within(item(3)).getByRole("button");
    await fireEvent.click(tile, { shiftKey: true });
    expect(item(3).hasAttribute("data-selected")).toBe(true);
    expect(tile.className).toMatch(/ring-highlight-yellow/);
    expect(screen.queryByRole("region", { name: /run/i })).toBeNull();
    await fireEvent.click(tile);
    await screen.findByRole("region", { name: /run/i });
  });

  it("keeps only the last two selected, and says nothing about how many are chosen", async () => {
    await start();
    await select("lab / 1");
    await select("lab / 2");
    await select("lab / 3");
    expect([1, 2, 3].map((n) => item(n).hasAttribute("data-selected"))).toEqual([false, true, true]);
    expect(document.body.textContent).not.toMatch(/\d+ runs? selected/i);
    expect(document.body.textContent).not.toMatch(/shift-click one more/i);
  });

  it("clears the selection with its own button", async () => {
    await start();
    await select("lab / 1");
    await fireEvent.click(screen.getByRole("button", { name: /clear selection/i }));
    expect(document.querySelector("[data-selected]")).toBeNull();
  });

  it("is reachable from the keyboard: every run is a button, and a keyboard click carries the shift key", async () => {
    await start();
    const button = screen.getByRole("button", { name: /^lab \/ 2\b/ });
    expect(button.tagName).toBe("BUTTON");
    await select("lab / 2"); // what the browser does for Shift+Enter or Shift+Space on a focused button
    expect(item(2).hasAttribute("data-selected")).toBe(true);
  });
});
