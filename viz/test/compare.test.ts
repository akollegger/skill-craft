import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";
import { createScenePool } from "../src/scene/pool.ts";
import type { SceneFactory, SceneHandle } from "../src/scene/handle.ts";
import { closeRun, initialSelection, openRun, tickRun, type Selection } from "../src/state/selection.ts";
import { sampleBundle } from "./helpers/bundle.ts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("selection", () => {
  const empty = initialSelection();
  it("ticks up to two runs, dropping the oldest tick for a third, and unticks", () => {
    let s: Selection = tickRun(empty, "a");
    s = tickRun(s, "b");
    expect(s.ticked).toEqual(["a", "b"]);
    s = tickRun(s, "c");
    expect(s.ticked).toEqual(["b", "c"]);
    expect(tickRun(s, "b").ticked).toEqual(["c"]);
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

  it("opens exactly the two ticked runs when asked to compare", () => {
    const s = tickRun(tickRun(empty, "x"), "y");
    expect(openRun(openRun({ ...s, open: [] }, s.ticked[0]!), s.ticked[1]!).open).toEqual(["x", "y"]);
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
  const tick = (name: RegExp) => screen.getByRole("checkbox", { name });
  const start = async () => {
    serve();
    live.n = 0;
    render(App, { createScene: scene });
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBeGreaterThan(2));
    await fireEvent.change(screen.getByLabelText("Group by"), { target: { value: "" } });
  };

  it("enables Compare only when two runs are ticked", async () => {
    await start();
    const compare = screen.getByRole("button", { name: /open both tables/i }) as HTMLButtonElement;
    expect(compare.disabled).toBe(true);
    await fireEvent.click(tick(/compare lab \/ 1/i));
    expect(compare.disabled).toBe(true);
    await fireEvent.click(tick(/compare lab \/ 2/i));
    expect(compare.disabled).toBe(false);
  });

  it("shows two ticked runs together as aligned rows in the list", async () => {
    await start();
    await fireEvent.click(tick(/compare lab \/ 1/i));
    await fireEvent.click(tick(/compare lab \/ 2/i));
    const panel = screen.getByRole("group", { name: /comparing/i });
    const rows = within(panel).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("forge");
    expect(rows[1]!.textContent).toContain("workshop"); // a different world is accepted
    expect(rows[0]!.className).toBe(rows[1]!.className); // the same columns, so attributes line up
  });

  it("opens both tables side by side, each with its own playhead", async () => {
    await start();
    await fireEvent.click(tick(/compare lab \/ 1/i));
    await fireEvent.click(tick(/compare lab \/ 2/i));
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

  it("opens a second table beside the first, and closing one leaves the other", async () => {
    await start();
    await fireEvent.click(screen.getByRole("button", { name: "lab / 1" }));
    await screen.findByRole("region", { name: /run/i });
    await fireEvent.click(screen.getByRole("button", { name: /open beside/i }));
    await fireEvent.click(await screen.findByRole("button", { name: "lab / 3" }));
    await waitFor(() => expect(screen.getAllByRole("region", { name: /run/i })).toHaveLength(2));
    expect(live.n).toBe(2);
    await fireEvent.click(within(screen.getAllByRole("region", { name: /run/i })[0]!).getByRole("button", { name: /close table/i }));
    await waitFor(() => expect(screen.getAllByRole("region", { name: /run/i })).toHaveLength(1));
    expect(live.n).toBe(1);
  });
});
