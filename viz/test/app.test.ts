import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";
import type { SceneFactory } from "../src/scene/handle.ts";
import { sampleBundle } from "./helpers/bundle.ts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const entry = (run: string, world: string) => {
  const id = run.padStart(16, "0");
  return { id, kind: "run", status: "ready", attributes: { label: "lab", run, world, outcome: "reached", actionCalls: 3 }, preview: { strip: "pc", table: [] }, bundle: `bundles/${id}/` };
};
const serve = (body: unknown, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

describe("the page", () => {
  it("loads the catalog and lists the runs grouped by world", async () => {
    serve({ format: 1, runs: [entry("1", "forge"), entry("2", "forge"), entry("3", "workshop")] });
    render(App);
    expect(screen.getByRole("status").textContent).toContain("Loading");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(3));
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([expect.stringContaining("forge"), expect.stringContaining("workshop")]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Skillcraft visualizer");
  });

  it("says when the folder has no runs", async () => {
    serve({ format: 1, runs: [] });
    render(App);
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/no runs found/i));
  });

  it("says when the data is in a format it does not read", async () => {
    serve({ format: 2, runs: [] });
    render(App);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("format 2"));
  });

  it("says when the catalog cannot be loaded", async () => {
    serve({}, 500);
    render(App);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("500"));
  });

  describe("opening a run", () => {
    const scene: SceneFactory = () => ({ show() {}, destroy() {} });
    const id = "0000000000000001";
    const bundle = sampleBundle();
    const served = (over: Record<string, Response | (() => Response)> = {}) =>
      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        const o = over[url];
        if (o) return typeof o === "function" ? o() : o;
        const files: Record<string, string> = {
          "catalog.json": JSON.stringify({ format: 1, runs: [entry("1", "forge")] }),
          [`bundles/${id}/bundle.json`]: JSON.stringify(bundle.manifest),
          [`bundles/${id}/frames.jsonl`]: bundle.frames.map((f) => JSON.stringify(f)).join("\n") + "\n",
          [`bundles/${id}/trace.jsonl`]: bundle.trace.map((t) => JSON.stringify(t)).join("\n") + "\n",
          [`bundles/${id}/score.json`]: JSON.stringify(bundle.result),
        };
        return files[url] === undefined ? new Response("no", { status: 404 }) : new Response(files[url], { status: 200 });
      }));

    it("shows the table for the run that was chosen, and returns to the list when it is closed", async () => {
      served();
      render(App, { createScene: scene });
      await fireEvent.click(await screen.findByRole("button", { name: /lab \/ 1/ }));
      expect(await screen.findByRole("region", { name: /run/i })).toBeTruthy();
      await fireEvent.click(screen.getByRole("button", { name: /close table/i }));
      expect(await screen.findAllByRole("listitem")).toHaveLength(1);
    });

    it("says it is opening while the bundle loads", async () => {
      const held: ((r: Response) => void)[] = [];
      vi.stubGlobal("fetch", vi.fn((url: string) =>
        url === "catalog.json" ? Promise.resolve(new Response(JSON.stringify({ format: 1, runs: [entry("1", "forge")] }))) : new Promise<Response>((r) => held.push(r)),
      ));
      render(App, { createScene: scene });
      await fireEvent.click(await screen.findByRole("button", { name: /lab \/ 1/ }));
      expect((await screen.findByRole("status")).textContent).toContain("Opening lab / 1");
      for (const release of held) release(new Response("", { status: 500 }));
      await screen.findByRole("alert");
    });

    it("says why a run could not be opened and lets the person go back", async () => {
      served({ [`bundles/${id}/frames.jsonl`]: new Response("no", { status: 500 }) });
      render(App, { createScene: scene });
      await fireEvent.click(await screen.findByRole("button", { name: /lab \/ 1/ }));
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Can't open lab / 1");
      expect(alert.textContent).toContain("500");
      await fireEvent.click(screen.getByRole("button", { name: /back to the runs/i }));
      expect(await screen.findAllByRole("listitem")).toHaveLength(1);
    });
  });
});
